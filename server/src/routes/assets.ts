import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import multer from 'multer'
import {
  analyzeAsset,
  CloudinaryAnalysisError,
  IMAGE_PREPROCESSING,
  uploadBuffer,
  videoPosterUrl,
} from '../lib/cloudinary.js'
import { bumpData, cached } from '../lib/cache.js'
import { observationText } from '../lib/lexicon.js'
import { getDb } from '../lib/mongo.js'
import { readCaptureDate } from '../lib/exif.js'
import { dHash } from '../lib/phash.js'
import { semanticSearch } from '../lib/semantic.js'
import { verifyAsset, type VerifyContext } from '../lib/verify.js'
import type { AssetDocument, LocationDocument, ProjectDocument } from '../lib/models.js'

export const assetsRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — field video can be large
})

function serializeAsset(
  asset: AssetDocument,
  project: Pick<ProjectDocument, 'name'>,
  location: Pick<LocationDocument, 'name'> | null,
  extra: { observationError?: string; match?: { score: number; expandedVia: string[] }; light?: boolean } = {},
) {
  return {
    id: asset._id.toHexString(),
    cloudinaryPublicId: asset.cloudinaryPublicId,
    cloudinaryUrl: asset.cloudinaryUrl,
    cloudinaryVersion: asset.cloudinaryVersion,
    resourceType: asset.resourceType,
    projectName: project.name,
    location: location?.name ?? 'Unknown',
    stage: asset.stage ?? null,
    capturedAt: asset.capturedAt?.toISOString() ?? null,
    exifCapturedAt: asset.exifCapturedAt?.toISOString() ?? null,
    verificationStatus: asset.verificationStatus,
    verificationNote: asset.verificationNote,
    // Full check details and transformation history are only sent on the detail
    // endpoint (`light` = list view), which keeps the library payload small.
    verification: extra.light ? null : (asset.verification ?? null),
    transformations: extra.light ? [] : (asset.transformations ?? []),
    observation: asset.observation,
    // Present only on the upload response, and only when analysis was
    // attempted and failed — never fabricated in its place. See
    // ARCHITECTURE.md § M2 for why the upload still succeeds in this case.
    ...(extra.observationError ? { observationError: extra.observationError } : {}),
    ...(extra.match ? { match: extra.match } : {}),
    createdAt: asset.createdAt.toISOString(),
  }
}

/** All assets with their project names — the reference set for the
 * duplicate and project-theme checks. Fine at hackathon scale; index
 * perceptualHash / use a BK-tree before this holds tens of thousands. */
async function loadLibrary(db: Db): Promise<VerifyContext['others']> {
  const [assets, projects] = await Promise.all([
    db
      .collection<AssetDocument>('assets')
      .find({}, { projection: { observation: 1, perceptualHash: 1, projectId: 1, stage: 1, createdAt: 1 } })
      .toArray(),
    db.collection<ProjectDocument>('projects').find({}).toArray(),
  ])
  const names = new Map(projects.map((p) => [p._id.toHexString(), p.name]))
  return assets.map((a) => ({ ...a, projectName: names.get(a.projectId.toHexString()) ?? 'Unknown' }))
}

async function reverify(db: Db, asset: AssetDocument): Promise<AssetDocument> {
  const [project, location, others] = await Promise.all([
    db.collection<ProjectDocument>('projects').findOne({ _id: asset.projectId }),
    asset.locationId ? db.collection<LocationDocument>('locations').findOne({ _id: asset.locationId }) : null,
    loadLibrary(db),
  ])
  const result = verifyAsset({
    asset,
    projectName: project?.name ?? 'Unknown',
    projectDescription: project?.description,
    locationName: location?.name ?? null,
    others,
  })
  const patch = {
    verificationStatus: result.status,
    verificationNote: result.note,
    verification: result.verification,
    updatedAt: new Date(),
  }
  await db.collection<AssetDocument>('assets').updateOne({ _id: asset._id }, { $set: patch })
  bumpData()
  return { ...asset, ...patch }
}

assetsRouter.get('/', async (req, res, next) => {
  try {
    const body = await cached('assets:' + req.originalUrl, async () => {
      const db = getDb()
      const query = String(req.query.q ?? '').trim()
      const projectFilter = String(req.query.project ?? '').trim()
      const locationFilter = String(req.query.location ?? '').trim()
      const statusFilter = String(req.query.status ?? '').trim()

      const pipeline: object[] = [
        { $sort: { createdAt: -1 } },
        { $lookup: { from: 'projects', localField: 'projectId', foreignField: '_id', as: 'project' } },
        { $lookup: { from: 'locations', localField: 'locationId', foreignField: '_id', as: 'location' } },
      ]

      const matchConditions: object[] = []
      if (projectFilter) matchConditions.push({ 'project.name': { $regex: escapeRegex(projectFilter), $options: 'i' } })
      if (locationFilter) matchConditions.push({ 'location.name': { $regex: escapeRegex(locationFilter), $options: 'i' } })
      if (statusFilter) matchConditions.push({ verificationStatus: statusFilter.toUpperCase() })
      if (matchConditions.length > 0) pipeline.push({ $match: { $and: matchConditions } })

      pipeline.push({ $limit: 500 })
      pipeline.push({ $project: { asset: '$$ROOT', project: 1, location: 1 } })

      const rows = await db
        .collection<AssetDocument>('assets')
        .aggregate<{ asset: AssetDocument; project: ProjectDocument[]; location: LocationDocument[] }>(pipeline)
        .toArray()

      let out = rows.map((row) => ({
        asset: row.asset,
        project: row.project[0] ?? { name: 'Unknown' },
        location: row.location[0] ?? null,
        match: undefined as { score: number; expandedVia: string[] } | undefined,
      }))

      if (query) {
        // Ranked, concept-aware search over what the AI saw plus the filing
        // metadata — see lib/semantic.ts. Only relevant assets are returned.
        const docs = out.map((r) => ({
          id: r.asset._id.toHexString(),
          text: [observationText(r.asset.observation), r.project.name, r.location?.name, r.asset.stage]
            .filter(Boolean)
            .join(' '),
        }))
        const hits = new Map(semanticSearch(docs, query).map((h) => [h.id, h]))
        out = out
          .filter((r) => hits.has(r.asset._id.toHexString()))
          .map((r) => {
            const h = hits.get(r.asset._id.toHexString())!
            return { ...r, match: { score: h.score, expandedVia: h.expandedVia } }
          })
          .sort((a, b) => b.match!.score - a.match!.score)
      }

      return out.slice(0, 100).map((r) => serializeAsset(r.asset, r.project, r.location, { match: r.match, light: true }))
    })
    res.json(body)
  } catch (err) {
    next(err)
  }
})

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Re-runs verification for every asset (e.g. after more evidence arrived, since
 * the project-theme and duplicate checks depend on the rest of the library). */
assetsRouter.post('/reverify-all', async (_req, res, next) => {
  try {
    const db = getDb()
    const all = await db.collection<AssetDocument>('assets').find({}).sort({ createdAt: 1 }).toArray()
    const summary = { VERIFIED: 0, UNVERIFIED: 0, FLAGGED: 0 }
    for (const a of all) {
      const updated = await reverify(db, a)
      summary[updated.verificationStatus]++
    }
    res.json({ total: all.length, ...summary })
  } catch (err) {
    next(err)
  }
})

assetsRouter.get('/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: 'invalid asset id' })
      return
    }
    const body = await cached('asset:' + req.params.id, async () => {
      const db = getDb()
      const asset = await db.collection<AssetDocument>('assets').findOne({ _id: new ObjectId(req.params.id) })
      if (!asset) return null
      const [project, location] = await Promise.all([
        db.collection<ProjectDocument>('projects').findOne({ _id: asset.projectId }),
        asset.locationId ? db.collection<LocationDocument>('locations').findOne({ _id: asset.locationId }) : null,
      ])
      return serializeAsset(asset, project ?? { name: 'Unknown' }, location)
    })
    if (!body) {
      res.status(404).json({ error: 'asset not found' })
      return
    }
    res.json(body)
  } catch (err) {
    next(err)
  }
})

assetsRouter.post('/:id/reverify', async (req, res, next) => {
  try {
    const db = getDb()
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: 'invalid asset id' })
      return
    }
    const asset = await db.collection<AssetDocument>('assets').findOne({ _id: new ObjectId(req.params.id) })
    if (!asset) {
      res.status(404).json({ error: 'asset not found' })
      return
    }
    const updated = await reverify(db, asset)
    const [project, location] = await Promise.all([
      db.collection<ProjectDocument>('projects').findOne({ _id: asset.projectId }),
      asset.locationId ? db.collection<LocationDocument>('locations').findOne({ _id: asset.locationId }) : null,
    ])
    res.json(serializeAsset(updated, project ?? { name: 'Unknown' }, location))
  } catch (err) {
    next(err)
  }
})

assetsRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file
    const projectName = String(req.body.project ?? '').trim()
    const locationName = String(req.body.location ?? '').trim()
    const stage = String(req.body.stage ?? '').trim() || null
    const capturedRaw = String(req.body.capturedAt ?? '').trim()
    const capturedAt = capturedRaw ? new Date(capturedRaw) : null

    if (!file) {
      res.status(400).json({ error: 'file is required' })
      return
    }
    if (!projectName || !locationName) {
      res.status(400).json({ error: 'project and location are required' })
      return
    }
    if (capturedAt && Number.isNaN(capturedAt.getTime())) {
      res.status(400).json({ error: 'capturedAt must be a valid date' })
      return
    }

    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image'
    const db = getDb()
    const now = new Date()

    const projects = db.collection<ProjectDocument>('projects')
    const project = await projects.findOneAndUpdate(
      { name: projectName },
      {
        $setOnInsert: { name: projectName, description: null, createdAt: now },
        $set: { updatedAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    )
    if (!project) throw new Error('Failed to upsert project')

    const locations = db.collection<LocationDocument>('locations')
    const location = await locations.findOneAndUpdate(
      { projectId: project._id, name: locationName },
      { $setOnInsert: { projectId: project._id, name: locationName, createdAt: now } },
      { upsert: true, returnDocument: 'after' },
    )
    if (!location) throw new Error('Failed to upsert location')

    // Perceptual hash of the raw bytes, taken before Cloudinary's
    // pre-processing so the same source photo always hashes the same.
    let perceptualHash: string | null = null
    let exifCapturedAt: Date | null = null
    if (resourceType === 'image') {
      try {
        ;[perceptualHash, exifCapturedAt] = await Promise.all([dHash(file.buffer), readCaptureDate(file.buffer)])
      } catch (err) {
        console.error('Perceptual hash failed (image unreadable?):', err)
      }
    }

    const uploaded = await uploadBuffer(file.buffer, {
      folder: `visevi/${project._id.toHexString()}`,
      resourceType,
    })

    // A failure here does not fail the upload — the asset and its
    // Cloudinary media are already real and traceable; the observation is
    // just absent, with the reason stated explicitly rather than invented.
    // Video is analysed through a still frame (AI Vision is image-only).
    let observation: AssetDocument['observation'] = null
    let observationError: string | undefined
    try {
      observation = await analyzeAsset(
        resourceType === 'image'
          ? { assetId: uploaded.assetId, url: uploaded.url }
          : { assetId: null, url: videoPosterUrl(uploaded.url) },
      )
      if (resourceType === 'video' && observation) {
        observation.source += ' (video frame @1s)'
      }
    } catch (err) {
      observationError =
        err instanceof CloudinaryAnalysisError ? err.message : 'AI analysis failed unexpectedly'
      console.error('Cloudinary AI Vision analysis failed:', err)
    }

    const assetDoc: Omit<AssetDocument, '_id'> = {
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryAssetId: uploaded.assetId ?? null,
      cloudinaryUrl: uploaded.url,
      cloudinaryVersion: uploaded.version,
      resourceType,
      projectId: project._id,
      locationId: location._id,
      capturedAt,
      // From the original bytes: Cloudinary's response can't provide it (see lib/exif.ts).
      exifCapturedAt: exifCapturedAt ?? uploaded.exifCapturedAt,
      stage,
      observation,
      verificationStatus: 'UNVERIFIED',
      verificationNote: null,
      verification: null,
      perceptualHash,
      transformations:
        resourceType === 'image' ? IMAGE_PREPROCESSING.map((t) => ({ ...t })) : [],
      createdAt: now,
      updatedAt: now,
    }

    const insertResult = await db.collection<AssetDocument>('assets').insertOne(assetDoc as AssetDocument)
    bumpData()
    let asset: AssetDocument = { ...assetDoc, _id: insertResult.insertedId }

    // Verify against the rest of the library now that the asset is persisted.
    asset = await reverify(db, asset)

    res.status(201).json(serializeAsset(asset, project, location, { observationError }))
  } catch (err) {
    next(err)
  }
})

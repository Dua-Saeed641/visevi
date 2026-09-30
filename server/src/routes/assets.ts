import { Router } from 'express'
import { ObjectId } from 'mongodb'
import multer from 'multer'
import { cached } from '../lib/cache.js'
import { ingestAsset, reverify } from '../lib/ingest.js'
import { observationText } from '../lib/lexicon.js'
import { getDb } from '../lib/mongo.js'
import { semanticSearch } from '../lib/semantic.js'
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
    capture: asset.capture ?? null,
    // Present only on the upload response, and only when analysis was
    // attempted and failed — never fabricated in its place. See
    // ARCHITECTURE.md § M2 for why the upload still succeeds in this case.
    ...(extra.observationError ? { observationError: extra.observationError } : {}),
    ...(extra.match ? { match: extra.match } : {}),
    createdAt: asset.createdAt.toISOString(),
  }
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

    const lat = req.body.lat !== undefined && req.body.lat !== '' ? Number(req.body.lat) : null
    const lng = req.body.lng !== undefined && req.body.lng !== '' ? Number(req.body.lng) : null

    // A client may say "this is a NASA Worldview snapshot" (sourceKind + halfDeg).
    // The server does not take that on trust: ingestAsset re-requests the snapshot
    // from NASA and only marks it verified if the upload matches.
    let capture: { halfDeg: number; date: string; trusted: boolean } | undefined
    if (req.body.sourceKind === 'nasa-worldview') {
      const halfDeg = Number(req.body.halfDeg)
      if (!capturedAt || !Number.isFinite(halfDeg) || halfDeg <= 0 || halfDeg > 5 || lat === null || lng === null) {
        res.status(400).json({ error: 'a nasa-worldview snapshot needs capturedAt, lat, lng and a halfDeg between 0 and 5' })
        return
      }
      capture = { halfDeg, date: capturedAt.toISOString().slice(0, 10), trusted: false }
    }

    const { asset, project, location, observationError } = await ingestAsset(getDb(), {
      buffer: file.buffer,
      mimetype: file.mimetype,
      projectName,
      locationName,
      stage,
      capturedAt,
      lat,
      lng,
      capture,
    })
    res.status(201).json(serializeAsset(asset, project, location, { observationError }))
  } catch (err) {
    next(err)
  }
})

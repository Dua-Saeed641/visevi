import { Router } from 'express'
import multer from 'multer'
import { analyzeAsset, CloudinaryAnalysisError, uploadBuffer } from '../lib/cloudinary.js'
import { getDb } from '../lib/mongo.js'
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
  observationError?: string,
) {
  return {
    id: asset._id.toHexString(),
    cloudinaryPublicId: asset.cloudinaryPublicId,
    cloudinaryUrl: asset.cloudinaryUrl,
    projectName: project.name,
    location: location?.name ?? 'Unknown',
    verificationStatus: asset.verificationStatus,
    observation: asset.observation,
    // Present only on the upload response, and only when analysis was
    // attempted and failed — never fabricated in its place. See
    // ARCHITECTURE.md § M2 for why the upload still succeeds in this case.
    ...(observationError ? { observationError } : {}),
    createdAt: asset.createdAt.toISOString(),
  }
}

assetsRouter.get('/', async (_req, res, next) => {
  try {
    const db = getDb()

    const results = await db
      .collection<AssetDocument>('assets')
      .aggregate<{
        asset: AssetDocument
        project: ProjectDocument[]
        location: LocationDocument[]
      }>([
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
        {
          $lookup: {
            from: 'projects',
            localField: 'projectId',
            foreignField: '_id',
            as: 'project',
          },
        },
        {
          $lookup: {
            from: 'locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'location',
          },
        },
        {
          $project: {
            asset: '$$ROOT',
            project: 1,
            location: 1,
          },
        },
      ])
      .toArray()

    res.json(
      results.map((row) =>
        serializeAsset(row.asset, row.project[0] ?? { name: 'Unknown' }, row.location[0] ?? null),
      ),
    )
  } catch (err) {
    next(err)
  }
})

assetsRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file
    const projectName = String(req.body.project ?? '').trim()
    const locationName = String(req.body.location ?? '').trim()

    if (!file) {
      res.status(400).json({ error: 'file is required' })
      return
    }
    if (!projectName || !locationName) {
      res.status(400).json({ error: 'project and location are required' })
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

    const uploaded = await uploadBuffer(file.buffer, {
      folder: `visevi/${project._id.toHexString()}`,
      resourceType,
    })

    // AI Vision analyzes images only. A failure here does not fail the
    // upload — the asset and its Cloudinary media are already real and
    // traceable; the observation is just absent, with the reason stated
    // explicitly rather than invented. See lib/cloudinary.ts § AI Vision
    // analysis for why this can fail (add-on not enabled, quota, etc.).
    let observation: AssetDocument['observation'] = null
    let observationError: string | undefined
    if (resourceType === 'image') {
      try {
        observation = await analyzeAsset({ assetId: uploaded.assetId, url: uploaded.url })
      } catch (err) {
        observationError =
          err instanceof CloudinaryAnalysisError ? err.message : 'AI analysis failed unexpectedly'
        console.error('Cloudinary AI Vision analysis failed:', err)
      }
    } else {
      observationError = 'AI analysis is only implemented for images, not video, yet'
    }

    const assets = db.collection<AssetDocument>('assets')
    const assetDoc: Omit<AssetDocument, '_id'> = {
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryAssetId: uploaded.assetId ?? null,
      cloudinaryUrl: uploaded.url,
      cloudinaryVersion: uploaded.version,
      resourceType,
      projectId: project._id,
      locationId: location._id,
      capturedAt: null,
      stage: null,
      observation,
      verificationStatus: 'UNVERIFIED',
      verificationNote: null,
      perceptualHash: null,
      createdAt: now,
      updatedAt: now,
    }

    const insertResult = await assets.insertOne(assetDoc as AssetDocument)
    const asset: AssetDocument = { ...assetDoc, _id: insertResult.insertedId }

    res.status(201).json(serializeAsset(asset, project, location, observationError))
  } catch (err) {
    next(err)
  }
})

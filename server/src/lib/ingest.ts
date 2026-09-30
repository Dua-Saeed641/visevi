import type { Db } from 'mongodb'
import { bumpData } from './cache.js'
import { analyzeAsset, CloudinaryAnalysisError, IMAGE_PREPROCESSING, uploadBuffer, videoPosterUrl } from './cloudinary.js'
import { readCaptureDate } from './exif.js'
import type { AssetDocument, LocationDocument, ProjectDocument } from './models.js'
import { dHash } from './phash.js'
import { verifyAsset, type VerifyContext } from './verify.js'
import { verifyProvenance, WORLDVIEW_LAYER } from './worldview.js'

/** All assets with their project names: the reference set for the duplicate and
 * project-theme checks. Fine at hackathon scale; index perceptualHash / use a
 * BK-tree before this holds tens of thousands. */
export async function loadLibrary(db: Db): Promise<VerifyContext['others']> {
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

export async function reverify(db: Db, asset: AssetDocument): Promise<AssetDocument> {
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

export interface IngestInput {
  buffer: Buffer
  mimetype: string
  projectName: string
  locationName: string
  stage: string | null
  capturedAt: Date | null
  lat?: number | null
  lng?: number | null
  /** Present when the media is a NASA Worldview snapshot. `trusted` means VisEvi
   * fetched it itself; otherwise the claim is checked by re-requesting it from NASA. */
  capture?: { halfDeg: number; date: string; trusted: boolean }
}

export interface IngestResult {
  asset: AssetDocument
  project: ProjectDocument
  location: LocationDocument
  observationError?: string
}

/**
 * The one path media takes into VisEvi, used by the upload API and by the
 * automatic capture: register project and location, fingerprint, upload to
 * Cloudinary with pre-processing, run AI analysis, store, then verify.
 * A failure of AI analysis does not fail the ingest (see ARCHITECTURE.md § M2).
 */
export async function ingestAsset(db: Db, input: IngestInput): Promise<IngestResult> {
  const resourceType = input.mimetype.startsWith('video/') ? 'video' : 'image'
  const now = new Date()

  const projects = db.collection<ProjectDocument>('projects')
  const project = await projects.findOneAndUpdate(
    { name: input.projectName },
    { $setOnInsert: { name: input.projectName, description: null, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true, returnDocument: 'after' },
  )
  if (!project) throw new Error('Failed to upsert project')

  const locations = db.collection<LocationDocument>('locations')
  const location = await locations.findOneAndUpdate(
    { projectId: project._id, name: input.locationName },
    { $setOnInsert: { projectId: project._id, name: input.locationName, createdAt: now } },
    { upsert: true, returnDocument: 'after' },
  )
  if (!location) throw new Error('Failed to upsert location')

  // Optional coordinates make this location a monitored site for the
  // temperature-signal pipeline (routes/signals.ts).
  const lat = input.lat ?? null
  const lng = input.lng ?? null
  const hasCoords = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  if (hasCoords) {
    await locations.updateOne({ _id: location._id }, { $set: { lat, lng } })
    location.lat = lat
    location.lng = lng
  }

  // Perceptual hash of the raw bytes, taken before Cloudinary's pre-processing
  // so the same source photo always hashes the same.
  let perceptualHash: string | null = null
  let exifCapturedAt: Date | null = null
  if (resourceType === 'image') {
    try {
      ;[perceptualHash, exifCapturedAt] = await Promise.all([dHash(input.buffer), readCaptureDate(input.buffer)])
    } catch (err) {
      console.error('Perceptual hash failed (image unreadable?):', err)
    }
  }

  // Provenance for NASA snapshots: confirmed with NASA unless VisEvi fetched it itself.
  let capture: AssetDocument['capture'] = null
  if (input.capture && resourceType === 'image' && hasCoords) {
    const base = { kind: 'nasa-worldview' as const, layer: WORLDVIEW_LAYER, lat: lat as number, lng: lng as number, halfDeg: input.capture.halfDeg, date: input.capture.date }
    if (input.capture.trusted) {
      capture = { ...base, provenance: 'system', note: `Captured by VisEvi directly from NASA Worldview for ${(lat as number).toFixed(2)}, ${(lng as number).toFixed(2)} on ${input.capture.date}.` }
    } else {
      const p = await verifyProvenance(input.buffer, base)
      capture = { ...base, provenance: p.ok ? 'verified' : 'failed', note: p.note }
    }
  }

  const uploaded = await uploadBuffer(input.buffer, {
    folder: `visevi/${project._id.toHexString()}`,
    resourceType,
  })

  // Video is analysed through a still frame (AI Vision is image-only).
  let observation: AssetDocument['observation'] = null
  let observationError: string | undefined
  try {
    observation = await analyzeAsset(
      resourceType === 'image'
        ? { assetId: uploaded.assetId, url: uploaded.url }
        : { assetId: null, url: videoPosterUrl(uploaded.url) },
    )
    if (resourceType === 'video' && observation) observation.source += ' (video frame @1s)'
  } catch (err) {
    observationError = err instanceof CloudinaryAnalysisError ? err.message : 'AI analysis failed unexpectedly'
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
    capturedAt: input.capturedAt,
    // From the original bytes: Cloudinary's response can't provide it (see lib/exif.ts).
    exifCapturedAt: exifCapturedAt ?? uploaded.exifCapturedAt,
    stage: input.stage,
    observation,
    verificationStatus: 'UNVERIFIED',
    verificationNote: null,
    verification: null,
    perceptualHash,
    transformations: resourceType === 'image' ? IMAGE_PREPROCESSING.map((t) => ({ ...t })) : [],
    capture,
    createdAt: now,
    updatedAt: now,
  }
  const inserted = await db.collection<AssetDocument>('assets').insertOne(assetDoc as AssetDocument)
  bumpData()
  // Verify against the rest of the library now that the asset is persisted.
  const asset = await reverify(db, { ...assetDoc, _id: inserted.insertedId })
  return { asset, project, location, observationError }
}

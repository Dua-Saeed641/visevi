/**
 * Gives already-seeded satellite assets their provenance record.
 *
 * Assets uploaded before provenance existed carry no `capture` field, so the
 * claim-based checks judge them (wrongly: a satellite view has no claim). For
 * each one this re-requests the snapshot from NASA (site coordinates, capture
 * date) and compares it with the stored image. Stored images went through
 * Cloudinary's enhance/sharpen pass, so the tolerance is looser than for a raw
 * upload. Only assets that match are marked; the rest are left untouched.
 *
 *   npm run backfill:capture
 */
import type { AssetDocument, LocationDocument, ProjectDocument } from '../lib/models.js'
import { closeMongo, connectMongo } from '../lib/mongo.js'
import { dHash, hammingDistance } from '../lib/phash.js'
import { SATELLITE_SITES } from '../lib/satelliteSites.js'
import { fetchSnapshot, WORLDVIEW_LAYER } from '../lib/worldview.js'
import { reverify } from '../lib/ingest.js'

const TOLERANCE = 30 // stored copy vs NASA original: enhance + sharpen + re-encode

const db = await connectMongo()
const projects = await db.collection<ProjectDocument>('projects').find({ name: { $in: SATELLITE_SITES.map((s) => s.project) } }).toArray()
const assets = await db
  .collection<AssetDocument>('assets')
  .find({ projectId: { $in: projects.map((p) => p._id) }, capture: { $in: [null, undefined] } })
  .toArray()
console.log(`${assets.length} satellite asset(s) without provenance`)

let marked = 0
let mismatched = 0
for (const a of assets) {
  const project = projects.find((p) => p._id.equals(a.projectId))
  const site = SATELLITE_SITES.find((s) => s.project === project?.name)
  const loc = a.locationId ? await db.collection<LocationDocument>('locations').findOne({ _id: a.locationId }) : null
  if (!site || !a.capturedAt || !loc) continue
  const date = a.capturedAt.toISOString().slice(0, 10)
  try {
    const nasa = await fetchSnapshot(site.lat, site.lng, site.half, date)
    const stored = Buffer.from(await (await fetch(a.cloudinaryUrl)).arrayBuffer())
    if (!nasa) throw new Error('NASA returned no snapshot')
    const distance = hammingDistance(await dHash(stored), await dHash(nasa))
    if (distance > TOLERANCE) {
      mismatched++
      console.log(`  ${site.name} ${date}: does not match NASA (distance ${distance}), left as is`)
      continue
    }
    await db.collection<AssetDocument>('assets').updateOne(
      { _id: a._id },
      {
        $set: {
          capture: {
            kind: 'nasa-worldview',
            layer: WORLDVIEW_LAYER,
            lat: site.lat,
            lng: site.lng,
            halfDeg: site.half,
            date,
            provenance: 'verified',
            note: `Re-requested from NASA Worldview for ${site.lat.toFixed(2)}, ${site.lng.toFixed(2)} on ${date}; the stored image matches it (fingerprint distance ${distance}/256, allowing for Cloudinary's enhance and sharpen pass).`,
          },
        },
      },
    )
    marked++
    console.log(`  ${site.name} ${date}: provenance verified (distance ${distance})`)
  } catch (err) {
    console.log(`  ${site.name} ${date}: skipped (${err instanceof Error ? err.message : err})`)
  }
}

// Re-run verification for every asset so the new provenance results take effect.
const all = await db.collection<AssetDocument>('assets').find({}).sort({ createdAt: 1 }).toArray()
const summary = { VERIFIED: 0, UNVERIFIED: 0, FLAGGED: 0 }
for (const a of all) summary[(await reverify(db, a)).verificationStatus]++
console.log(`Marked ${marked}, ${mismatched} mismatched. Library re-verified:`, JSON.stringify(summary))
await closeMongo()

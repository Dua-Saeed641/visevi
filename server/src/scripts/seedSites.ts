import { closeMongo, connectMongo } from '../lib/mongo.js'
import type { LocationDocument } from '../lib/models.js'

/**
 * Gives known locations coordinates so they become monitored sites for the
 * temperature-signal pipeline. Matches on location name, safe to re-run.
 * Usage: npm run seed:sites
 */
const SITES: Record<string, { lat: number; lng: number }> = {
  'Barmer, Rajasthan': { lat: 25.75, lng: 71.39 },
  'Satara, Maharashtra': { lat: 17.68, lng: 74.0 },
  'South 24 Parganas, West Bengal': { lat: 22.0, lng: 88.6 },
  'Aral Sea, Central Asia': { lat: 45.0, lng: 59.5 },
  'Columbia Glacier, Alaska': { lat: 61.2, lng: -147.1 },
  'Rondônia, Brazil': { lat: -10.9, lng: -62.8 },
}

const db = await connectMongo()
const locations = db.collection<LocationDocument>('locations')
for (const [name, c] of Object.entries(SITES)) {
  const r = await locations.updateMany({ name }, { $set: c })
  console.log(`${name}: ${r.matchedCount} location record(s) -> ${c.lat}, ${c.lng}`)
}
const total = await locations.countDocuments({})
const monitored = await locations.countDocuments({ lat: { $ne: null }, lng: { $ne: null } })
console.log(`${monitored} of ${total} locations are now monitored sites`)
await closeMongo()

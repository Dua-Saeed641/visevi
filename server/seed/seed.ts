/**
 * Seeds the demo dataset (seed/manifest.json) through the real upload API.
 *
 *   npm run seed                      seed http://localhost:4000
 *   npm run seed -- --api https://your-api.onrender.com
 *   npm run seed -- --dry-run         download + validate images only, upload nothing
 *   npm run seed -- --skip-demo       skip the deliberate integrity-demo items
 *   npm run seed -- --clean           delete everything this script seeded (needs .env)
 *
 * Every item goes through POST /api/assets/upload, so observations and
 * verification results are computed by the pipeline, not written by this script.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

interface Item {
  demo?: string
  project: string
  description?: string
  location: string
  stage: string
  capturedAt: string
  dateNote?: string
  url: string
  crop?: { left: number; top: number; width: number; height: number }
  credit: string
}
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'manifest.json'), 'utf8')) as { items: Item[] }
const items = manifest.items.filter((i) => !(flag('--skip-demo') && i.demo))

async function download(item: Item): Promise<Buffer> {
  const res = await fetch(item.url, { headers: { 'User-Agent': 'VisEviHackathon/1.0 (student project)' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${item.url}`)
  let buf: Buffer = Buffer.from(await res.arrayBuffer())
  if (item.crop) buf = await sharp(buf).extract(item.crop).jpeg({ quality: 90 }).toBuffer()
  // Validates that what we fetched really is a decodable image (not an HTML error page).
  await sharp(buf).metadata()
  return buf
}

async function clean() {
  const { MongoClient } = await import('mongodb')
  const { v2: cloudinary } = await import('cloudinary')
  const { config } = await import('dotenv')
  config({ path: path.resolve(here, '../../.env') })
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  const client = new MongoClient(process.env.DATABASE_URL!)
  await client.connect()
  const db = client.db()
  const names = [...new Set(manifest.items.map((i) => i.project))]
  const projects = await db.collection('projects').find({ name: { $in: names } }).toArray()
  const ids = projects.map((p) => p._id)
  const assets = await db.collection('assets').find({ projectId: { $in: ids } }).toArray()
  console.log(`Removing ${projects.length} projects and ${assets.length} assets seeded from the manifest`)
  for (let i = 0; i < assets.length; i += 50) {
    await cloudinary.api.delete_resources(assets.slice(i, i + 50).map((a) => a.cloudinaryPublicId))
  }
  await db.collection('assets').deleteMany({ projectId: { $in: ids } })
  await db.collection('locations').deleteMany({ projectId: { $in: ids } })
  await db.collection('projects').deleteMany({ _id: { $in: ids } })
  await client.close()
  console.log('Done. Other projects were not touched.')
}

async function main() {
  if (flag('--clean')) return clean()

  const api = opt('--api', 'http://localhost:4000').replace(/\/$/, '')
  const dry = flag('--dry-run')

  if (!dry) {
    const health = await fetch(`${api}/api/health`).catch(() => null)
    if (!health?.ok) throw new Error(`API not reachable at ${api} — start it first (cd server && npm run dev)`)
  }

  const summary: string[] = []
  for (const [n, item] of items.entries()) {
    const label = `[${n + 1}/${items.length}] ${item.project} · ${item.stage}`
    try {
      const buf = await download(item)
      if (dry) {
        console.log(`${label} — ok (${Math.round(buf.length / 1024)} KB)`)
        continue
      }
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), 'seed.jpg')
      form.append('project', item.project)
      form.append('location', item.location)
      form.append('stage', item.stage)
      form.append('capturedAt', item.capturedAt)
      const res = await fetch(`${api}/api/assets/upload`, { method: 'POST', body: form })
      const json = (await res.json()) as {
        verificationStatus?: string
        verificationNote?: string
        observation?: { caption?: string | null } | null
        observationError?: string
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const line = `${label} → ${json.verificationStatus}${json.observation ? '' : ' (no AI observation: ' + (json.observationError ?? 'unknown') + ')'}`
      console.log(line)
      if (json.observation?.caption) console.log(`      AI: ${json.observation.caption}`)
      summary.push(line)
    } catch (err) {
      console.error(`${label} — FAILED: ${err instanceof Error ? err.message : err}`)
      process.exitCode = 1
    }
  }

  if (!dry) {
    // Duplicate/theme checks look at the whole library, so re-run them now
    // that every item is present regardless of upload order.
    const r = await fetch(`${api}/api/assets/reverify-all`, { method: 'POST' })
    if (r.ok) console.log('Re-verified library:', JSON.stringify(await r.json()))
  }
  console.log(dry ? 'Dry run complete — nothing uploaded.' : 'Seeding complete. Refresh the dashboard.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

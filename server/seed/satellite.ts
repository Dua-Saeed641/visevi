/**
 * Bulk demo data: dated NASA satellite snapshots of hazard-relevant sites.
 *
 * Imagery is NASA Worldview / EOSDIS GIBS (MODIS Terra true colour), which is
 * free, keyless and NASA-produced. Each site gets a time series of real
 * captures, uploaded through the normal API. The server re-requests every
 * snapshot from NASA and confirms the upload matches (provenance check), runs
 * AI analysis, and each site becomes a monitored site (it is uploaded with
 * coordinates), so temperature, alerts and before/after have real material.
 *
 *   npm run seed:satellite                      6 snapshots for each of the sites
 *   npm run seed:satellite -- --per-site 10     more snapshots per site
 *   npm run seed:satellite -- --only Kutch      one site (substring match)
 *   npm run seed:satellite -- --dry-run         download + quality-check only, upload nothing
 *   npm run seed:satellite -- --clean           delete everything this script seeded (needs .env)
 *
 * Every upload uses one Cloudinary AI analysis, so mind your add-on quota:
 * sites x per-site = number of analyses.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SATELLITE_SITES as SITES, type SatelliteSite as Site } from '../src/lib/satelliteSites.js'
import { fetchSnapshot, screenSnapshot } from '../src/lib/worldview.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

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
  const projects = await db.collection('projects').find({ name: { $in: SITES.map((s) => s.project) } }).toArray()
  const ids = projects.map((p) => p._id)
  const assets = await db.collection('assets').find({ projectId: { $in: ids } }).toArray()
  console.log(`Removing ${projects.length} projects and ${assets.length} assets seeded by this script`)
  for (let i = 0; i < assets.length; i += 50) {
    await cloudinary.api.delete_resources(assets.slice(i, i + 50).map((a) => a.cloudinaryPublicId))
  }
  const locs = await db.collection('locations').find({ projectId: { $in: ids } }).toArray()
  await db.collection('alerts').deleteMany({ locationId: { $in: locs.map((l) => l._id) } })
  await db.collection('readings').deleteMany({ locationId: { $in: locs.map((l) => l._id) } })
  await db.collection('assets').deleteMany({ projectId: { $in: ids } })
  await db.collection('locations').deleteMany({ projectId: { $in: ids } })
  await db.collection('projects').deleteMany({ _id: { $in: ids } })
  await client.close()
  fs.rmSync(stateFile, { force: true })
  console.log('Done. Other projects were not touched.')
}

// Remembers which (site, date) pairs are already uploaded, so a re-run resumes instead of duplicating.
const stateFile = path.join(here, '.satellite-state.json')
const done = new Set<string>(fs.existsSync(stateFile) ? (JSON.parse(fs.readFileSync(stateFile, 'utf8')) as string[]) : [])
const saveState = () => fs.writeFileSync(stateFile, JSON.stringify([...done]))

async function seedSite(s: Site, dates: string[], api: string, dry: boolean) {
  let uploaded = 0
  let skipped = 0
  for (const wanted of dates) {
    // Try the wanted day, then up to 4 days after it, until a clear image comes back.
    let picked: { date: string; buf: Buffer } | null = null
    const tried: string[] = []
    for (let off = 0; off <= 4 && !picked; off++) {
      const d = iso(addDays(new Date(wanted), off))
      if (d > iso(new Date())) break
      const buf = await fetchSnapshot(s.lat, s.lng, s.half, d).catch(() => null)
      if (!buf) {
        tried.push(`${d} unavailable`)
        continue
      }
      const q = await screenSnapshot(buf, s.maxWhite).catch(() => ({ ok: false, why: 'unreadable' }))
      if (q.ok) picked = { date: d, buf }
      else tried.push(`${d} ${q.why}`)
    }
    if (!picked) {
      console.log(`  ${s.name} ${wanted}: skipped (${tried.join('; ')})`)
      skipped++
      continue
    }
    const key = `${s.name}|${picked.date}`
    if (done.has(key)) {
      console.log(`  ${s.name} ${picked.date}: already uploaded`)
      continue
    }
    if (dry) {
      console.log(`  ${s.name} ${picked.date}: ok (${Math.round(picked.buf.length / 1024)} KB)`)
      uploaded++
      continue
    }
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(picked.buf)], { type: 'image/jpeg' }), `${s.name}-${picked.date}.jpg`)
    form.append('project', s.project)
    form.append('location', s.name)
    form.append('stage', 'Satellite snapshot')
    form.append('capturedAt', picked.date)
    form.append('lat', String(s.lat))
    form.append('lng', String(s.lng))
    // The server re-requests this exact snapshot from NASA and only marks it verified if it matches.
    form.append('sourceKind', 'nasa-worldview')
    form.append('halfDeg', String(s.half))
    try {
      const res = await fetch(`${api}/api/assets/upload`, { method: 'POST', body: form })
      const json = (await res.json()) as { verificationStatus?: string; observation?: { caption?: string | null } | null; observationError?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      done.add(key)
      saveState()
      uploaded++
      console.log(`  ${s.name} ${picked.date}: ${json.verificationStatus}${json.observation ? '' : ` (no AI observation: ${json.observationError ?? 'unknown'})`}`)
    } catch (err) {
      console.error(`  ${s.name} ${picked.date}: FAILED ${err instanceof Error ? err.message : err}`)
      process.exitCode = 1
    }
  }
  return { uploaded, skipped }
}

async function main() {
  if (flag('--clean')) return clean()

  const api = opt('--api', 'http://localhost:4000').replace(/\/$/, '')
  const dry = flag('--dry-run')
  const perSite = Math.max(2, Number(opt('--per-site', '6')))
  const stepDays = Math.max(7, Number(opt('--step-days', '182')))
  const only = opt('--only', '').toLowerCase()
  const sites = SITES.filter((s) => !only || s.name.toLowerCase().includes(only))
  if (sites.length === 0) throw new Error(`no site matches "${only}"`)

  if (!dry) {
    const health = await fetch(`${api}/api/health`).catch(() => null)
    if (!health?.ok) throw new Error(`API not reachable at ${api}: start it first (cd server && npm run dev)`)
  }

  // Oldest first, every `stepDays` back from a few days ago (recent days may not be processed yet).
  const newest = addDays(new Date(), -5)
  const dates = Array.from({ length: perSite }, (_, k) => iso(addDays(newest, -k * stepDays))).reverse()
  console.log(`${sites.length} site(s) x ${perSite} snapshot(s), ${dates[0]} to ${dates[dates.length - 1]}${dry ? ' (dry run)' : ''}`)

  // A few sites in parallel: the slow parts are NASA rendering and Cloudinary analysis.
  const CONCURRENCY = 3
  let next = 0
  let uploaded = 0
  let skipped = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sites.length) }, async () => {
      while (next < sites.length) {
        const s = sites[next++]
        console.log(`${s.project} / ${s.name}`)
        const r = await seedSite(s, dates, api, dry)
        uploaded += r.uploaded
        skipped += r.skipped
      }
    }),
  )

  if (!dry) {
    // Duplicate/theme checks look at the whole library, so re-run them now that every item is present.
    const r = await fetch(`${api}/api/assets/reverify-all`, { method: 'POST' })
    if (r.ok) console.log('Re-verified library:', JSON.stringify(await r.json()))
  }
  console.log(`${dry ? 'Dry run' : 'Seeding'} complete: ${uploaded} ${dry ? 'usable' : 'uploaded'}, ${skipped} skipped for cloud or no data.`)
  console.log('Imagery: NASA Worldview / EOSDIS GIBS, MODIS Terra corrected reflectance (true colour).')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

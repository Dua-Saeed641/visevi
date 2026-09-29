/**
 * End-to-end feature test against a RUNNING API (default http://localhost:4000).
 *
 *   npm run test:e2e
 *
 * Uses real Cloudinary + Atlas: uploads a handful of images under projects named
 * "ZZTest ..." and deletes them (database + Cloudinary) when done, whether or not
 * the checks pass. Never touches other projects. The seeded demo dataset is only
 * read, never written.
 */
import { config } from 'dotenv'
import path from 'node:path'
import sharp from 'sharp'
import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'

config({ path: path.resolve(import.meta.dirname, '../../.env') })
const API = (process.env.API ?? 'http://localhost:4000').replace(/\/$/, '')
const UA = { 'User-Agent': 'VisEviTest/1.0 (student project)' }

const results: { area: string; name: string; ok: boolean | 'skip'; detail: string }[] = []
let area = ''
const section = (a: string) => { area = a; console.log(`\n== ${a}`) }
function check(name: string, ok: boolean | 'skip', detail = '') {
  results.push({ area, name, ok, detail })
  console.log(`  ${ok === 'skip' ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -  ' + detail : ''}`)
}

async function get<T = any>(p: string): Promise<{ status: number; body: T; ms: number }> {
  const t = performance.now()
  const r = await fetch(API + p)
  const body = (await r.json().catch(() => null)) as T
  return { status: r.status, body, ms: performance.now() - t }
}
async function post<T = any>(p: string): Promise<{ status: number; body: T }> {
  const r = await fetch(API + p, { method: 'POST' })
  return { status: r.status, body: (await r.json().catch(() => null)) as T }
}
async function upload(buf: Buffer, f: { project: string; location: string; stage?: string; capturedAt?: string }) {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), 't.jpg')
  for (const [k, v] of Object.entries(f)) if (v) form.append(k, v)
  const t = performance.now()
  const r = await fetch(API + '/api/assets/upload', { method: 'POST', body: form })
  return { status: r.status, body: (await r.json()) as any, ms: performance.now() - t }
}
const img = async (url: string) => Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer())
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function cleanup() {
  const client = new MongoClient(process.env.DATABASE_URL!)
  await client.connect()
  const db = client.db()
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET })
  const projects = await db.collection('projects').find({ name: /^ZZTest/ }).toArray()
  const ids = projects.map((p) => p._id)
  const assets = await db.collection('assets').find({ projectId: { $in: ids } }).toArray()
  if (assets.length) await cloudinary.api.delete_resources(assets.map((a) => a.cloudinaryPublicId))
  await db.collection('assets').deleteMany({ projectId: { $in: ids } })
  await db.collection('locations').deleteMany({ projectId: { $in: ids } })
  await db.collection('projects').deleteMany({ _id: { $in: ids } })
  await client.close()
  return { projects: projects.length, assets: assets.length }
}

async function main() {
  // Start from a clean slate in case a previous run was interrupted.
  await cleanup()

  section('1. API health and read endpoints')
  const h = await get('/api/health')
  check('health endpoint', h.status === 200 && h.body.status === 'ok')
  for (const p of ['/api/assets', '/api/reports/projects', '/api/reports/overview', '/api/reports/graph']) {
    const r = await get(p)
    check(`GET ${p}`, r.status === 200, `${Math.round(r.ms)} ms`)
  }
  const gz = await fetch(API + '/api/assets', { headers: { 'Accept-Encoding': 'gzip' } })
  check('responses are gzip-compressed', gz.headers.get('content-encoding') === 'gzip')
  check('bad asset id is rejected (400)', (await get('/api/assets/not-an-id')).status === 400)
  check('unknown asset id is 404', (await get('/api/assets/000000000000000000000000')).status === 404)

  section('2. Upload, AI analysis, pre-processing')
  const solar = await img('https://commons.wikimedia.org/wiki/Special:FilePath/Solar_panels_on_a_roof.jpg?width=900')
  const bee = await img('https://res.cloudinary.com/demo/image/upload/sample.jpg')
  const before = (await get('/api/assets')).body.length
  const u1 = await upload(solar, { project: 'ZZTest Solar Village', location: 'Rooftop', stage: 'Installation', capturedAt: '2026-03-01' })
  check('upload returns 201', u1.status === 201, `${Math.round(u1.ms)} ms end to end`)
  check('AI observation produced', !!u1.body.observation?.caption, u1.body.observation?.caption?.slice(0, 70))
  check('observation is structured (activity/objects/tags)', !!u1.body.observation && Array.isArray(u1.body.observation.objects) && Array.isArray(u1.body.observation.tags) && u1.body.observation.objects.length > 0)
  check('no invented confidence value', u1.body.observation?.confidence === null)
  check('pre-processing recorded (3 transformations)', u1.body.transformations?.length === 3)
  check('Cloudinary public ID + version stored', !!u1.body.cloudinaryPublicId && !!u1.body.cloudinaryVersion)
  check('upload + AI under 12 s', u1.ms < 12000, `${Math.round(u1.ms)} ms`)
  check('new asset appears in list (cache invalidated on write)', (await get('/api/assets')).body.length === before + 1)
  const list = (await get('/api/assets')).body[0]
  check('list payload is lean (no check details)', list.verification === null && list.transformations.length === 0)
  const detail = await get(`/api/assets/${u1.body.id}`)
  check('detail payload has full checks + provenance', detail.body.verification?.checks?.length === 4 && detail.body.transformations?.length === 3)

  section('3. Verification outcomes')
  check('genuine photo is VERIFIED', u1.body.verificationStatus === 'VERIFIED', u1.body.verificationNote?.slice(0, 90))
  const u2 = await upload(bee, { project: 'ZZTest Solar Village', location: 'Rooftop', stage: 'Completed', capturedAt: '2026-06-01' })
  const c2 = u2.body.verification?.checks?.find((c: any) => c.id === 'content-claim')
  check('mismatched photo (flower filed as solar) is FLAGGED', u2.body.verificationStatus === 'FLAGGED' && c2?.result === 'fail', c2?.detail)
  const solarCopy = await sharp(solar).resize(720).jpeg({ quality: 55 }).toBuffer()
  const u3 = await upload(solarCopy, { project: 'ZZTest Reused Photo', location: 'Site B', stage: 'Follow-up', capturedAt: '2026-04-01' })
  const d3 = u3.body.verification?.checks?.find((c: any) => c.id === 'duplicate')
  check('recompressed copy in another project is flagged as reuse', d3?.result === 'fail' && /different project/.test(d3?.detail ?? ''), d3?.detail?.slice(0, 100))
  const solarCrop = await sharp(solar).extract({ left: 300, top: 60, width: 560, height: 380 }).flip().toBuffer()
  const u4 = await upload(solarCrop, { project: 'ZZTest Solar Village', location: 'Rooftop', stage: 'Expansion', capturedAt: '2026-08-01' })
  const d4 = u4.body.verification?.checks?.find((c: any) => c.id === 'duplicate')
  check('a genuinely different photo is NOT flagged as duplicate', d4?.result === 'pass', d4?.detail)
  check('second genuine photo is VERIFIED', u4.body.verificationStatus === 'VERIFIED')
  check('original photo is not flagged when its copy arrives later', (await get(`/api/assets/${u1.body.id}`)).body.verificationStatus === 'VERIFIED')

  // EXIF date: embed a capture date that contradicts the claimed one.
  try {
    const exifImg = await sharp(await sharp(solar).resize(800).modulate({ brightness: 1.3 }).flop().toBuffer())
      .withExif({ IFD2: { DateTimeOriginal: '2020:05:05 10:00:00' } })
      .jpeg()
      .toBuffer()
    const u5 = await upload(exifImg, { project: 'ZZTest Solar Village', location: 'Rooftop', stage: 'Dated', capturedAt: '2026-03-01' })
    const dc = u5.body.verification?.checks?.find((c: any) => c.id === 'capture-date')
    if (u5.body.exifCapturedAt) check('claimed date contradicting EXIF is flagged', dc?.result === 'fail', dc?.detail)
    else check('claimed date contradicting EXIF is flagged', 'skip', 'Cloudinary returned no EXIF date for the synthetic image')
  } catch (e) {
    check('claimed date contradicting EXIF is flagged', 'skip', 'could not build EXIF test image: ' + (e as Error).message)
  }

  section('4. Search')
  const s1 = await get('/api/assets?q=' + encodeURIComponent('solar panels on a rooftop'))
  check('natural-language query finds the solar photos', s1.body.length >= 2 && s1.body.slice(0, 2).every((a: any) => /Solar|Reused/.test(a.projectName)), s1.body.slice(0, 3).map((a: any) => a.projectName).join(' | '))
  check('results are ranked with scores', s1.body[0].match?.score >= s1.body[1].match?.score)
  check('query is understood as concepts (explainable)', (s1.body[0].match?.expandedVia ?? []).includes('Solar energy'), (s1.body[0].match?.expandedVia ?? []).join(', '))
  check('query with no relevant evidence returns nothing', (await get('/api/assets?q=zzqxv')).body.length === 0)
  check('status filter works', (await get('/api/assets?status=FLAGGED&project=ZZTest')).body.every((a: any) => a.verificationStatus === 'FLAGGED'))

  section('5. Before/after comparison accuracy')
  const cmp = (await get(`/api/reports/compare?beforeId=${u4.body.id}&afterId=${u1.body.id}`)).body
  check('earlier capture is placed as "before" even if given reversed', cmp.before.id === u1.body.id && cmp.after.id === u4.body.id)
  check('interval uses capture dates: 1 Mar to 1 Aug 2026 = 153 days', cmp.comparison.time.diffDays === 153 && /5 months/.test(cmp.comparison.time.label), cmp.comparison.time.label)
  check('framing judged from fingerprints (flip+crop of same scene is not "same photo")', cmp.comparison.scene.tier !== 'same-photo', `${cmp.comparison.scene.tier} ${cmp.comparison.scene.distance}/${cmp.comparison.scene.bits}`)
  check('same-project pair with both verified is comparable or limited only for stated reasons', cmp.comparison.comparability.level !== 'not-comparable', cmp.comparison.comparability.headline)
  const cmpBee = (await get(`/api/reports/compare?beforeId=${u1.body.id}&afterId=${u2.body.id}`)).body
  check('pair including a flagged image says so', cmpBee.comparison.caveats.some((c: string) => /flagged/.test(c)) && cmpBee.comparison.comparability.level !== 'comparable', cmpBee.comparison.comparability.headline)
  check('unrelated content is detected (solar vs flower)', ['different', 'unrelated'].includes(cmpBee.comparison.scene.tier), `${cmpBee.comparison.scene.tier} ${cmpBee.comparison.scene.distance}`)
  check('themes are diffed at concept level', cmpBee.comparison.themes.onlyBefore.includes('Solar energy'), 'only-before: ' + cmpBee.comparison.themes.onlyBefore.join(', '))
  const cmpDup = (await get(`/api/reports/compare?beforeId=${u1.body.id}&afterId=${u3.body.id}`)).body
  check('identical photo is called out as NOT a before/after', cmpDup.comparison.scene.tier === 'same-photo' && cmpDup.comparison.comparability.level === 'not-comparable', cmpDup.comparison.comparability.headline)
  check('different projects are called out', cmpDup.comparison.caveats.some((c: string) => /different projects/.test(c)))
  const noDate1 = await upload(await sharp(solar).resize(640).flop().toBuffer(), { project: 'ZZTest Undated', location: 'Site C', stage: 'A' })
  const noDate2 = await upload(await sharp(solar).resize(600).extract({ left: 40, top: 20, width: 500, height: 250 }).toBuffer(), { project: 'ZZTest Undated', location: 'Site C', stage: 'B' })
  const cmpUndated = (await get(`/api/reports/compare?beforeId=${noDate1.body.id}&afterId=${noDate2.body.id}`)).body
  check('upload time is NEVER used as an interval when capture dates are missing', cmpUndated.comparison.time.basis === 'unavailable' && cmpUndated.comparison.diffDays === null, cmpUndated.comparison.time.label)
  check('missing date is stated as a caveat', cmpUndated.comparison.caveats.some((c: string) => /capture date was not recorded/i.test(c)))
  check('every comparison lists limits (nothing measured)', [cmp, cmpBee, cmpDup].every((x) => x.comparison.caveats.some((c: string) => /No quantities/.test(c))))
  check('comparison is deterministic (same input, same output)', JSON.stringify((await get(`/api/reports/compare?beforeId=${u1.body.id}&afterId=${u4.body.id}`)).body.comparison) === JSON.stringify(cmp.comparison))
  check('bad compare ids rejected', (await get('/api/reports/compare?beforeId=x&afterId=y')).status === 400)

  section('6. Reports and SDG indicators')
  const projects = (await get('/api/reports/projects')).body
  const pid = projects.find((p: any) => p.name === 'ZZTest Solar Village').id
  const rep = (await get(`/api/reports/project/${pid}`)).body
  check('report stats add up', rep.stats.totalAssets === rep.stats.verifiedAssets + rep.stats.flaggedAssets + rep.stats.unverifiedAssets, JSON.stringify(rep.stats))
  const i72 = rep.indicators.find((i: any) => i.code === '7.2')
  check('2 verified solar photos assert SDG 7.2 (score >= 50%)', i72?.status === 'asserted', `score ${i72?.confidence}`)
  check('flagged photo is excluded from indicator evidence', !i72?.backingAssetIds.includes(u2.body.id))
  check('featured before/after excludes flagged photos', !rep.beforeAfter || (rep.beforeAfter.beforeId !== u2.body.id && rep.beforeAfter.afterId !== u2.body.id))
  const single = (await get(`/api/reports/project/${projects.find((p: any) => p.name === 'ZZTest Reused Photo').id}`)).body
  check('a single photo can never assert an indicator', single.indicators.every((i: any) => i.status === 'needs-review'))
  check('timeline is chronological', rep.timeline.every((t: any, i: number, a: any[]) => i === 0 || a[i - 1].createdAt <= t.createdAt))

  section('7. Re-verification and concurrency')
  const rv = await post(`/api/assets/${u1.body.id}/reverify`)
  check('single re-verify returns a record', rv.status === 200 && rv.body.verificationStatus === 'VERIFIED')
  const all = await post('/api/assets/reverify-all')
  const totalNow = (await get('/api/assets')).body.length
  check('re-verify-all covers the whole library', all.body.total >= totalNow && all.body.VERIFIED + all.body.UNVERIFIED + all.body.FLAGGED === all.body.total, JSON.stringify(all.body))
  // A photo unrelated to everything uploaded above, so only its own copy can match it.
  const dupBase = await sharp(await img('https://res.cloudinary.com/demo/image/upload/cld-sample.jpg')).resize(700).jpeg().toBuffer()
  const dupCopy = await sharp(dupBase).resize(560).jpeg({ quality: 50 }).toBuffer()
  const par = await Promise.all([
    upload(dupBase, { project: 'ZZTest Parallel A', location: 'X', stage: 'a', capturedAt: '2026-05-01' }),
    upload(dupCopy, { project: 'ZZTest Parallel B', location: 'Y', stage: 'b', capturedAt: '2026-05-02' }),
  ])
  await post('/api/assets/reverify-all')
  const after = await Promise.all(par.map((p) => get(`/api/assets/${p.body.id}`)))
  const flagged = after.filter((a) => a.body.verificationStatus === 'FLAGGED').length
  check('parallel upload of a photo and its copy: after re-verify exactly the later one is flagged', flagged === 1 && after[1].body.verificationStatus === 'FLAGGED', `flagged=${flagged}`)

  section('8. Overview, graph, cache consistency')
  const ov = (await get('/api/reports/overview')).body
  check('KPIs are internally consistent', ov.kpis.verified + ov.kpis.unverified + ov.kpis.flagged === ov.kpis.totalAssets && ov.points.length === ov.kpis.totalAssets, JSON.stringify(ov.kpis))
  check('each check reports pass+fail+skipped for every asset', ov.checks.every((c: any) => c.pass + c.fail + c.skipped === ov.kpis.totalAssets))
  const g = (await get('/api/reports/graph')).body
  const ids = new Set(g.nodes.map((n: any) => n.id))
  check('graph edges only reference existing nodes', g.edges.every((e: any) => ids.has(e.source) && ids.has(e.target)))
  check('graph has one photo node per asset', g.nodes.filter((n: any) => n.kind === 'asset').length === ov.kpis.totalAssets)

  section('9. Seeded demo dataset (read-only)')
  const all2 = (await get('/api/assets')).body
  const seeded = (n: string) => all2.filter((a: any) => a.projectName === n)
  const ron = seeded('Rondônia Forest Monitoring')
  if (ron.length === 2) {
    const r = (await get(`/api/reports/compare?beforeId=${ron[0].id}&afterId=${ron[1].id}`)).body.comparison
    check('Rondônia 2014 -> 2016: exactly 2 years, 1 month (768 days)', r.time.diffDays === 768 && /2 years, 1 month/.test(r.time.label), r.time.label)
    check('Rondônia pair is comparable (same site, both verified)', r.comparability.level === 'comparable', r.comparability.headline)
    check('Rondônia framing is "similar" (repeat photography), not flagged as a duplicate', r.scene.tier === 'similar', `${r.scene.tier} ${r.scene.distance}/256`)
    check('Rondônia: both genuine photos VERIFIED', ron.every((a: any) => a.verificationStatus === 'VERIFIED'))
  } else check('Rondônia pair', 'skip', 'seed data not present')
  const col = seeded('Columbia Glacier Retreat Monitoring')
  if (col.length === 2) {
    const r = (await get(`/api/reports/compare?beforeId=${col[0].id}&afterId=${col[1].id}`)).body.comparison
    check('Columbia 2019 -> 2024: 5 years, 1 month (1,872 days, two leap days)', r.time.diffDays === 1872 && /5 years, 1 month/.test(r.time.label), r.time.label)
    check('Columbia: shared theme "Glaciers & ice" found', r.themes.shared.includes('Glaciers & ice'), r.themes.shared.join(', '))
  } else check('Columbia pair', 'skip', 'seed data not present')
  const aral = seeded('Aral Sea Water Monitoring')
  if (aral.length === 2) {
    const r = (await get(`/api/reports/compare?beforeId=${aral[0].id}&afterId=${aral[1].id}`)).body.comparison
    check('Aral 1989 -> 2008: large visual change is stated, not hidden', ['different', 'unrelated'].includes(r.scene.tier) && /substantially|unrelated/.test(r.scene.text), `${r.scene.tier} ${r.scene.distance}/256`)
  } else check('Aral pair', 'skip', 'seed data not present')
  const reuse = seeded('Integrity Demo — Glacier Survey Reuse')
  check('integrity demo: reused photo flagged', reuse.length === 0 ? 'skip' : reuse[0].verificationStatus === 'FLAGGED')
  const mism = seeded('Integrity Demo — Solar Rooftop Installation')
  check('integrity demo: mismatched photo flagged', mism.length === 0 ? 'skip' : mism[0].verificationStatus === 'FLAGGED')

  section('10. Speed (median of 7 requests, after warm-up)')
  const bench = async (p: string) => { await get(p); const t: number[] = []; for (let i = 0; i < 7; i++) t.push((await get(p)).ms); return median(t) }
  const someId = all2[0].id
  const pairIds = `beforeId=${u1.body.id}&afterId=${u4.body.id}`
  for (const [p, budget] of [
    ['/api/assets', 40], ['/api/assets?q=glacier', 40], ['/api/reports/overview', 40], ['/api/reports/graph', 40],
    ['/api/reports/projects', 40], [`/api/reports/project/${pid}`, 40], [`/api/reports/compare?${pairIds}`, 40], [`/api/assets/${someId}`, 40],
  ] as [string, number][]) {
    const m = await bench(p)
    check(`${p.split('?')[0]}${p.includes('?') ? '?...' : ''} median under ${budget} ms (cached)`, m < budget, `${m.toFixed(1)} ms`)
  }

  const cleaned = await cleanup()
  console.log(`\nCleaned up: ${cleaned.projects} test projects, ${cleaned.assets} test assets.`)
}

let crashed = false
try {
  await main()
} catch (e) {
  crashed = true
  console.error('\nTEST RUN CRASHED:', e)
  await cleanup().then((c) => console.log('Cleanup after crash:', c)).catch(() => {})
}

const pass = results.filter((r) => r.ok === true).length
const fail = results.filter((r) => r.ok === false)
const skip = results.filter((r) => r.ok === 'skip').length
console.log(`\n${pass} passed, ${fail.length} failed, ${skip} skipped, of ${results.length}`)
for (const f of fail) console.log(`  FAILED: [${f.area}] ${f.name} - ${f.detail}`)
process.exit(crashed || fail.length ? 1 : 0)

import sharp from 'sharp'
import { dHash, hammingDistance } from './phash.js'

/**
 * NASA Worldview satellite snapshots (EOSDIS GIBS): free, keyless, public
 * domain imagery of any place on any date. MODIS Terra true colour, roughly
 * 250 m per pixel, so a snapshot is a landscape-scale view, not a street view.
 */
export const WORLDVIEW_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor'

export const snapshotUrl = (lat: number, lng: number, halfDeg: number, date: string, width = 1024) =>
  `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&LAYERS=${WORLDVIEW_LAYER}` +
  `&CRS=EPSG:4326&TIME=${date}&BBOX=${lat - halfDeg},${lng - halfDeg},${lat + halfDeg},${lng + halfDeg}` +
  `&FORMAT=image/jpeg&WIDTH=${width}&HEIGHT=${width}`

export async function fetchSnapshot(lat: number, lng: number, halfDeg: number, date: string): Promise<Buffer | null> {
  const res = await fetch(snapshotUrl(lat, lng, halfDeg, date), {
    headers: { 'User-Agent': 'VisEviHackathon/1.0 (student project)' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Cloud and no-data screen. Rejected if too much is near-white (cloud) or
 * near-black (the satellite did not pass over that part that day), otherwise the
 * "evidence" would be a photo of a cloud. Snow and salt flats are legitimately
 * white, so a site can allow more.
 */
export async function screenSnapshot(buf: Buffer, maxWhite = 20): Promise<{ ok: boolean; why: string; whitePct: number; blackPct: number }> {
  const { data, info } = await sharp(buf).resize(256).raw().toBuffer({ resolveWithObject: true })
  let white = 0
  let black = 0
  const n = info.width * info.height
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) white++
    else if (data[i] < 12 && data[i + 1] < 12 && data[i + 2] < 12) black++
  }
  const whitePct = Math.round((white / n) * 100)
  const blackPct = Math.round((black / n) * 100)
  if (blackPct > 8) return { ok: false, why: `${blackPct}% no-data`, whitePct, blackPct }
  if (whitePct > maxWhite) return { ok: false, why: `${whitePct}% cloud`, whitePct, blackPct }
  return { ok: true, why: `${whitePct}% cloud`, whitePct, blackPct }
}

/** The newest usable snapshot within the last `days` days, or null with the reasons. */
export async function latestClearSnapshot(
  lat: number,
  lng: number,
  halfDeg: number,
  opts: { maxWhite?: number; days?: number; skipDates?: Set<string> } = {},
): Promise<{ date: string; buf: Buffer; whitePct: number } | { date: null; buf: null; tried: string[] }> {
  const tried: string[] = []
  // Start 1 day back: today's pass is usually not processed yet.
  for (let back = 1; back <= (opts.days ?? 10); back++) {
    const date = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
    if (opts.skipDates?.has(date)) continue
    const buf = await fetchSnapshot(lat, lng, halfDeg, date).catch(() => null)
    if (!buf) {
      tried.push(`${date} unavailable`)
      continue
    }
    const q = await screenSnapshot(buf, opts.maxWhite).catch(() => ({ ok: false, why: 'unreadable', whitePct: 0, blackPct: 0 }))
    if (q.ok) return { date, buf, whitePct: q.whitePct }
    tried.push(`${date} ${q.why}`)
  }
  return { date: null, buf: null, tried }
}

/**
 * Provenance check: re-request the claimed snapshot from NASA and compare it
 * with the image that was uploaded. A genuine NASA snapshot matches (distance
 * near 0); anything else does not, so "this is a NASA satellite view of X on
 * date D" is something the server confirms itself instead of taking on trust.
 */
export async function verifyProvenance(
  uploaded: Buffer,
  where: { lat: number; lng: number; halfDeg: number; date: string },
): Promise<{ ok: boolean; distance: number | null; note: string }> {
  try {
    const nasa = await fetchSnapshot(where.lat, where.lng, where.halfDeg, where.date)
    if (!nasa) return { ok: false, distance: null, note: 'NASA Worldview returned no snapshot for these coordinates and date, so the claim could not be confirmed.' }
    const distance = hammingDistance(await dHash(uploaded), await dHash(nasa))
    return distance <= 12
      ? { ok: true, distance, note: `Re-requested from NASA Worldview for ${where.lat.toFixed(2)}, ${where.lng.toFixed(2)} on ${where.date}; the upload matches it (fingerprint distance ${distance}/256).` }
      : { ok: false, distance, note: `Presented as a NASA Worldview snapshot for ${where.date}, but it does not match what NASA returns for those coordinates and date (fingerprint distance ${distance}/256).` }
  } catch (err) {
    return { ok: false, distance: null, note: `NASA could not be reached to confirm provenance (${err instanceof Error ? err.message : 'error'}).` }
  }
}

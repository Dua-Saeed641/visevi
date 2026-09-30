import sharp from 'sharp'

/**
 * Pixel-level comparison for two images known to cover the same footprint
 * (two NASA snapshots of the same coordinates). It measures what changed
 * instead of guessing from a fingerprint, and it masks cloud and no-data
 * pixels so a cloud is never reported as change.
 *
 * Every figure is an approximation from 8-bit true-colour imagery at coarse
 * resolution: "water-like" means dark blue-green pixels, "greenness" is a
 * standard excess-green index. They indicate direction and rough size, not
 * survey-grade area.
 */
const N = 96

export interface PixelProfile {
  rgb: Uint8Array
  valid: Uint8Array
  cloudPct: number
  noDataPct: number
  /** Mean excess-green index over clear pixels, about -0.3 (bare/water) to 0.4 (dense vegetation). */
  green: number
  waterPct: number
  brightness: number
  clearPct: number
}

export async function profileImage(buf: Buffer): Promise<PixelProfile> {
  const { data } = await sharp(buf).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = N * N
  const valid = new Uint8Array(n)
  let cloud = 0, nodata = 0, clear = 0, water = 0, greenSum = 0, brightSum = 0
  for (let i = 0; i < n; i++) {
    const R = data[i * 3], G = data[i * 3 + 1], B = data[i * 3 + 2]
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
    if (mx < 14) { nodata++; continue }
    if (mn > 190 && mx - mn < 34) { cloud++; continue }
    valid[i] = 1
    clear++
    const lum = 0.299 * R + 0.587 * G + 0.114 * B
    brightSum += lum
    greenSum += (2 * G - R - B) / Math.max(1, R + G + B)
    if (B >= R + 6 && G >= R && lum < 150) water++
  }
  return {
    rgb: new Uint8Array(data),
    valid,
    cloudPct: (cloud / n) * 100,
    noDataPct: (nodata / n) * 100,
    green: clear ? greenSum / clear : 0,
    waterPct: clear ? (water / clear) * 100 : 0,
    brightness: clear ? brightSum / clear : 0,
    clearPct: (clear / n) * 100,
  }
}

export interface PixelChange {
  before: Pick<PixelProfile, 'cloudPct' | 'green' | 'waterPct' | 'brightness' | 'clearPct'>
  after: Pick<PixelProfile, 'cloudPct' | 'green' | 'waterPct' | 'brightness' | 'clearPct'>
  /** Share of the frame that is clear (not cloud, not no-data) in BOTH images. */
  commonClearPct: number
}

/**
 * Deliberately NOT included: a "share of ground that changed" figure. It was
 * tried per pixel and per block, and on real pairs from this library it did not
 * separate the same site in the same season a year apart (median 64 to 89% "changed")
 * from unrelated sites (89 to 97%): at MODIS resolution it mostly measures colour
 * noise and slight misregistration, not change on the ground. A number that
 * looks precise but is not would be worse than no number, so only the aggregate
 * indicators that behave sensibly (greenness, water-like area, cloud) are reported.
 */
export function comparePixels(a: PixelProfile, b: PixelProfile): PixelChange {
  let shared = 0
  for (let i = 0; i < N * N; i++) if (a.valid[i] && b.valid[i]) shared++
  const pick = (p: PixelProfile) => ({ cloudPct: p.cloudPct, green: p.green, waterPct: p.waterPct, brightness: p.brightness, clearPct: p.clearPct })
  return { before: pick(a), after: pick(b), commonClearPct: (shared / (N * N)) * 100 }
}

const cache = new Map<string, Promise<PixelProfile>>()

/** Profile of a Cloudinary asset, from a small rendition (cached per public id + version). */
export function profileFromUrl(url: string, key: string): Promise<PixelProfile> {
  let p = cache.get(key)
  if (!p) {
    const small = url.replace('/image/upload/', '/image/upload/w_256,c_limit,q_auto/')
    p = fetch(small, { signal: AbortSignal.timeout(20_000) })
      .then(async (r) => {
        if (!r.ok) throw new Error(`image fetch ${r.status}`)
        return profileImage(Buffer.from(await r.arrayBuffer()))
      })
      .catch((e) => {
        cache.delete(key)
        throw e
      })
    if (cache.size > 400) cache.clear()
    cache.set(key, p)
  }
  return p
}

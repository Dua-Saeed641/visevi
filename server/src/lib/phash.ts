import sharp from 'sharp'

const SIZE = 16 // 16x16 comparisons = 256 bits

/**
 * 256-bit difference hash (dHash) of an image, as 64 hex chars.
 *
 * Computed from the *original* uploaded bytes (before Cloudinary's
 * enhance/sharpen pass) so that the same source photo hashes identically no
 * matter which pre-processing was applied later. Robust to resizing,
 * recompression and brightness changes — how a recycled field photo usually
 * differs from its earlier copy. NOT robust to cropping or heavy edits.
 *
 * Why 256 bits rather than 64: repeat photography of one site (the whole point
 * of before/after evidence) hashes close at 8x8 — a genuine 2014 vs 2016
 * satellite pair of the same area came out at distance 8/64, indistinguishable
 * from a copy. At 16x16 the same pair is 48/256 while re-encoded copies stay
 * at or below ~33/256.
 */
export async function dHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .rotate() // honour EXIF orientation so a rotated copy still matches
    .greyscale()
    .resize(SIZE + 1, SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  let bits = ''
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      bits += data[y * (SIZE + 1) + x] > data[y * (SIZE + 1) + x + 1] ? '1' : '0'
    }
  }
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

/** Total bits in a hash — the denominator when reporting a distance. */
export const HASH_BITS = SIZE * SIZE

/** Number of differing bits between two dHashes (0 = identical). Hashes of
 * different lengths (older 64-bit ones) are treated as maximally different. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return a.length * 4
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      dist += x & 1
      x >>= 1
    }
  }
  return dist
}

/** Distance at or below which two images are treated as the same photo
 * (of 256 bits). Set from measured data: worst re-encoded copy 33, closest
 * genuine same-site pair 48. */
export const DUPLICATE_THRESHOLD = 40

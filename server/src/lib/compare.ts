import type { AssetDocument } from './models.js'
import { comparePixels, profileFromUrl, type PixelChange } from './pixels.js'

type CaptureSide = Pick<AssetDocument, 'capture' | 'resourceType' | 'cloudinaryUrl' | 'cloudinaryPublicId' | 'cloudinaryVersion'>

/**
 * Two images are the same place when both are NASA snapshots of the same
 * coordinates and extent, and that is established from capture metadata, not
 * guessed from pixels (a coarse image fingerprint cannot tell "same place,
 * different season" from "different place"). Only then is a pixel-by-pixel
 * comparison valid, so only then is it computed.
 */
export async function measureFootprint(
  before: CaptureSide,
  after: CaptureSide,
): Promise<{ sameFootprint: boolean; pixels: PixelChange | null }> {
  const bc = before.capture
  const ac = after.capture
  const sameFootprint =
    !!bc && !!ac && bc.provenance !== 'failed' && ac.provenance !== 'failed' &&
    bc.lat === ac.lat && bc.lng === ac.lng && bc.halfDeg === ac.halfDeg &&
    before.resourceType === 'image' && after.resourceType === 'image'
  if (!sameFootprint) return { sameFootprint: false, pixels: null }
  try {
    const [pa, pb] = await Promise.all([
      profileFromUrl(before.cloudinaryUrl, `${before.cloudinaryPublicId}@${before.cloudinaryVersion}`),
      profileFromUrl(after.cloudinaryUrl, `${after.cloudinaryPublicId}@${after.cloudinaryVersion}`),
    ])
    return { sameFootprint, pixels: comparePixels(pa, pb) }
  } catch (err) {
    console.error('Pixel comparison failed:', err instanceof Error ? err.message : err)
    return { sameFootprint, pixels: null }
  }
}

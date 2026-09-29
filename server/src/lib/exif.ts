import sharp from 'sharp'
import exifReader from 'exif-reader'

/**
 * Capture date embedded in the photo itself (EXIF DateTimeOriginal), read from
 * the ORIGINAL bytes before upload.
 *
 * This cannot come from Cloudinary's upload response: we upload with incoming
 * transformations (auto-orient/enhance/sharpen), and the metadata Cloudinary then
 * returns describes the transformed copy, which has no EXIF. Reading it locally
 * is what makes the claimed-vs-embedded date check actually work.
 *
 * EXIF timestamps carry no timezone; they are treated as UTC, which is why the
 * date check allows a tolerance of a couple of days.
 */
export async function readCaptureDate(buffer: Buffer): Promise<Date | null> {
  try {
    const { exif } = await sharp(buffer).metadata()
    if (!exif) return null
    const parsed = exifReader(exif)
    const d = parsed.Photo?.DateTimeOriginal ?? parsed.Photo?.DateTimeDigitized ?? parsed.Image?.DateTime
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
  } catch {
    return null // unreadable or absent EXIF is simply "no embedded date"
  }
}

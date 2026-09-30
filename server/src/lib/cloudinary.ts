import { v2 as cloudinary } from 'cloudinary'
import { env } from '../env.js'
import type { Observation } from './models.js'

let configured = false

/** Lazily configures the SDK on first use, so the server can boot without
 * Cloudinary credentials set and only fail when an upload is attempted. */
function client() {
  if (!configured) {
    const { cloudName, apiKey, apiSecret } = env.cloudinary
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    })
    configured = true
  }
  return cloudinary
}

export interface UploadResult {
  publicId: string
  assetId: string | null
  url: string
  version: string
  resourceType: string
  /** Capture time from the file's own EXIF, if the file has one. */
  exifCapturedAt: Date | null
}

/** Incoming transformation applied to every image on upload. Kept as data so
 * the exact history can be stored on the asset (traceability). */
export const IMAGE_PREPROCESSING = [
  { step: 'auto-orient', cloudinary: 'a_auto', purpose: 'Straighten photos taken sideways/upside-down so AI analysis sees them upright' },
  { step: 'auto-enhance', cloudinary: 'e_improve', purpose: 'Recover contrast/colour on dull or poorly lit field photos' },
  { step: 'sharpen', cloudinary: 'e_sharpen:60', purpose: 'Counter mild motion blur / soft focus from phone cameras' },
] as const

function parseExifDate(meta: unknown): Date | null {
  if (!meta || typeof meta !== 'object') return null
  const m = meta as Record<string, unknown>
  const raw = m.DateTimeOriginal ?? m.CreateDate ?? m.DateTimeDigitized
  if (typeof raw !== 'string') return null
  // EXIF format: "2026:03:14 09:26:53"
  const match = /^(d{4}):(d{2}):(d{2})[ T](d{2}):(d{2}):(d{2})/.exec(raw)
  if (!match) return null
  const d = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Uploads a buffer to Cloudinary under a project-scoped folder, and applies
 * the field-photo pre-processing pass (auto-orient, mild sharpen/enhance)
 * before delivery — see ARCHITECTURE.md § Verification & Trust Layer for
 * why this runs before AI tagging rather than being skipped.
 */
export function uploadBuffer(
  buffer: Buffer,
  opts: { folder: string; resourceType: 'image' | 'video' },
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = client().uploader.upload_stream(
      {
        folder: opts.folder,
        resource_type: opts.resourceType,
        image_metadata: opts.resourceType === 'image',
        transformation:
          opts.resourceType === 'image'
            ? [{ angle: 'auto' }, { effect: 'improve' }, { effect: 'sharpen:60' }]
            : undefined,
        // AI add-ons (auto-tagging/captioning) are configured per Cloudinary
        // account under Add-ons — invoked here once enabled; see M2.
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload returned no result'))
          return
        }
        resolve({
          publicId: result.public_id,
          assetId: result.asset_id ?? null,
          url: result.secure_url,
          version: String(result.version),
          resourceType: result.resource_type,
          exifCapturedAt: parseExifDate(result.image_metadata),
        })
      },
    )
    stream.end(buffer)
  })
}

// ── AI Vision analysis ──────────────────────────────────────────────────
//
// This calls Cloudinary's Analyze API (Beta) directly over HTTP rather than
// through the `cloudinary` npm package: as of the installed SDK version
// (2.11.0), its `analyze_uri` helper targets a different, older "custom
// model" analyze endpoint (POST .../analyze/uri with an analysis_type +
// custom model_name/model_version) — not the named-model endpoint this
// needs (POST .../analyze/<model>, e.g. `ai_vision_general`). Verified by
// reading node_modules/cloudinary/lib/analysis/index.js directly; the SDK
// hasn't caught up to this beta API yet, so we call it as documented at
// https://cloudinary.com/documentation/analyze_api_guide and
// https://cloudinary.com/documentation/cloudinary_ai_vision_addon.
//
// Requires the "AI Vision" add-on to be enabled on the Cloudinary account.
// ai_vision_general is used (not ai_vision_tagging) specifically because
// ai_vision_tagging requires a predefined closed vocabulary of up to 10 tag
// definitions — that's a static/template observation, which VisEvi's
// requirements explicitly rule out. ai_vision_general answers open-ended
// prompts about the actual image content instead.

export class CloudinaryAnalysisError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'CloudinaryAnalysisError'
  }
}

// One prompt per field: slow (~7s) because Cloudinary answers them serially,
// so this is only the fallback if the combined prompt below isn't obeyed.
const FIELD_PROMPTS = [
  'In a few words, what is the main activity or process taking place in this image? If none is clearly identifiable, say "unclear".',
  'List the distinct physical objects clearly visible in this image, as a comma-separated list.',
  'Suggest 3 to 6 short, lowercase, hyphenated tags that describe this image for a project-evidence search system, as a comma-separated list.',
  'Write a single, factual one-sentence caption describing exactly what is shown in this image.',
]

// Measured against the live API: this single prompt takes ~2.4s where the four
// FIELD_PROMPTS above take ~7s, with equivalent output.
const COMBINED_PROMPT =
  'Answer in exactly 4 lines, with no labels or numbering. ' +
  'Line 1: the main activity or process in a few words (write "unclear" if none). ' +
  'Line 2: the distinct physical objects clearly visible, comma-separated. ' +
  'Line 3: 3 to 6 short, lowercase, hyphenated tags for a project-evidence search system, comma-separated. ' +
  'Line 4: one factual sentence captioning exactly what is shown.'

function splitList(value: string): string[] {
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(none|n\/a|unclear|unknown)$/i.test(s))
  // The model often repeats an item once per instance ("pink flower" x3).
  return [...new Map(items.map((s) => [s.toLowerCase(), s])).values()]
}

const tidy = (s: string) => s.trim().replace(/[.\s]+$/, '')

async function callAnalyze(source: { assetId: string | null; url: string }, prompts: string[]): Promise<string[]> {
  const { cloudName, apiKey, apiSecret } = env.cloudinary
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  let res: Response
  try {
    res = await fetch(`https://api.cloudinary.com/v2/analysis/${cloudName}/analyze/ai_vision_general`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: source.assetId ? { asset_id: source.assetId } : { uri: source.url },
        prompts,
      }),
    })
  } catch (err) {
    throw new CloudinaryAnalysisError('Network error calling Cloudinary Analyze API', err)
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: { analysis?: { responses?: { value: string }[] } }; error?: { message?: string; category?: string } }
    | null

  if (!res.ok) {
    const detail = json?.error?.message ?? `HTTP ${res.status}`
    const category = json?.error?.category ? ` (${json.error.category})` : ''
    throw new CloudinaryAnalysisError(
      `Cloudinary AI Vision analysis failed: ${detail}${category}. This usually means the "AI Vision" add-on is not enabled on this Cloudinary account, or credentials are invalid — check Cloudinary dashboard → Add-ons.`,
    )
  }

  const responses = json?.data?.analysis?.responses
  if (!responses || responses.length !== prompts.length) {
    throw new CloudinaryAnalysisError(
      `Cloudinary AI Vision returned an unexpected response shape: ${JSON.stringify(json)}`,
    )
  }
  return responses.map((r) => r.value?.trim() ?? '')
}

/**
 * Runs Cloudinary AI Vision analysis on an already-uploaded asset and maps
 * the response into VisEvi's structured observation shape. Throws
 * CloudinaryAnalysisError on any failure (add-on not enabled, auth error,
 * quota exhausted, etc.) — callers must not substitute a fake observation
 * on catch; see routes/assets.ts for how the failure is surfaced.
 */
export async function analyzeAsset(source: {
  assetId: string | null
  url: string
}): Promise<Observation> {
  let fields: string[] | null = null

  // Fast path: one combined prompt, accepted only if it came back as the four
  // expected non-empty lines. Anything else falls through to per-field prompts.
  const [combined] = await callAnalyze(source, [COMBINED_PROMPT])
  const parts = combined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (parts.length === 4) fields = parts

  if (!fields) fields = await callAnalyze(source, FIELD_PROMPTS)

  const [activityRaw, objectsRaw, tagsRaw, captionRaw] = fields
  const activity = tidy(activityRaw)

  return {
    activity: /^unclear$/i.test(activity) || !activity ? null : activity,
    objects: splitList(objectsRaw),
    tags: splitList(tagsRaw),
    caption: captionRaw || null,
    confidence: null,
    source: 'cloudinary:ai_vision_general',
    analyzedAt: new Date(),
  }
}

/**
 * AI Vision analyses images only, so a video is analysed through a still
 * frame that Cloudinary renders on the fly (start offset 1s, JPG). The
 * observation therefore describes that frame, not the whole clip — the
 * caller records this in the observation's `source`.
 */
export function videoPosterUrl(videoUrl: string): string {
  return videoUrl
    .replace('/video/upload/', '/video/upload/so_1/')
    .replace(/\.[a-z0-9]+$/i, '.jpg')
}

export interface BoardSide {
  publicId: string
  version: string
  /** Short label burned into the image, e.g. "BEFORE 14 Mar 2024". */
  label: string
}

/**
 * One Cloudinary delivery URL that renders a before | after board with the
 * triggering temperature stamped on it — composed entirely by chained
 * transformations (fill/pad canvas, two image layers, text overlays), so
 * nothing new is stored and every layer is a traceable source asset.
 */
export function evidenceBoardUrl(before: BoardSide, after: BoardSide, badge: string): string {
  const w = 640
  const h = 420
  // A text layer is two components: the layer definition, then where it lands.
  const text = (t: string, size: number, background: string, place: Record<string, unknown>) => [
    { overlay: { font_family: 'Helvetica', font_size: size, font_weight: 'bold', text: t }, color: 'white', background },
    { flags: 'layer_apply', ...place },
  ]
  return client().url(before.publicId, {
    version: before.version,
    secure: true,
    resource_type: 'image',
    transformation: [
      { width: w, height: h, crop: 'fill', gravity: 'auto' },
      { width: w * 2, height: h, crop: 'pad', gravity: 'west', background: 'white' },
      { overlay: after.publicId.replaceAll('/', ':'), width: w, height: h, crop: 'fill', gravity: 'auto' },
      { flags: 'layer_apply', gravity: 'east' },
      ...text(before.label, 26, '#2a0b0e', { gravity: 'south_west', x: 16, y: 16 }),
      ...text(after.label, 26, '#2a0b0e', { gravity: 'south_east', x: 16, y: 16 }),
      ...text(badge, 44, '#d6111e', { gravity: 'north', y: 16 }),
      { quality: 'auto', fetch_format: 'auto' },
    ],
  })
}

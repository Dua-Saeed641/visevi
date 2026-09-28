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

const ANALYSIS_PROMPTS = [
  'In a few words, what is the main activity or process taking place in this image? If none is clearly identifiable, say "unclear".',
  'List the distinct physical objects clearly visible in this image, as a comma-separated list.',
  'Suggest 3 to 6 short, lowercase, hyphenated tags that describe this image for a project-evidence search system, as a comma-separated list.',
  'Write a single, factual one-sentence caption describing exactly what is shown in this image.',
]

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(none|n\/a|unclear|unknown)$/i.test(s))
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
  const { cloudName, apiKey, apiSecret } = env.cloudinary
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  const body = {
    source: source.assetId ? { asset_id: source.assetId } : { uri: source.url },
    prompts: ANALYSIS_PROMPTS,
  }

  let res: Response
  try {
    res = await fetch(
      `https://api.cloudinary.com/v2/analysis/${cloudName}/analyze/ai_vision_general`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
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
  if (!responses || responses.length !== ANALYSIS_PROMPTS.length) {
    throw new CloudinaryAnalysisError(
      `Cloudinary AI Vision returned an unexpected response shape: ${JSON.stringify(json)}`,
    )
  }

  const [activityRaw, objectsRaw, tagsRaw, captionRaw] = responses.map((r) => r.value?.trim() ?? '')

  return {
    activity: /^unclear$/i.test(activityRaw) || !activityRaw ? null : activityRaw,
    objects: splitList(objectsRaw ?? ''),
    tags: splitList(tagsRaw ?? ''),
    caption: captionRaw || null,
    confidence: null,
    source: 'cloudinary:ai_vision_general',
    analyzedAt: new Date(),
  }
}

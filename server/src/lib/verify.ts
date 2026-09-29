import {
  conceptLabel,
  conceptsOf,
  observationText,
  WEAK_CONCEPTS,
} from './lexicon.js'
import { DUPLICATE_THRESHOLD, HASH_BITS, hammingDistance } from './phash.js'
import type {
  AssetDocument,
  VerificationCheck,
  VerificationResult,
  VerificationStatus,
} from './models.js'

/** Everything the checks need, gathered by the caller from Mongo. */
export interface VerifyContext {
  asset: Pick<
    AssetDocument,
    '_id' | 'observation' | 'stage' | 'capturedAt' | 'exifCapturedAt' | 'perceptualHash' | 'projectId' | 'createdAt'
  >
  projectName: string
  projectDescription?: string | null
  locationName: string | null
  /** Other assets in the library (any project), for duplicate + theme checks. */
  others: (Pick<AssetDocument, '_id' | 'observation' | 'perceptualHash' | 'projectId' | 'stage' | 'createdAt'> & {
    projectName: string
  })[]
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Claimed vs EXIF capture date may differ by timezone/upload lag; beyond this it's a mismatch. */
const DATE_TOLERANCE_DAYS = 2

function contentCheck(ctx: VerifyContext): VerificationCheck {
  const label = 'Content matches claimed project'
  const obsText = observationText(ctx.asset.observation)
  if (!obsText) {
    return { id: 'content-claim', label, result: 'skipped', detail: 'No AI observation available for this asset, so its content cannot be checked.' }
  }
  const claimText = [ctx.projectName, ctx.projectDescription, ctx.asset.stage].filter(Boolean).join(' ')
  // Only activity concepts can be checked; place/people words (WEAK_CONCEPTS) are ignored.
  const claim = conceptsOf(claimText).filter((c) => !WEAK_CONCEPTS.has(c.conceptId))
  if (claim.length === 0) {
    return { id: 'content-claim', label, result: 'skipped', detail: `The project claim "${ctx.projectName}" names no specific activity (only a place or community), so there is nothing concrete to check the photo against.` }
  }
  const seen = conceptsOf(obsText)
  const overlap = claim.filter((c) => seen.some((s) => s.conceptId === c.conceptId))
  if (overlap.length > 0) {
    const names = overlap.map((c) => conceptLabel(c.conceptId)).join(', ')
    return { id: 'content-claim', label, result: 'pass', detail: `Detected content supports the claim (${names}).` }
  }
  const claimNames = claim.map((c) => conceptLabel(c.conceptId)).join(', ')
  const seenNames = seen.length ? seen.map((c) => conceptLabel(c.conceptId)).join(', ') : 'nothing related to the claim'
  return { id: 'content-claim', label, result: 'fail', detail: `Claimed: ${claimNames}. Detected: ${seenNames}.` }
}

function themeCheck(ctx: VerifyContext): VerificationCheck {
  const label = 'Consistent with rest of project evidence'
  const obsText = observationText(ctx.asset.observation)
  if (!obsText) {
    return { id: 'project-theme', label, result: 'skipped', detail: 'No AI observation available for this asset.' }
  }
  const siblings = ctx.others.filter(
    (o) => o.projectId.equals(ctx.asset.projectId) && !o._id.equals(ctx.asset._id) && o.observation,
  )
  if (siblings.length < 2) {
    return { id: 'project-theme', label, result: 'skipped', detail: 'Fewer than 2 other analysed assets in this project — no theme to compare against yet.' }
  }
  // Project theme = concept frequency across the sibling assets.
  const freq = new Map<string, number>()
  for (const s of siblings) {
    for (const c of conceptsOf(observationText(s.observation))) {
      freq.set(c.conceptId, (freq.get(c.conceptId) ?? 0) + 1)
    }
  }
  const theme = [...freq].filter(([id, n]) => n >= 2 && !WEAK_CONCEPTS.has(id)).map(([id]) => id)
  if (theme.length === 0) {
    return { id: 'project-theme', label, result: 'skipped', detail: 'Other assets in this project share no common recognisable theme.' }
  }
  const seen = conceptsOf(obsText).map((c) => c.conceptId)
  const shared = theme.filter((t) => seen.includes(t))
  if (shared.length > 0) {
    return { id: 'project-theme', label, result: 'pass', detail: `Shares theme with the project's other evidence (${shared.map(conceptLabel).join(', ')}).` }
  }
  return { id: 'project-theme', label, result: 'fail', detail: `Project evidence is about ${theme.map(conceptLabel).join(', ')}; this asset shows none of it.` }
}

function duplicateCheck(ctx: VerifyContext): VerificationCheck {
  const label = 'Not a reused photo'
  const hash = ctx.asset.perceptualHash
  if (!hash) {
    return { id: 'duplicate', label, result: 'skipped', detail: 'No perceptual hash (video or unreadable image).' }
  }
  const match = ctx.others
    .filter((o) => o.perceptualHash && !o._id.equals(ctx.asset._id) && o.createdAt <= ctx.asset.createdAt) // only the later copy is the reuse
    .map((o) => ({ o, dist: hammingDistance(hash, o.perceptualHash!) }))
    .filter((m) => m.dist <= DUPLICATE_THRESHOLD)
    .sort((a, b) => a.dist - b.dist)[0]
  if (!match) {
    return { id: 'duplicate', label, result: 'pass', detail: 'No visually matching photo found elsewhere in the library.' }
  }
  const sameProject = match.o.projectId.equals(ctx.asset.projectId)
  const where = sameProject
    ? `earlier evidence in the same project${match.o.stage ? ` (stage: ${match.o.stage})` : ''}`
    : `a different project ("${match.o.projectName}")`
  return {
    id: 'duplicate',
    label,
    result: 'fail',
    detail: `Visually matches ${where} (hash distance ${match.dist}/${HASH_BITS}) — possible reuse of the same photo. Matching asset: ${match.o._id.toHexString()}.`,
  }
}

function dateCheck(ctx: VerifyContext): VerificationCheck {
  const label = 'Capture date matches file metadata'
  const { capturedAt, exifCapturedAt } = ctx.asset
  if (!capturedAt || !exifCapturedAt) {
    return {
      id: 'capture-date',
      label,
      result: 'skipped',
      detail: !exifCapturedAt ? 'The file carries no EXIF capture date.' : 'No capture date was claimed at upload.',
    }
  }
  const days = Math.abs(capturedAt.getTime() - exifCapturedAt.getTime()) / DAY_MS
  if (days <= DATE_TOLERANCE_DAYS) {
    return { id: 'capture-date', label, result: 'pass', detail: 'Claimed date agrees with the photo’s embedded capture time.' }
  }
  return {
    id: 'capture-date',
    label,
    result: 'fail',
    detail: `Claimed ${capturedAt.toISOString().slice(0, 10)} but the file was captured ${exifCapturedAt.toISOString().slice(0, 10)} (${Math.round(days)} days apart).`,
  }
}

/**
 * Runs all checks and derives the status:
 *  - any failed check            -> FLAGGED (never silently trusted)
 *  - else a content check passed -> VERIFIED
 *  - else                        -> UNVERIFIED (not enough evidence either way)
 */
export function verifyAsset(ctx: VerifyContext): {
  status: VerificationStatus
  note: string
  verification: VerificationResult
} {
  const checks = [contentCheck(ctx), themeCheck(ctx), duplicateCheck(ctx), dateCheck(ctx)]
  const failed = checks.filter((c) => c.result === 'fail')
  const contentPassed = checks.some((c) => (c.id === 'content-claim' || c.id === 'project-theme') && c.result === 'pass')

  let status: VerificationStatus
  let note: string
  if (failed.length > 0) {
    status = 'FLAGGED'
    note = failed.map((c) => c.detail).join(' ')
  } else if (contentPassed) {
    status = 'VERIFIED'
    note = checks.filter((c) => c.result === 'pass').map((c) => c.detail).join(' ')
  } else {
    status = 'UNVERIFIED'
    note = 'Not enough information to verify: ' + checks.filter((c) => c.result === 'skipped').map((c) => c.detail).join(' ')
  }
  return { status, note, verification: { checks, evaluatedAt: new Date() } }
}

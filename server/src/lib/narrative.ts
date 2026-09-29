import { conceptLabel, conceptsOf, observationText, stem, tokenize } from './lexicon.js'
import { DUPLICATE_THRESHOLD, HASH_BITS, hammingDistance } from './phash.js'
import type { AssetDocument } from './models.js'

/**
 * Before/after comparison. Every statement here is derived from data we hold and
 * is worded to claim no more than that data supports:
 *
 *  - Time uses the *claimed capture date* only. Upload time says nothing about
 *    how long passed between two photos, so it is never used as an interval.
 *  - Whether two photos show the same place is judged from their perceptual
 *    fingerprints, in tiers calibrated on real pairs (see `SCENE_*` below).
 *  - Content is compared at the level of recognised themes (stable) and object
 *    head-nouns, not raw AI labels (which vary between images).
 *  - Nothing is measured: no areas, counts or percentages of change.
 */

type NarrativeAsset = Pick<
  AssetDocument,
  'observation' | 'capturedAt' | 'exifCapturedAt' | 'createdAt' | 'perceptualHash' | 'verificationStatus'
>

export interface CompareContext {
  sameProject: boolean
  sameLocation: boolean
  beforeProject?: string
  afterProject?: string
}

export type SceneTier = 'same-photo' | 'similar' | 'different' | 'unrelated' | 'unknown'

/*
 * Fingerprint distance (of 256 bits), calibrated on the seeded library:
 *   re-encoded copies of one photo .............. <= ~33
 *   repeat photography of one site, 2-5 yrs ..... 48-50
 *   same site after a huge change (Aral Sea) .... 103
 *   unrelated photos ............................ 114-136 (median 124)
 * The last two overlap in practice, so "different" is deliberately hedged.
 */
const SCENE_SIMILAR_MAX = 85
const SCENE_DIFFERENT_MAX = 110

export interface ChangeDescription {
  comparability: { level: 'comparable' | 'limited' | 'not-comparable'; headline: string; reasons: string[] }
  time: {
    basis: 'capture-dates' | 'unavailable'
    diffDays: number | null
    label: string
    beforeDate: string | null
    afterDate: string | null
  }
  scene: { tier: SceneTier; distance: number | null; bits: number; text: string }
  activity: { relation: 'same' | 'related' | 'different' | 'unknown'; before: string | null; after: string | null; text: string }
  themes: { shared: string[]; onlyBefore: string[]; onlyAfter: string[] }
  objects: { shared: string[]; onlyBefore: string[]; onlyAfter: string[] }
  overlap: { themes: number | null; objects: number | null; tags: number | null }
  /** Ordered, self-contained statements. */
  insights: string[]
  /** Things the reader must keep in mind before drawing a conclusion. */
  caveats: string[]
  narrative: string
  method: string
  // Convenience fields used by the report page.
  timeSpanLabel: string
  diffDays: number | null
}

/* ── helpers ───────────────────────────────────────────────────────────── */

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "5 years, 1 month" style span between two dates (a <= b), calendar-aware. */
function humanSpan(a: Date, b: Date): string {
  let y = b.getUTCFullYear() - a.getUTCFullYear()
  let m = b.getUTCMonth() - a.getUTCMonth()
  let d = b.getUTCDate() - a.getUTCDate()
  if (d < 0) {
    m--
    d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate()
  }
  if (m < 0) {
    y--
    m += 12
  }
  const parts: string[] = []
  if (y) parts.push(`${y} year${y === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} month${m === 1 ? '' : 's'}`)
  if (d && !y) parts.push(`${d} day${d === 1 ? '' : 's'}`)
  return parts.join(', ') || 'the same day'
}

const jaccard = (a: Set<string>, b: Set<string>): number | null => {
  if (a.size === 0 && b.size === 0) return null
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
const pct = (n: number | null) => (n === null ? null : Math.round(n * 100))

const list = (xs: string[], max = 6) => xs.slice(0, max).join(', ') + (xs.length > max ? ` and ${xs.length - max} more` : '')

/** Objects reduced to their head noun ("pink flower" -> flower) so that wording
 * differences between two AI passes don't read as change. */
function objectHeads(objects: string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const o of objects) {
    const toks = tokenize(o)
    const head = toks[toks.length - 1]
    if (head && !out.has(head)) out.set(head, o.toLowerCase())
  }
  return out
}

const realDate = (a: NarrativeAsset): Date | null => a.capturedAt ?? a.exifCapturedAt ?? null

function sceneOf(before: NarrativeAsset, after: NarrativeAsset): ChangeDescription['scene'] {
  const a = before.perceptualHash
  const b = after.perceptualHash
  if (!a || !b || a.length !== b.length) {
    return { tier: 'unknown', distance: null, bits: HASH_BITS, text: 'Visual framing could not be compared because a fingerprint is missing for one of the images.' }
  }
  const d = hammingDistance(a, b)
  const dist = `fingerprint distance ${d}/${HASH_BITS}`
  if (d <= DUPLICATE_THRESHOLD) {
    return { tier: 'same-photo', distance: d, bits: HASH_BITS, text: `The two images are visually near-identical (${dist}). This looks like the same photograph, not a before and after pair.` }
  }
  if (d <= SCENE_SIMILAR_MAX) {
    return { tier: 'similar', distance: d, bits: HASH_BITS, text: `Framing and layout are similar (${dist}), consistent with repeat photography of one site.` }
  }
  if (d <= SCENE_DIFFERENT_MAX) {
    return { tier: 'different', distance: d, bits: HASH_BITS, text: `The images differ substantially (${dist}). That fits either a large change at one site or a different viewpoint; the fingerprint alone cannot tell which.` }
  }
  return { tier: 'unrelated', distance: d, bits: HASH_BITS, text: `The images are visually unrelated (${dist}), so they probably do not share a viewpoint or subject. Read any difference below as two different scenes, not progress at one site.` }
}

/* ── main ──────────────────────────────────────────────────────────────── */

export function describeChange(before: NarrativeAsset, after: NarrativeAsset, ctx: CompareContext): ChangeDescription {
  const b = before.observation
  const a = after.observation

  // Time — capture dates only.
  const bd = realDate(before)
  const ad = realDate(after)
  let time: ChangeDescription['time']
  if (bd && ad) {
    const [early, late] = bd <= ad ? [bd, ad] : [ad, bd]
    const days = Math.round((late.getTime() - early.getTime()) / 86_400_000)
    const human = humanSpan(early, late)
    time = {
      basis: 'capture-dates',
      diffDays: days,
      label: days === 0 ? 'Same day' : days < 31 ? `${days} day${days === 1 ? '' : 's'}` : `${human} (${days.toLocaleString('en-GB')} days)`,
      beforeDate: fmtDate(bd),
      afterDate: fmtDate(ad),
    }
  } else {
    time = { basis: 'unavailable', diffDays: null, label: 'Not recorded', beforeDate: bd ? fmtDate(bd) : null, afterDate: ad ? fmtDate(ad) : null }
  }

  const scene = sceneOf(before, after)

  // Themes (recognised concepts).
  const tb = new Map(conceptsOf(observationText(b)).map((c) => [c.conceptId, c]))
  const ta = new Map(conceptsOf(observationText(a)).map((c) => [c.conceptId, c]))
  const themes = {
    shared: [...ta.keys()].filter((k) => tb.has(k)).map(conceptLabel),
    onlyBefore: [...tb.keys()].filter((k) => !ta.has(k)).map(conceptLabel),
    onlyAfter: [...ta.keys()].filter((k) => !tb.has(k)).map(conceptLabel),
  }

  // Objects (head nouns).
  const ob = objectHeads(b?.objects ?? [])
  const oa = objectHeads(a?.objects ?? [])
  const objects = {
    shared: [...oa.keys()].filter((k) => ob.has(k)).map((k) => oa.get(k)!),
    onlyBefore: [...ob.keys()].filter((k) => !oa.has(k)).map((k) => ob.get(k)!),
    onlyAfter: [...oa.keys()].filter((k) => !ob.has(k)).map((k) => oa.get(k)!),
  }

  const tagSet = (o: typeof b) => new Set((o?.tags ?? []).flatMap((t) => tokenize(t)))
  const overlap = {
    themes: pct(jaccard(new Set(tb.keys()), new Set(ta.keys()))),
    objects: pct(jaccard(new Set(ob.keys()), new Set(oa.keys()))),
    tags: pct(jaccard(tagSet(b), tagSet(a))),
  }

  // Activity.
  const bAct = b?.activity ?? null
  const aAct = a?.activity ?? null
  let activity: ChangeDescription['activity']
  if (!bAct || !aAct) {
    activity = {
      relation: 'unknown', before: bAct, after: aAct,
      text: !bAct && !aAct ? 'No activity could be identified in either image.' : `An activity was identified only in the ${bAct ? 'before' : 'after'} image ("${bAct ?? aAct}").`,
    }
  } else {
    const sb = new Set(tokenize(bAct).map(stem))
    const sa = new Set(tokenize(aAct).map(stem))
    const j = jaccard(sb, sa) ?? 0
    const sharedConcept = [...conceptsOf(bAct)].some((c) => conceptsOf(aAct).some((d) => d.conceptId === c.conceptId))
    if (j >= 0.6) activity = { relation: 'same', before: bAct, after: aAct, text: `The same activity is identified in both images: "${aAct}".` }
    else if (j >= 0.2 || sharedConcept) activity = { relation: 'related', before: bAct, after: aAct, text: `Related activity: "${bAct}" before, "${aAct}" after.` }
    else if ((overlap.themes ?? 0) >= 60) {
      // Activity strings are free text from two separate AI passes. When the
      // detected themes agree, different wording is far more likely than a change.
      activity = { relation: 'related', before: bAct, after: aAct, text: `The AI worded the activity differently ("${bAct}" before, "${aAct}" after), but the detected themes agree (${overlap.themes}% overlap), so this is more likely different wording than a change in activity.` }
    } else activity = { relation: 'different', before: bAct, after: aAct, text: `The identified activity differs: "${bAct}" in the before image, "${aAct}" in the after image, and the detected themes differ too.` }
  }

  // Caveats — what limits the comparison.
  const caveats: string[] = []
  const reasons: string[] = []
  if (!ctx.sameProject) {
    const t = `The images are filed under different projects (${ctx.beforeProject ?? 'before'} and ${ctx.afterProject ?? 'after'}), so this is not a like-for-like before and after.`
    caveats.push(t)
    reasons.push('different projects')
  } else if (!ctx.sameLocation) {
    caveats.push('The images are from different locations within the project.')
    reasons.push('different locations')
  }
  for (const [label, side] of [['before', before], ['after', after]] as const) {
    if (side.verificationStatus === 'FLAGGED') {
      caveats.push(`The ${label} image is flagged by verification and may not show what it claims.`)
      reasons.push(`${label} image flagged`)
    } else if (side.verificationStatus === 'UNVERIFIED') {
      caveats.push(`The ${label} image is unverified: there was not enough information to confirm what it shows.`)
    }
  }
  if (!b || !a) {
    caveats.push(`No AI observation exists for the ${!b && !a ? 'before or after image' : !b ? 'before image' : 'after image'}, so content cannot be compared.`)
    reasons.push('missing AI observation')
  }
  if (time.basis === 'unavailable') {
    caveats.push(`A capture date was not recorded for ${!bd && !ad ? 'either image' : !bd ? 'the before image' : 'the after image'}. Upload time says nothing about elapsed time, so no interval is stated and the order shown follows upload time.`)
    reasons.push('capture date missing')
  }
  if (scene.tier === 'same-photo') reasons.push('identical photo')
  if (scene.tier === 'unrelated') reasons.push('visually unrelated')
  if (scene.tier === 'different') reasons.push('large visual difference')
  caveats.push('Descriptions come from one AI pass per image and can vary between passes, so a missing label is not proof that something was removed or built. No quantities (area, counts, percent cover) are measured.')

  // Comparability verdict.
  const hard = scene.tier === 'same-photo' || (scene.tier === 'unrelated' && !ctx.sameProject) || !b || !a
  const soft = reasons.length > 0
  const level: ChangeDescription['comparability']['level'] = hard ? 'not-comparable' : soft ? 'limited' : 'comparable'
  const headline =
    level === 'comparable'
      ? `Comparable pair${time.basis === 'capture-dates' ? `, ${time.label} apart` : ''}.`
      : level === 'limited'
        ? `Limited comparability: ${reasons.join(', ')}.`
        : `Not a valid before and after: ${reasons.filter((r) => !r.startsWith('capture')).join(', ') || 'insufficient data'}.`

  // Insights, in reading order.
  const insights: string[] = [scene.text]
  insights.push(
    time.basis === 'capture-dates'
      ? `Captured ${time.beforeDate} and ${time.afterDate}: ${time.label} apart.`
      : 'The interval between captures cannot be stated because a capture date is missing.',
  )
  if (b && a) {
    insights.push(activity.text)
    if (themes.shared.length) insights.push(`Themes detected in both images: ${list(themes.shared)}.`)
    if (themes.onlyAfter.length) insights.push(`Detected only in the after image: ${list(themes.onlyAfter)}.`)
    if (themes.onlyBefore.length) insights.push(`Detected only in the before image: ${list(themes.onlyBefore)}.`)
    if (!themes.shared.length && !themes.onlyAfter.length && !themes.onlyBefore.length) {
      insights.push('No recognised theme was detected in either image, so the comparison rests on the captions below.')
    }
    if (objects.shared.length) insights.push(`Objects named in both: ${list(objects.shared)}.`)
    if (objects.onlyAfter.length) insights.push(`Objects named only in the after image: ${list(objects.onlyAfter)}.`)
    if (objects.onlyBefore.length) insights.push(`Objects named only in the before image: ${list(objects.onlyBefore)}.`)
    const bits = [
      overlap.themes !== null ? `themes ${overlap.themes}%` : null,
      overlap.objects !== null ? `objects ${overlap.objects}%` : null,
      overlap.tags !== null ? `tags ${overlap.tags}%` : null,
    ].filter(Boolean)
    if (bits.length) insights.push(`Overlap between the two descriptions: ${bits.join(', ')}.`)
  }

  return {
    comparability: { level, headline, reasons },
    time,
    scene,
    activity,
    themes,
    objects,
    overlap,
    insights,
    caveats,
    narrative: [headline, ...insights].join(' '),
    method:
      'Capture dates as recorded; framing from a 256-bit perceptual fingerprint (thresholds calibrated on real image pairs); content from Cloudinary AI Vision observations reduced to recognised themes and object head-nouns. Nothing is measured.',
    timeSpanLabel: time.label,
    diffDays: time.diffDays,
  }
}

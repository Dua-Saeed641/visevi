import { conceptLabel, conceptsOf, observationText } from './lexicon.js'
import type { AssetDocument, HazardSeverity, HazardType } from './models.js'

/**
 * Hazard rules for temperature signals, and the check that ties a signal to the
 * visual evidence held for the same site. Deterministic and explainable on
 * purpose (same stance as lexicon.ts): every threshold is a named constant and
 * every sentence in an assessment is derived from data we hold.
 *
 * Thresholds follow the widely used India Meteorological Department criteria
 * for plains (heat wave >= 40 C, severe >= 45 C; cold wave <= 4 C, severe
 * <= 2 C) with a 37 C / 6 C "watch" tier below them. They are a starting point;
 * an operator's own SOP thresholds should replace them.
 */

export interface Threshold {
  type: HazardType
  severity: HazardSeverity
  /** Heat fires at >= limit, cold at <= limit, waves at >= limit. */
  limit: number
}

export const THRESHOLDS: Threshold[] = [
  { type: 'heatwave', severity: 'emergency', limit: 45 },
  { type: 'heatwave', severity: 'warning', limit: 40 },
  { type: 'heatwave', severity: 'watch', limit: 37 },
  { type: 'coldwave', severity: 'emergency', limit: 2 },
  { type: 'coldwave', severity: 'warning', limit: 4 },
  { type: 'coldwave', severity: 'watch', limit: 6 },
]

/** Significant wave height (m). Illustrative tiers: agree them with the local marine authority. */
export const WAVE_THRESHOLDS: Threshold[] = [
  { type: 'highwaves', severity: 'emergency', limit: 6 },
  { type: 'highwaves', severity: 'warning', limit: 4 },
  { type: 'highwaves', severity: 'watch', limit: 2.5 },
]

/**
 * Departure from normal for this place, month and hour. Both conditions must
 * hold, so a jittery place with a wide spread does not fire on small swings
 * and a stable place does not fire on a degree or two.
 */
export const ANOMALY_TIERS: { severity: HazardSeverity; minDeltaC: number; minZ: number }[] = [
  { severity: 'emergency', minDeltaC: 8, minZ: 2.5 },
  { severity: 'warning', minDeltaC: 6, minZ: 2 },
  { severity: 'watch', minDeltaC: 4, minZ: 1.5 },
]
const MIN_SD_C = 1.5
/**
 * An unusual departure only matters if the temperature is also stressful in
 * itself (33 C in Satara is 8 C above normal but harmless), and on its own it
 * never reaches "emergency": that needs a real absolute threshold.
 */
const ANOMALY_MIN_HEAT_C = 30
const ANOMALY_MAX_COLD_C = 10
/** Highest severity an anomaly alone can reach, by how stressful the temperature is in itself. */
const anomalyCap = (type: HazardType, tempC: number): HazardSeverity =>
  type === 'heatwave' ? (tempC >= 35 ? 'warning' : 'watch') : tempC <= 5 ? 'warning' : 'watch'

export const SEVERITY_RANK: Record<HazardSeverity, number> = { watch: 1, warning: 2, emergency: 3 }

/**
 * The absolute thresholds are calibrated for tropical/subtropical plains
 * (India). Applied to a polar site they would fire on an ordinary day
 * (Alaska at 1 C is not a cold wave), so beyond this latitude only the
 * anomaly test, which is relative to local climate, can raise an alert.
 */
export const CALIBRATED_MAX_ABS_LAT = 38

export const isCalibratedSite = (lat: number): boolean => Math.abs(lat) <= CALIBRATED_MAX_ABS_LAT

export interface Trigger {
  type: HazardType
  severity: HazardSeverity
  basis: 'absolute' | 'anomaly'
  /** Absolute limit crossed, or the departure in degrees C for an anomaly. */
  limit: number
  value: number
  unit: '°C' | 'm'
  /** Normal temperature at that hour, for anomaly triggers. */
  normal: number | null
}

const worse = (a: Trigger | null, b: Trigger | null): Trigger | null =>
  !a ? b : !b ? a : SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a

/**
 * Temperature check: the more severe of (a) a fixed threshold, at latitudes
 * where those are calibrated, and (b) an unusual departure from local normal.
 */
export function evaluateTemperature(tempC: number, lat: number, normal?: { mean: number; sd: number } | null): Trigger | null {
  let absolute: Trigger | null = null
  if (isCalibratedSite(lat)) {
    const hit = THRESHOLDS.filter((t) => (t.type === 'heatwave' ? tempC >= t.limit : tempC <= t.limit))
    const t = hit.length ? hit.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a)) : null
    if (t) absolute = { type: t.type, severity: t.severity, basis: 'absolute', limit: t.limit, value: tempC, unit: '°C', normal: null }
  }
  let anomaly: Trigger | null = null
  if (normal) {
    const delta = tempC - normal.mean
    const z = Math.abs(delta) / Math.max(normal.sd, MIN_SD_C)
    const stressful = delta > 0 ? tempC >= ANOMALY_MIN_HEAT_C : tempC <= ANOMALY_MAX_COLD_C
    const tier = stressful ? ANOMALY_TIERS.find((t) => Math.abs(delta) >= t.minDeltaC && z >= t.minZ) : undefined
    const type: HazardType = delta > 0 ? 'heatwave' : 'coldwave'
    const cap = anomalyCap(type, tempC)
    if (tier) {
      anomaly = {
        type,
        severity: SEVERITY_RANK[tier.severity] > SEVERITY_RANK[cap] ? cap : tier.severity,
        basis: 'anomaly',
        limit: tier.minDeltaC,
        value: tempC,
        unit: '°C',
        normal: normal.mean,
      }
    }
  }
  return worse(absolute, anomaly)
}

export function evaluateWaves(heightM: number): Trigger | null {
  const t = WAVE_THRESHOLDS.find((x) => heightM >= x.limit)
  return t ? { type: 'highwaves', severity: t.severity, basis: 'absolute', limit: t.limit, value: heightM, unit: 'm', normal: null } : null
}

/* ── Suggested response checklist ────────────────────────────────────────── */

const ACTIONS: Record<HazardType, Record<HazardSeverity, string[]>> = {
  highwaves: {
    watch: [
      'Send a field team to capture fresh photos of the coastline, embankments and landing sites.',
      'Advise small boats and fishers to check the marine forecast before going out.',
    ],
    warning: [
      'Advise fishers and small vessels to stay ashore, and secure boats and gear.',
      'Send a field team to capture fresh evidence of the shoreline and coastal defences.',
      'Notify the district disaster-management contact and check low-lying coastal settlements.',
    ],
    emergency: [
      'Escalate to the district disaster-management authority immediately.',
      'Prepare evacuation of low-lying coastal settlements and open shelters.',
      'Send a field team when safe; treat their upload as the priority evidence for this incident.',
    ],
  },
  heatwave: {
    watch: [
      'Send a field team to capture fresh photos or video of the site so conditions are on record.',
      'Check that drinking-water points at the site are working.',
    ],
    warning: [
      'Send a field team now to capture fresh evidence of the site and nearby settlements.',
      'Advise outdoor work to pause during the hottest hours of the day.',
      'Confirm drinking water, shade and cooling points are available to the community.',
      'Notify the district disaster-management contact for this location.',
    ],
    emergency: [
      'Escalate to the district disaster-management authority immediately.',
      'Send a field team now; treat their upload as the priority evidence for this incident.',
      'Suspend non-essential outdoor work and open cooling and rest points.',
      'Prioritise water supply, and check on children, elderly people and outdoor workers.',
    ],
  },
  coldwave: {
    watch: [
      'Send a field team to capture fresh photos of the site so conditions are on record.',
      'Check that shelter and heating supplies are stocked.',
    ],
    warning: [
      'Send a field team now to capture fresh evidence of the site.',
      'Open warming shelters and distribute blankets to exposed households.',
      'Notify the district disaster-management contact for this location.',
    ],
    emergency: [
      'Escalate to the district disaster-management authority immediately.',
      'Send a field team now; treat their upload as the priority evidence for this incident.',
      'Open warming shelters and prioritise people sleeping outdoors, children and the elderly.',
    ],
  },
}

export const actionsFor = (type: HazardType, severity: HazardSeverity): string[] => ACTIONS[type][severity]

/* ── Visual corroboration ────────────────────────────────────────────────── */

/** Concepts in imagery that directly support each hazard. */
const SUPPORTING_CONCEPTS: Record<HazardType, Set<string>> = {
  heatwave: new Set(['heat-drought', 'wildfire']),
  coldwave: new Set(['glacier-ice']),
  highwaves: new Set(['coastal-surge', 'flood-climate', 'mangrove-coastal']),
}

type EvidenceAsset = Pick<AssetDocument, '_id' | 'observation'>

export interface Corroboration {
  level: 'corroborated' | 'uncorroborated' | 'no-imagery'
  analysed: number
  supporting: number
  /** Recognised themes that appeared, e.g. "Heat & drought signs". */
  themes: string[]
  supportingAssetIds: string[]
  text: string
}

/** Do the site's analysed captures show anything consistent with the hazard? */
export function corroborate(type: HazardType, assets: EvidenceAsset[], past = false): Corroboration {
  const analysed = assets.filter((a) => a.observation)
  if (analysed.length === 0) {
    return {
      level: 'no-imagery', analysed: 0, supporting: 0, themes: [], supportingAssetIds: [],
      text: past
        ? 'No analysed imagery existed for this site when the incident closed, so the sensor reading stood alone.'
        : 'No analysed imagery exists for this site yet, so the sensor reading stands alone. A field capture is the fastest way to confirm conditions.',
    }
  }
  const wanted = SUPPORTING_CONCEPTS[type]
  const themes = new Set<string>()
  const ids: string[] = []
  for (const a of analysed) {
    const hits = conceptsOf(observationText(a.observation)).filter((c) => wanted.has(c.conceptId))
    if (hits.length > 0) {
      ids.push(a._id.toHexString())
      hits.forEach((h) => themes.add(conceptLabel(h.conceptId)))
    }
  }
  const noun = `${analysed.length} analysed capture${analysed.length === 1 ? '' : 's'}`
  if (ids.length === 0) {
    return {
      level: 'uncorroborated', analysed: analysed.length, supporting: 0, themes: [], supportingAssetIds: [],
      text: `None of the ${noun} at this site show signs of ${type === 'heatwave' ? 'heat stress' : type === 'coldwave' ? 'cold conditions' : 'rough seas or coastal flooding'}. ${past ? 'The imagery may simply not cover the incident.' : 'That may only mean the imagery predates the event, so treat the sensor as the only signal until fresh media is uploaded.'}`,
    }
  }
  return {
    level: 'corroborated', analysed: analysed.length, supporting: ids.length, themes: [...themes], supportingAssetIds: ids,
    text: `${ids.length} of ${noun} at this site show ${[...themes].join(', ').toLowerCase()}, consistent with the sensor reading.`,
  }
}

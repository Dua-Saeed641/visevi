import type { Db } from 'mongodb'
import { readExposure } from './exposure.js'
import { corroborate, evaluateTemperature, evaluateWaves, SEVERITY_RANK } from './hazards.js'
import type { AlertDocument, AssetDocument, HazardSeverity, LocationDocument, ReadingDocument } from './models.js'
import { distanceKm, eventsNear, fetchForecast, type Forecast } from './weather.js'

/**
 * Disaster Risk Index for a monitored site: 0 to 100, plus a separate
 * confidence value saying how much of that number rests on fresh, sourced data.
 *
 * It is a transparent weighted formula, not a trained model. Six factors, each
 * scaled to 0..1 from data we hold or can fetch, combined as
 *
 *     risk = 100 x sum(weight x factor) / sum(weight of the factors that were available)
 *
 * so an unavailable factor never silently counts as "safe". The weights are
 * judgement (long-run exposure matters most, then what is happening and what is
 * forecast), stated here and returned with every result so they can be argued
 * with and changed.
 */
export const RISK_WEIGHTS = {
  exposure: 25,
  live: 20,
  forecast: 20,
  history: 15,
  events: 10,
  visual: 10,
} as const

export type RiskFactorId = keyof typeof RISK_WEIGHTS

export interface RiskFactor {
  id: RiskFactorId
  label: string
  weight: number
  /** 0..1, or null when the data was unavailable. */
  value: number | null
  /** Points this factor adds to the 0..100 score. */
  points: number
  /** 0..1: how much to trust this factor's value. */
  confidence: number
  detail: string
  source: string
}

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe'

export interface SiteRisk {
  locationId: string
  name: string
  score: number
  level: RiskLevel
  /** 0..100: weighted trust in the factors that fed the score. */
  confidence: number
  dominant: { hazard: string; driver: string }
  factors: RiskFactor[]
}

export const RISK_LEVELS: { level: RiskLevel; min: number }[] = [
  { level: 'Severe', min: 65 },
  { level: 'High', min: 45 },
  { level: 'Moderate', min: 25 },
  { level: 'Low', min: 0 },
]
const levelOf = (score: number): RiskLevel => RISK_LEVELS.find((l) => score >= l.min)!.level

const SEV_VALUE: Record<HazardSeverity, number> = { watch: 0.4, warning: 0.7, emergency: 1 }
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const HAZARD_NAME: Record<string, string> = {
  drought: 'Drought', flood: 'Flooding', cyclone: 'Cyclone', landslide: 'Landslide',
  heat: 'Heat', cold: 'Cold', rain: 'Heavy rain', wind: 'Strong wind', waves: 'High waves',
}

interface Ctx {
  latest: ReadingDocument | null
  alerts: AlertDocument[]
  assets: Pick<AssetDocument, '_id' | 'observation'>[]
}

export async function computeSiteRisk(db: Db, loc: LocationDocument, ctx: Ctx): Promise<SiteRisk> {
  const lat = loc.lat as number
  const lng = loc.lng as number
  const factors: RiskFactor[] = []
  const hazardVotes: { hazard: string; value: number; driver: string }[] = []

  /* 1. Structural exposure: long-run hazard maps (static). */
  let exposure = loc.exposure?.readings
  if (!exposure) {
    try {
      const r = await readExposure(lat, lng)
      if (r.length > 0) {
        exposure = r
        await db.collection<LocationDocument>('locations').updateOne({ _id: loc._id }, { $set: { exposure: { readings: r, fetchedAt: new Date() } } })
      }
    } catch {
      /* leave unavailable */
    }
  }
  if (exposure && exposure.length > 0) {
    const top = [...exposure].sort((a, b) => b.score - a.score)
    const v = top[0].score
    const present = top.filter((t) => t.klass)
    hazardVotes.push({ hazard: top[0].hazard, value: v, driver: 'long-run exposure' })
    factors.push({
      id: 'exposure', label: 'Long-run exposure', weight: RISK_WEIGHTS.exposure, value: v, points: 0,
      confidence: exposure.length / 4,
      detail: present.length
        ? `NASA hazard maps record ${present.map((t) => `${HAZARD_NAME[t.hazard].toLowerCase()} (class ${t.klass!.position} of ${t.klass!.of})`).join(', ')} at this location.`
        : 'NASA hazard maps record no drought, flood, cyclone or landslide hazard at this location.',
      source: 'NASA SEDAC Natural Disaster Hotspots (historical, 1980 to 2003)',
    })
  } else {
    factors.push({ id: 'exposure', label: 'Long-run exposure', weight: RISK_WEIGHTS.exposure, value: null, points: 0, confidence: 0, detail: 'Hazard maps could not be read for this location.', source: 'NASA SEDAC Natural Disaster Hotspots' })
  }

  /* 2. Live conditions: latest reading against fixed limits and local normal. */
  const r = ctx.latest
  if (r) {
    const abs = evaluateTemperature(r.tempC, lat, null)
    const absV = abs ? SEV_VALUE[abs.severity] : 0
    const stressful = r.anomalyC !== null && (r.anomalyC > 0 ? r.tempC >= 30 : r.tempC <= 10)
    const anomV = r.anomalyC !== null && stressful ? clamp01(Math.abs(r.anomalyC) / 10) : 0
    const wave = r.waveHeightM !== null ? evaluateWaves(r.waveHeightM) : null
    const waveV = wave ? SEV_VALUE[wave.severity] : 0
    const v = Math.max(absV, anomV, waveV)
    const type = waveV >= Math.max(absV, anomV) && waveV > 0 ? 'waves' : (r.anomalyC ?? 0) < 0 || r.tempC < 15 ? 'cold' : 'heat'
    hazardVotes.push({ hazard: type, value: v, driver: 'live conditions' })
    const ageH = (Date.now() - r.observedAt.getTime()) / 3_600_000
    factors.push({
      id: 'live', label: 'Live conditions', weight: RISK_WEIGHTS.live, value: v, points: 0,
      confidence: (ageH < 3 ? 1 : ageH < 24 ? 0.7 : ageH < 72 ? 0.4 : 0.2) * (r.normalC !== null ? 1 : 0.7),
      detail: `${r.tempC.toFixed(1)} °C now${r.anomalyC !== null && r.normalC !== null ? `, ${r.anomalyC > 0 ? '+' : ''}${r.anomalyC.toFixed(1)} °C against a local normal of ${r.normalC.toFixed(1)} °C` : ''}${r.waveHeightM !== null ? `, waves ${r.waveHeightM.toFixed(1)} m` : ''}.`,
      source: r.source === 'open-meteo' ? 'Open-Meteo (current) and ten-year archive' : `${r.source} reading`,
    })
  } else {
    factors.push({ id: 'live', label: 'Live conditions', weight: RISK_WEIGHTS.live, value: null, points: 0, confidence: 0, detail: 'No reading has been recorded for this site yet.', source: 'Open-Meteo' })
  }

  /* 3. Seven-day outlook. */
  let f: Forecast | null = null
  try {
    f = await fetchForecast(lat, lng)
  } catch {
    /* leave unavailable */
  }
  if (f) {
    const heat = evaluateTemperature(f.maxTempC, lat, null)
    const cold = evaluateTemperature(f.minTempC, lat, null)
    const scored = [
      { hazard: 'heat', v: heat?.type === 'heatwave' ? SEV_VALUE[heat.severity] : 0 },
      { hazard: 'cold', v: cold?.type === 'coldwave' ? SEV_VALUE[cold.severity] : 0 },
      // Only weather beyond the ordinary counts: ~40 mm a week of rain and ~45 km/h gusts are normal almost everywhere.
      { hazard: 'rain', v: clamp01((f.rainMm - 40) / 200) },
      { hazard: 'wind', v: clamp01((f.maxGustKmh - 45) / 75) },
    ].sort((a, b) => b.v - a.v)
    hazardVotes.push({ hazard: scored[0].hazard, value: scored[0].v, driver: 'the 7-day forecast' })
    factors.push({
      id: 'forecast', label: '7-day outlook', weight: RISK_WEIGHTS.forecast, value: scored[0].v, points: 0, confidence: 1,
      detail: `Next ${f.days} days: up to ${f.maxTempC.toFixed(0)} °C, down to ${f.minTempC.toFixed(0)} °C, ${f.rainMm.toFixed(0)} mm rain, gusts to ${f.maxGustKmh.toFixed(0)} km/h.`,
      source: 'Open-Meteo forecast',
    })
  } else {
    factors.push({ id: 'forecast', label: '7-day outlook', weight: RISK_WEIGHTS.forecast, value: null, points: 0, confidence: 0, detail: 'The forecast could not be fetched.', source: 'Open-Meteo forecast' })
  }

  /* 4. Recent incidents at this site (this system's own alert history, last 180 days). */
  const since = Date.now() - 180 * 86_400_000
  const recent = ctx.alerts.filter((a) => a.createdAt.getTime() >= since)
  const pts = recent.reduce((s, a) => s + SEVERITY_RANK[a.severity], 0)
  factors.push({
    id: 'history', label: 'Recent incidents', weight: RISK_WEIGHTS.history, value: clamp01(pts / 6), points: 0, confidence: 0.8,
    detail: recent.length ? `${recent.length} incident${recent.length === 1 ? '' : 's'} in the last 180 days (${recent.filter((a) => a.severity === 'emergency').length} emergency, ${recent.filter((a) => a.severity === 'warning').length} warning, ${recent.filter((a) => a.severity === 'watch').length} watch).` : 'No incidents recorded here in the last 180 days.',
    source: 'VisEvi alert history',
  })

  /* 5. Live natural events near the site. */
  try {
    const events = (await eventsNear(lat, lng)).map((e) => ({ e, km: distanceKm(lat, lng, e.lat, e.lng) })).filter((x) => x.km <= 300)
    const closeness = events.reduce((s, x) => s + (1 - x.km / 300), 0)
    factors.push({
      id: 'events', label: 'Nearby active events', weight: RISK_WEIGHTS.events, value: clamp01(closeness / 3), points: 0, confidence: 1,
      detail: events.length ? `${events.length} NASA-tracked event${events.length === 1 ? '' : 's'} within 300 km, nearest ${Math.round(Math.min(...events.map((x) => x.km)))} km (${events.sort((a, b) => a.km - b.km)[0].e.category.toLowerCase()}).` : 'No NASA-tracked event within 300 km.',
      source: 'NASA EONET',
    })
  } catch {
    factors.push({ id: 'events', label: 'Nearby active events', weight: RISK_WEIGHTS.events, value: null, points: 0, confidence: 0, detail: 'NASA EONET could not be reached.', source: 'NASA EONET' })
  }

  /* 6. What Cloudinary AI sees in this site's own imagery. */
  const analysed = ctx.assets.filter((a) => a.observation)
  if (analysed.length > 0) {
    // Cold is left out on purpose: ice and snow in a photo of a glacier or mountain is the
    // normal state, not a sign of a cold event, so it would only inflate cold-climate sites.
    const fractions = (['heatwave', 'highwaves'] as const).map((t) => {
      const c = corroborate(t, analysed)
      return c.supporting / Math.max(1, c.analysed)
    })
    const v = Math.max(...fractions)
    factors.push({
      id: 'visual', label: 'Hazard signs in imagery', weight: RISK_WEIGHTS.visual, value: v, points: 0, confidence: Math.min(1, analysed.length / 4),
      detail: `${Math.round(v * 100)}% of ${analysed.length} analysed capture${analysed.length === 1 ? '' : 's'} show signs of heat stress or rough water.`,
      source: 'Cloudinary AI Vision on this site\'s captures',
    })
  } else {
    factors.push({ id: 'visual', label: 'Hazard signs in imagery', weight: RISK_WEIGHTS.visual, value: null, points: 0, confidence: 0, detail: 'No analysed imagery for this site yet.', source: 'Cloudinary AI Vision' })
  }

  const usedWeight = factors.filter((x) => x.value !== null).reduce((s, x) => s + x.weight, 0)
  for (const x of factors) x.points = x.value === null || usedWeight === 0 ? 0 : (100 * x.weight * x.value) / usedWeight
  const score = Math.round(factors.reduce((s, x) => s + x.points, 0))
  const totalWeight = Object.values(RISK_WEIGHTS).reduce((s, w) => s + w, 0)
  const confidence = Math.round((100 * factors.reduce((s, x) => s + x.weight * x.confidence, 0)) / totalWeight)

  const lead = [...hazardVotes].sort((a, b) => b.value - a.value)[0]
  return {
    locationId: loc._id.toHexString(),
    name: loc.name,
    score,
    level: levelOf(score),
    confidence,
    dominant: lead && lead.value > 0 ? { hazard: HAZARD_NAME[lead.hazard] ?? lead.hazard, driver: lead.driver } : { hazard: 'None dominant', driver: 'no factor stands out' },
    factors,
  }
}

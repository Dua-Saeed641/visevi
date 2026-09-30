import { env } from '../env.js'
import type { ReadingSource } from './models.js'

export interface WeatherReading {
  tempC: number
  feelsLikeC: number | null
  humidity: number | null
  condition: string | null
  observedAt: Date
  source: ReadingSource
}

const TIMEOUT_MS = 8000

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`)
  return res.json()
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Google Maps Platform Weather API — current conditions at a coordinate. */
async function fromGoogle(lat: number, lng: number): Promise<WeatherReading> {
  const url =
    'https://weather.googleapis.com/v1/currentConditions:lookup' +
    `?key=${encodeURIComponent(env.googleMapsApiKey)}&location.latitude=${lat}&location.longitude=${lng}`
  const j = (await getJson(url)) as {
    currentTime?: string
    temperature?: { degrees?: number; unit?: string }
    feelsLikeTemperature?: { degrees?: number }
    relativeHumidity?: number
    weatherCondition?: { description?: { text?: string } }
  }
  const tempC = num(j.temperature?.degrees)
  if (tempC === null) throw new Error('Google Weather response had no temperature')
  if (j.temperature?.unit && j.temperature.unit !== 'CELSIUS') throw new Error(`Unexpected unit ${j.temperature.unit}`)
  return {
    tempC,
    feelsLikeC: num(j.feelsLikeTemperature?.degrees),
    humidity: num(j.relativeHumidity),
    condition: j.weatherCondition?.description?.text ?? null,
    observedAt: j.currentTime ? new Date(j.currentTime) : new Date(),
    source: 'google-maps-weather',
  }
}

/** Keyless fallback so the pipeline still runs without a Google key. */
async function fromOpenMeteo(lat: number, lng: number): Promise<WeatherReading> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m&timezone=UTC'
  const j = (await getJson(url)) as {
    current?: { time?: string; temperature_2m?: number; apparent_temperature?: number; relative_humidity_2m?: number }
  }
  const tempC = num(j.current?.temperature_2m)
  if (tempC === null) throw new Error('Open-Meteo response had no temperature')
  return {
    tempC,
    feelsLikeC: num(j.current?.apparent_temperature),
    humidity: num(j.current?.relative_humidity_2m),
    condition: null,
    observedAt: j.current?.time ? new Date(`${j.current.time}Z`) : new Date(),
    source: 'open-meteo',
  }
}

/**
 * Current temperature at a coordinate. Uses Google Maps Platform Weather when a
 * key is configured; if that call fails (or there is no key) it falls back to
 * Open-Meteo. The reading records which provider actually answered — the source
 * is never mislabelled.
 */
export async function fetchCurrentWeather(lat: number, lng: number): Promise<WeatherReading> {
  if (env.googleMapsApiKey) {
    try {
      return await fromGoogle(lat, lng)
    } catch (err) {
      console.error('Google Weather failed, falling back to Open-Meteo:', err instanceof Error ? err.message : err)
    }
  }
  return fromOpenMeteo(lat, lng)
}

/* ── Climatology: what is normal here, for this month and hour ───────────── */

export interface Climatology {
  month: number
  years: number
  hourMean: number[]
  hourSd: number[]
}

/**
 * Ten complete years of hourly air temperature from the Open-Meteo archive
 * (free, keyless), reduced to a mean and standard deviation for each UTC hour
 * of one calendar month. That is "normal for this place, this month, this
 * hour", which lets a reading be judged against local climate rather than a
 * fixed number that is only right for one region.
 */
export async function fetchClimatologyMonths(lat: number, lng: number): Promise<Map<number, Climatology>> {
  const lastYear = new Date().getUTCFullYear() - 1
  const firstYear = lastYear - 9
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${firstYear}-01-01&end_date=${lastYear}-12-31&hourly=temperature_2m&timezone=UTC`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`archive-api.open-meteo.com responded ${res.status}`)
  const j = (await res.json()) as { hourly?: { time?: string[]; temperature_2m?: (number | null)[] } }
  const time = j.hourly?.time
  const temp = j.hourly?.temperature_2m
  if (!time || !temp) throw new Error('Open-Meteo archive returned no hourly data')

  // buckets[month][hour] -> values; "2019-05-14T07:00": month is chars 5-6, hour is chars 11-12.
  const buckets: number[][][] = Array.from({ length: 13 }, () => Array.from({ length: 24 }, () => []))
  const years: Set<string>[] = Array.from({ length: 13 }, () => new Set())
  for (let i = 0; i < time.length; i++) {
    const v = temp[i]
    if (v === null) continue
    const m = Number(time[i].slice(5, 7))
    buckets[m][Number(time[i].slice(11, 13))].push(v)
    years[m].add(time[i].slice(0, 4))
  }
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const out = new Map<number, Climatology>()
  for (let m = 1; m <= 12; m++) {
    if (buckets[m].some((b) => b.length < 2)) continue // a month with gaps is left out, never guessed
    const hourMean = buckets[m].map(mean)
    const hourSd = buckets[m].map((b, h) => Math.sqrt(mean(b.map((x) => (x - hourMean[h]) ** 2))))
    out.set(m, { month: m, years: years[m].size, hourMean, hourSd })
  }
  return out
}

export async function fetchClimatology(lat: number, lng: number, month: number): Promise<Climatology> {
  const c = (await fetchClimatologyMonths(lat, lng)).get(month)
  if (!c) throw new Error('Open-Meteo archive had gaps for this month')
  return c
}

/* ── History, for replay ─────────────────────────────────────────────────── */

export interface HistoricalHour {
  at: Date
  tempC: number
  feelsLikeC: number | null
}

/** Hourly ERA5 reanalysis temperature for a past date range (Open-Meteo archive, free). */
export async function fetchTemperatureHistory(lat: number, lng: number, from: string, to: string): Promise<HistoricalHour[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${from}&end_date=${to}&hourly=temperature_2m,apparent_temperature&timezone=UTC`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`archive-api.open-meteo.com responded ${res.status}`)
  const j = (await res.json()) as { hourly?: { time?: string[]; temperature_2m?: (number | null)[]; apparent_temperature?: (number | null)[] } }
  const h = j.hourly
  if (!h?.time || !h.temperature_2m) throw new Error('Open-Meteo archive returned no hourly data')
  const out: HistoricalHour[] = []
  for (let i = 0; i < h.time.length; i++) {
    const t = h.temperature_2m[i]
    if (t === null || t === undefined) continue
    out.push({ at: new Date(`${h.time[i]}:00Z`), tempC: t, feelsLikeC: h.apparent_temperature?.[i] ?? null })
  }
  return out
}

/** Hourly wave height for a past range, keyed by epoch ms. Empty for inland points. */
export async function fetchWaveHistory(lat: number, lng: number, from: string, to: string): Promise<Map<number, number>> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
    `&start_date=${from}&end_date=${to}&hourly=wave_height&timezone=UTC`
  const j = (await getJson(url)) as { hourly?: { time?: string[]; wave_height?: (number | null)[] } }
  const out = new Map<number, number>()
  j.hourly?.time?.forEach((t, i) => {
    const w = j.hourly?.wave_height?.[i]
    if (typeof w === "number") out.set(Date.parse(`${t}:00Z`), w)
  })
  return out
}

/* ── Marine: waves and sea temperature for coastal sites ─────────────────── */

export interface MarineReading {
  waveHeightM: number
  seaTempC: number | null
  seaLevelM: number | null
}

/** Null for inland points, where the marine model has no wave data. */
export async function fetchMarine(lat: number, lng: number): Promise<MarineReading | null> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
    '&current=wave_height,sea_surface_temperature,sea_level_height_msl&timezone=UTC'
  const j = (await getJson(url)) as {
    current?: { wave_height?: number | null; sea_surface_temperature?: number | null; sea_level_height_msl?: number | null }
  }
  const wave = num(j.current?.wave_height)
  if (wave === null) return null
  return { waveHeightM: wave, seaTempC: num(j.current?.sea_surface_temperature), seaLevelM: num(j.current?.sea_level_height_msl) }
}

/* ── NASA EONET: naturally occurring events open right now ───────────────── */

export interface NaturalEvent {
  id: string
  title: string
  category: string
  categoryId: string
  lat: number
  lng: number
  date: string
  link: string
}

const eventsCache = new Map<string, { at: number; events: NaturalEvent[] }>()

type EonetEvent = {
  id: string
  title: string
  link: string
  categories: { id: string; title: string }[]
  geometry: { date: string; type: string; coordinates: unknown }[]
}

/** One EONET query (cached 10 minutes per distinct query). Free, no key. */
async function eonet(query: string): Promise<NaturalEvent[]> {
  const hit = eventsCache.get(query)
  if (hit && Date.now() - hit.at < 600_000) return hit.events
  const j = (await getJson(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=3000${query}`)) as { events?: EonetEvent[] }
  const events: NaturalEvent[] = []
  for (const e of j.events ?? []) {
    const g = e.geometry[e.geometry.length - 1] // most recent position
    if (!g) continue
    let lng: number | undefined
    let lat: number | undefined
    if (g.type === 'Point') [lng, lat] = g.coordinates as number[]
    else if (g.type === 'Polygon') [lng, lat] = (g.coordinates as number[][][])[0][0]
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    events.push({ id: e.id, title: e.title, category: e.categories[0]?.title ?? 'Event', categoryId: e.categories[0]?.id ?? 'other', lat, lng, date: g.date, link: e.link })
  }
  if (eventsCache.size > 100) eventsCache.clear()
  eventsCache.set(query, { at: Date.now(), events })
  return events
}

/** Every open event except wildfires (there are thousands of those; see eventsNear). */
export const fetchNaturalEvents = () =>
  eonet('&category=drought,dustHaze,earthquakes,floods,landslides,manmade,seaLakeIce,severeStorms,snow,tempExtremes,volcanoes')

/** Open events, wildfires included, in a box of +-`deg` degrees around a point (about 330 km at 3). */
export const eventsNear = (lat: number, lng: number, deg = 3) =>
  eonet(`&bbox=${lng - deg},${Math.min(lat + deg, 90)},${lng + deg},${Math.max(lat - deg, -90)}`)

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/* ── Forecast, for the risk index ────────────────────────────────────────── */

export interface Forecast {
  days: number
  maxTempC: number
  minTempC: number
  rainMm: number
  maxGustKmh: number
}

const forecastCache = new Map<string, { at: number; value: Forecast }>()

/** Seven-day outlook (max/min temperature, total rain, peak gust). Cached 30 minutes. */
export async function fetchForecast(lat: number, lng: number): Promise<Forecast> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const hit = forecastCache.get(key)
  if (hit && Date.now() - hit.at < 1_800_000) return hit.value
  const j = (await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&forecast_days=7&timezone=UTC',
  )) as { daily?: { temperature_2m_max?: (number | null)[]; temperature_2m_min?: (number | null)[]; precipitation_sum?: (number | null)[]; wind_gusts_10m_max?: (number | null)[] } }
  const d = j.daily
  const clean = (a?: (number | null)[]) => (a ?? []).filter((x): x is number => typeof x === 'number')
  const tmax = clean(d?.temperature_2m_max)
  const tmin = clean(d?.temperature_2m_min)
  if (tmax.length === 0 || tmin.length === 0) throw new Error('Open-Meteo forecast returned no daily data')
  const value: Forecast = {
    days: tmax.length,
    maxTempC: Math.max(...tmax),
    minTempC: Math.min(...tmin),
    rainMm: clean(d?.precipitation_sum).reduce((s, x) => s + x, 0),
    maxGustKmh: Math.max(0, ...clean(d?.wind_gusts_10m_max)),
  }
  forecastCache.set(key, { at: Date.now(), value })
  return value
}

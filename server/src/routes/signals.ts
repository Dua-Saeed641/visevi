import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { env } from '../env.js'
import { evidenceBoardUrl } from '../lib/cloudinary.js'
import { measureFootprint } from '../lib/compare.js'
import { geocode } from '../lib/geocode.js'
import { channelsConfigured } from '../lib/notify.js'
import { runPipeline } from '../lib/pipeline.js'
import { computeSiteRisk, RISK_LEVELS, RISK_WEIGHTS, type SiteRisk } from '../lib/risk.js'
import {
  actionsFor,
  ANOMALY_TIERS,
  CALIBRATED_MAX_ABS_LAT,
  corroborate,
  evaluateTemperature,
  evaluateWaves,
  isCalibratedSite,
  SEVERITY_RANK,
  THRESHOLDS,
  WAVE_THRESHOLDS,
  type Trigger,
} from '../lib/hazards.js'
import type {
  AlertDocument,
  AlertStatus,
  AssetDocument,
  ContactDocument,
  HazardSeverity,
  HazardType,
  LocationDocument,
  NotificationDocument,
  ProjectDocument,
  ReadingDocument,
  ReadingSource,
} from '../lib/models.js'
import { getDb } from '../lib/mongo.js'
import { describeChange } from '../lib/narrative.js'
import {
  distanceKm,
  fetchClimatology,
  fetchCurrentWeather,
  fetchMarine,
  eventsNear,
  fetchNaturalEvents,
  type Climatology,
  type MarineReading,
  type WeatherReading,
} from '../lib/weather.js'

export const signalsRouter = Router()

const SOURCE_LABEL: Record<ReadingSource, string> = {
  'google-maps-weather': 'Google Maps Platform Weather',
  'open-meteo': 'Open-Meteo',
  'sensor-webhook': 'field sensor',
  'demo-simulator': 'demo simulator',
  'historical-replay': 'historical replay (ERA5)',
}

const when = (a: Pick<AssetDocument, 'capturedAt' | 'createdAt'>) => (a.capturedAt ?? a.createdAt).getTime()
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const validCoords = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

/* ── Climatology cache ───────────────────────────────────────────────────── */

/** "Normal" for this site and month: cached on the location, refreshed monthly. Null if unavailable. */
async function getClimatology(db: Db, loc: LocationDocument, at: Date): Promise<Climatology | null> {
  const month = at.getUTCMonth() + 1
  if (loc.climatology && loc.climatology.month === month) return loc.climatology
  if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null
  try {
    const c = await fetchClimatology(loc.lat, loc.lng, month)
    const stored = { ...c, fetchedAt: new Date() }
    await db.collection<LocationDocument>('locations').updateOne({ _id: loc._id }, { $set: { climatology: stored } })
    loc.climatology = stored
    return c
  } catch (err) {
    console.error(`Climatology unavailable for ${loc.name}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/* ── Ingest: turn a reading into (at most) one live alert per site + hazard ── */

interface IngestOutcome {
  reading: ReadingDocument
  /** Most severe alert touched by this reading, if any. */
  alert: AlertDocument | null
  alerts: AlertDocument[]
  created: boolean
  escalated: boolean
}

async function upsertAlert(
  db: Db,
  loc: LocationDocument,
  trig: Trigger,
  source: ReadingSource,
  feelsLikeC: number | null,
  observedAt: Date,
  now: Date,
) {
  const alerts = db.collection<AlertDocument>('alerts')
  // One live (not resolved) alert per site and hazard: repeat polls update it
  // instead of flooding the queue. A resolved alert is closed history; a fresh
  // breach after resolution raises a new one.
  const existing = await alerts.findOne({ locationId: loc._id, type: trig.type, status: { $ne: 'resolved' } })
  if (!existing) {
    const alert: AlertDocument = {
      _id: new ObjectId(),
      locationId: loc._id,
      type: trig.type,
      severity: trig.severity,
      status: 'open',
      trigger: { value: trig.value, unit: trig.unit, basis: trig.basis, threshold: trig.limit, normal: trig.normal, feelsLikeC, source, observedAt },
      peakValue: trig.value,
      latestValue: trig.value,
      readingCount: 1,
      createdAt: now,
      updatedAt: now,
    }
    await alerts.insertOne(alert)
    return { alert, created: true, escalated: false }
  }

  const escalated = SEVERITY_RANK[trig.severity] > SEVERITY_RANK[existing.severity]
  // Cold is worse when lower; heat and waves are worse when higher.
  const moreExtreme = trig.type === 'coldwave' ? trig.value < existing.peakValue : trig.value > existing.peakValue
  const patch: Partial<AlertDocument> = {
    latestValue: trig.value,
    peakValue: moreExtreme ? trig.value : existing.peakValue,
    severity: escalated ? trig.severity : existing.severity,
    // A worse reading re-opens an acknowledged alert: someone must look again.
    status: escalated ? 'open' : existing.status,
    updatedAt: now,
  }
  await alerts.updateOne({ _id: existing._id }, { $set: patch, $inc: { readingCount: 1 } })
  return { alert: { ...existing, ...patch, readingCount: existing.readingCount + 1 }, created: false, escalated }
}

export interface RecordOptions {
  /** Supply the climate normal directly (replay), instead of the per-site cache. */
  clim?: Climatology | null
  /** Timestamp for created/updated; defaults to now. Replay passes the reading's own time. */
  now?: Date
  /** Replay stores only readings that touched an alert. */
  storeOnlyIfTriggered?: boolean
}

export async function recordReading(
  db: Db,
  loc: LocationDocument,
  r: WeatherReading,
  marine: MarineReading | null,
  opts: RecordOptions = {},
): Promise<IngestOutcome> {
  const now = opts.now ?? new Date()
  const clim = opts.clim !== undefined ? opts.clim : await getClimatology(db, loc, r.observedAt)
  const hour = r.observedAt.getUTCHours()
  const normal = clim ? { mean: clim.hourMean[hour], sd: clim.hourSd[hour] } : null

  const reading: ReadingDocument = {
    _id: new ObjectId(),
    locationId: loc._id,
    tempC: r.tempC,
    feelsLikeC: r.feelsLikeC,
    humidity: r.humidity,
    condition: r.condition,
    normalC: normal ? Math.round(normal.mean * 10) / 10 : null,
    anomalyC: normal ? Math.round((r.tempC - normal.mean) * 10) / 10 : null,
    waveHeightM: marine?.waveHeightM ?? null,
    seaTempC: marine?.seaTempC ?? null,
    seaLevelM: marine?.seaLevelM ?? null,
    source: r.source,
    observedAt: r.observedAt,
    createdAt: now,
  }
  const triggers = [
    evaluateTemperature(r.tempC, loc.lat ?? 0, normal),
    marine ? evaluateWaves(marine.waveHeightM) : null,
  ].filter((t): t is Trigger => t !== null)
  if (!opts.storeOnlyIfTriggered || triggers.length > 0) {
    await db.collection<ReadingDocument>('readings').insertOne(reading)
  }

  const touched: { alert: AlertDocument; created: boolean; escalated: boolean }[] = []
  for (const t of triggers) {
    // Wave data always comes from Open-Meteo Marine, unless the reading itself is a simulation.
    const source: ReadingSource =
      t.type === 'highwaves' && r.source !== 'demo-simulator' && r.source !== 'historical-replay' ? 'open-meteo' : r.source
    touched.push(await upsertAlert(db, loc, t, source, r.feelsLikeC, r.observedAt, now))
  }
  // A new or escalated LIVE alert starts the capture -> compare -> confirm -> notify loop.
  // History replays never do: a past incident must not fetch today's imagery.
  if (env.autoCapture && r.source !== 'historical-replay') {
    for (const t of touched) {
      if (t.created || t.escalated) {
        void runPipeline(db, t.alert._id, { escalated: t.escalated }).catch((e) => console.error('Pipeline error:', e))
      }
    }
  }
  const top = touched.reduce<AlertDocument | null>(
    (a, b) => (!a || SEVERITY_RANK[b.alert.severity] > SEVERITY_RANK[a.severity] ? b.alert : a),
    null,
  )
  return {
    reading,
    alert: top,
    alerts: touched.map((t) => t.alert),
    created: touched.some((t) => t.created),
    escalated: touched.some((t) => t.escalated),
  }
}

/** Polls every monitored site once. Used by the interval timer and POST /poll. */
export async function pollSites(db: Db) {
  const locations = await db
    .collection<LocationDocument>('locations')
    .find({ lat: { $ne: null }, lng: { $ne: null } })
    .toArray()
  const fetched = await Promise.allSettled(
    locations.map(async (l) => {
      const [weather, marine] = await Promise.all([
        fetchCurrentWeather(l.lat as number, l.lng as number),
        // Marine data is a bonus: a failure there must not lose the temperature reading.
        fetchMarine(l.lat as number, l.lng as number).catch(() => null),
      ])
      return { weather, marine }
    }),
  )
  const results: {
    locationId: string
    name: string
    tempC: number | null
    source: ReadingSource | null
    alert: { id: string; severity: string; type: string; created: boolean; escalated: boolean } | null
    error?: string
  }[] = []
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i]
    const f = fetched[i]
    if (f.status === 'rejected') {
      results.push({ locationId: loc._id.toHexString(), name: loc.name, tempC: null, source: null, alert: null, error: f.reason instanceof Error ? f.reason.message : 'fetch failed' })
      continue
    }
    const out = await recordReading(db, loc, f.value.weather, f.value.marine)
    results.push({
      locationId: loc._id.toHexString(),
      name: loc.name,
      tempC: f.value.weather.tempC,
      source: f.value.weather.source,
      alert: out.alert ? { id: out.alert._id.toHexString(), severity: out.alert.severity, type: out.alert.type, created: out.created, escalated: out.escalated } : null,
    })
  }
  return results
}

/* ── Serialisation ───────────────────────────────────────────────────────── */

function serializeReading(r: ReadingDocument | null) {
  if (!r) return null
  return {
    tempC: r.tempC,
    feelsLikeC: r.feelsLikeC,
    humidity: r.humidity,
    condition: r.condition,
    normalC: r.normalC ?? null,
    anomalyC: r.anomalyC ?? null,
    waveHeightM: r.waveHeightM ?? null,
    seaTempC: r.seaTempC ?? null,
    seaLevelM: r.seaLevelM ?? null,
    source: r.source,
    sourceLabel: SOURCE_LABEL[r.source],
    observedAt: r.observedAt.toISOString(),
  }
}

function serializeAlert(a: AlertDocument, loc: LocationDocument | null, project: ProjectDocument | null) {
  return {
    id: a._id.toHexString(),
    locationId: a.locationId.toHexString(),
    location: loc?.name ?? 'Unknown',
    projectName: project?.name ?? 'Unknown',
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    type: a.type,
    severity: a.severity,
    status: a.status,
    trigger: { ...a.trigger, observedAt: a.trigger.observedAt.toISOString(), sourceLabel: SOURCE_LABEL[a.trigger.source] },
    peakValue: a.peakValue,
    latestValue: a.latestValue,
    unit: a.trigger.unit,
    readingCount: a.readingCount,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    capture: a.capture ? { ...a.capture, assetId: a.capture.assetId?.toHexString() ?? null, at: a.capture.at.toISOString() } : null,
    confirmation: a.confirmation
      ? { ...a.confirmation, baselineAssetId: a.confirmation.baselineAssetId?.toHexString() ?? null, at: a.confirmation.at.toISOString() }
      : null,
    notifiedAt: a.notifiedAt?.toISOString() ?? null,
  }
}

async function locationAndProject(db: Db, locationId: ObjectId) {
  const loc = await db.collection<LocationDocument>('locations').findOne({ _id: locationId })
  const project = loc ? await db.collection<ProjectDocument>('projects').findOne({ _id: loc.projectId }) : null
  return { loc, project }
}

/* ── Routes ──────────────────────────────────────────────────────────────── */

/** Monitored sites (locations with coordinates) with their latest reading. */
signalsRouter.get('/sites', async (_req, res, next) => {
  try {
    const db = getDb()
    const [locations, projects] = await Promise.all([
      db.collection<LocationDocument>('locations').find({}).toArray(),
      db.collection<ProjectDocument>('projects').find({}).toArray(),
    ])
    const projectName = new Map(projects.map((p) => [p._id.toHexString(), p.name]))
    const monitored = locations.filter((l) => validCoords(l.lat, l.lng))
    const rows = await Promise.all(
      monitored.map(async (l) => {
        const [latest, openAlerts, assetCount] = await Promise.all([
          db.collection<ReadingDocument>('readings').find({ locationId: l._id }).sort({ observedAt: -1 }).limit(1).next(),
          db.collection<AlertDocument>('alerts').find({ locationId: l._id, status: { $ne: 'resolved' } }).toArray(),
          db.collection<AssetDocument>('assets').countDocuments({ locationId: l._id }),
        ])
        return {
          locationId: l._id.toHexString(),
          name: l.name,
          projectName: projectName.get(l.projectId.toHexString()) ?? 'Unknown',
          lat: l.lat as number,
          lng: l.lng as number,
          assetCount,
          // Absolute limits are calibrated only for low latitudes; the "unusual for
          // this place" test applies everywhere, so every monitored site can alert.
          alerting: true,
          absoluteCalibrated: isCalibratedSite(l.lat as number),
          latest: serializeReading(latest),
          openAlerts: openAlerts.length,
          worstSeverity: openAlerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0]?.severity ?? null,
        }
      }),
    )
    res.json({
      sites: rows,
      unmonitored: locations.length - monitored.length,
      provider: env.googleMapsApiKey ? 'google-maps-weather' : 'open-meteo',
      pollMinutes: env.sensorPollMinutes,
      thresholds: THRESHOLDS,
      waveThresholds: WAVE_THRESHOLDS,
      anomalyTiers: ANOMALY_TIERS,
      calibratedMaxAbsLat: CALIBRATED_MAX_ABS_LAT,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * Live natural events from NASA EONET for the map: every open storm, flood,
 * volcano, heat/cold extreme and so on worldwide, plus wildfires only near
 * monitored sites (there are thousands worldwide, which would bury the map).
 */
signalsRouter.get('/events', async (_req, res) => {
  try {
    const locations = await getDb()
      .collection<LocationDocument>('locations')
      .find({ lat: { $ne: null }, lng: { $ne: null } })
      .toArray()
    const [global, ...near] = await Promise.all([
      fetchNaturalEvents(),
      ...locations.map((l) => eventsNear(l.lat as number, l.lng as number).catch(() => [])),
    ])
    const seen = new Map(global.map((e) => [e.id, e]))
    for (const list of near) for (const e of list) if (!seen.has(e.id)) seen.set(e.id, e)
    res.json([...seen.values()])
  } catch (err) {
    console.error('EONET fetch failed:', err instanceof Error ? err.message : err)
    res.status(502).json({ error: 'NASA EONET is unreachable right now' })
  }
})

/** Place name -> coordinates (OpenStreetMap Nominatim), so nobody types lat/lng by hand. */
signalsRouter.get('/geocode', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 3) {
      res.status(400).json({ error: 'enter at least 3 characters' })
      return
    }
    const hit = await geocode(q)
    if (!hit) {
      res.status(404).json({ error: `no match found for "${q}"` })
      return
    }
    res.json(hit)
  } catch (err) {
    next(err)
  }
})

/** Give a location coordinates, making it a monitored site. */
signalsRouter.put('/sites/:locationId', async (req, res, next) => {
  try {
    const { lat, lng } = req.body ?? {}
    if (!ObjectId.isValid(req.params.locationId) || !validCoords(lat, lng)) {
      res.status(400).json({ error: 'a valid locationId and numeric lat (-90..90) and lng (-180..180) are required' })
      return
    }
    const r = await getDb()
      .collection<LocationDocument>('locations')
      // Moving a site invalidates its cached climate normal.
      .updateOne({ _id: new ObjectId(req.params.locationId) }, { $set: { lat, lng, climatology: null } })
    if (r.matchedCount === 0) {
      res.status(404).json({ error: 'location not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/**
 * Signal intake for a physical/IoT sensor (or the in-app simulator):
 * POST { locationId, temperatureC, feelsLikeC?, humidity?, waveHeightM?, source? }.
 * Set SENSOR_WEBHOOK_SECRET to require an `x-sensor-key` header for real
 * sensors; the demo simulator source stays open so the demo works anywhere.
 */
signalsRouter.post('/ingest', async (req, res, next) => {
  try {
    const { locationId, temperatureC, feelsLikeC, humidity, waveHeightM } = req.body ?? {}
    const source: ReadingSource = req.body?.source === 'demo-simulator' ? 'demo-simulator' : 'sensor-webhook'
    if (source === 'sensor-webhook' && process.env.SENSOR_WEBHOOK_SECRET && req.get('x-sensor-key') !== process.env.SENSOR_WEBHOOK_SECRET) {
      res.status(401).json({ error: 'invalid sensor key' })
      return
    }
    if (typeof locationId !== 'string' || !ObjectId.isValid(locationId)) {
      res.status(400).json({ error: 'locationId must be a valid location id' })
      return
    }
    if (typeof temperatureC !== 'number' || !Number.isFinite(temperatureC) || temperatureC < -90 || temperatureC > 65) {
      res.status(400).json({ error: 'temperatureC must be a number between -90 and 65' })
      return
    }
    if (waveHeightM !== undefined && (typeof waveHeightM !== 'number' || !Number.isFinite(waveHeightM) || waveHeightM < 0 || waveHeightM > 30)) {
      res.status(400).json({ error: 'waveHeightM must be a number between 0 and 30' })
      return
    }
    const db = getDb()
    const loc = await db.collection<LocationDocument>('locations').findOne({ _id: new ObjectId(locationId) })
    if (!loc) {
      res.status(404).json({ error: 'location not found' })
      return
    }
    const out = await recordReading(
      db,
      loc,
      {
        tempC: temperatureC,
        feelsLikeC: typeof feelsLikeC === 'number' ? feelsLikeC : null,
        humidity: typeof humidity === 'number' ? humidity : null,
        condition: null,
        observedAt: new Date(),
        source,
      },
      typeof waveHeightM === 'number' ? { waveHeightM, seaTempC: null, seaLevelM: null } : null,
    )
    const { project } = await locationAndProject(db, loc._id)
    res.status(201).json({
      reading: serializeReading(out.reading),
      alert: out.alert ? serializeAlert(out.alert, loc, project) : null,
      alerts: out.alerts.map((a) => serializeAlert(a, loc, project)),
      created: out.created,
      escalated: out.escalated,
    })
  } catch (err) {
    next(err)
  }
})

/** Fetch live conditions for every monitored site now (also runs on a timer). */
signalsRouter.post('/poll', async (_req, res, next) => {
  try {
    const results = await pollSites(getDb())
    res.json({ polled: results.length, results })
  } catch (err) {
    next(err)
  }
})

signalsRouter.get('/alerts', async (req, res, next) => {
  try {
    const db = getDb()
    const status = String(req.query.status ?? '')
    const query = ['open', 'acknowledged', 'resolved'].includes(status) ? { status: status as AlertStatus } : {}
    const alerts = await db.collection<AlertDocument>('alerts').find(query).sort({ createdAt: -1 }).limit(200).toArray()
    const out = await Promise.all(
      alerts.map(async (a) => {
        const { loc, project } = await locationAndProject(db, a.locationId)
        return serializeAlert(a, loc, project)
      }),
    )
    res.json(out)
  } catch (err) {
    next(err)
  }
})

const HAZARD_NAME: Record<HazardType, string> = { heatwave: 'heat wave', coldwave: 'cold wave', highwaves: 'high waves' }
const BOARD_LABEL: Record<HazardType, string> = { heatwave: 'HEAT', coldwave: 'COLD', highwaves: 'WAVES' }

/** NASA EONET categories that bear on each hazard. */
const RELEVANT_EVENTS: Record<HazardType, string[]> = {
  heatwave: ['wildfires', 'tempExtremes', 'drought', 'dustHaze'],
  coldwave: ['tempExtremes', 'snow', 'seaLakeIce', 'severeStorms'],
  highwaves: ['severeStorms', 'floods'],
}
const NEARBY_KM = 300

function describeTrigger(a: AlertDocument, site: string): string {
  const t = a.trigger
  const src = SOURCE_LABEL[t.source]
  if (a.type === 'highwaves') {
    return `${src} reported ${t.value.toFixed(1)} m waves off ${site}, at or above the ${t.threshold} m ${a.severity} level.`
  }
  const feels = t.feelsLikeC !== null ? ` (feels like ${t.feelsLikeC.toFixed(1)} °C)` : ''
  if (t.basis === 'anomaly' && t.normal !== null) {
    const d = t.value - t.normal
    return `${src} reported ${t.value.toFixed(1)} °C at ${site}${feels}, ${Math.abs(d).toFixed(1)} °C ${d > 0 ? 'above' : 'below'} what is normal there for this hour and month (about ${t.normal.toFixed(1)} °C, from ten years of local history).`
  }
  return `${src} reported ${t.value.toFixed(1)} °C at ${site}${feels}, ${a.type === 'heatwave' ? 'above' : 'below'} the ${t.threshold} °C ${a.type === 'heatwave' ? 'heat' : 'cold'} threshold.`
}

/**
 * Alert + assessment. The assessment is computed from the site's current
 * evidence on every read, so media uploaded after the alert was raised
 * immediately changes the comparison and the corroboration.
 */
signalsRouter.get('/alerts/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: 'invalid alert id' })
      return
    }
    const db = getDb()
    const alert = await db.collection<AlertDocument>('alerts').findOne({ _id: new ObjectId(req.params.id) })
    if (!alert) {
      res.status(404).json({ error: 'alert not found' })
      return
    }
    const { loc, project } = await locationAndProject(db, alert.locationId)
    // A closed alert cites only evidence that existed when it closed, so an alert
    // from last May never presents this September's photo as its "after". Open
    // alerts use everything, so a field capture uploaded in response counts at once.
    const cutoff = alert.status === 'resolved' && alert.resolvedAt ? alert.resolvedAt.getTime() : Infinity
    const assets = (await db.collection<AssetDocument>('assets').find({ locationId: alert.locationId }).toArray())
      .filter((a) => when(a) <= cutoff)
      .sort((a, b) => when(a) - when(b))

    const corroboration = corroborate(alert.type, assets, alert.status === 'resolved')
    const siteName = loc?.name ?? 'this site'
    const t = alert.trigger
    const insights: string[] = [describeTrigger(alert, siteName)]
    if (alert.readingCount > 1 && alert.peakValue !== t.value) {
      insights.push(`Across ${alert.readingCount} readings the most extreme was ${alert.peakValue.toFixed(1)} ${t.unit} and the latest is ${alert.latestValue.toFixed(1)} ${t.unit}.`)
    }

    // External signal: live NASA-tracked events near the site that bear on this hazard.
    let nearbyEvents: { id: string; title: string; category: string; km: number; date: string; link: string }[] = []
    // EONET only knows what is open today, so it says nothing about a closed (historical) incident.
    const live = alert.status !== 'resolved'
    if (live && loc && validCoords(loc.lat, loc.lng)) {
      try {
        const relevant = new Set(RELEVANT_EVENTS[alert.type])
        nearbyEvents = (await eventsNear(loc.lat as number, loc.lng as number))
          .filter((e) => relevant.has(e.categoryId))
          .map((e) => ({ id: e.id, title: e.title, category: e.category, km: Math.round(distanceKm(loc.lat as number, loc.lng as number, e.lat, e.lng)), date: e.date, link: e.link }))
          .filter((e) => e.km <= NEARBY_KM)
          .sort((a, b) => a.km - b.km)
          .slice(0, 5)
      } catch {
        /* EONET is supporting context; the alert stands without it */
      }
    }
    if (nearbyEvents.length > 0) {
      const n = nearbyEvents[0]
      insights.push(`NASA EONET lists ${nearbyEvents.length} active ${nearbyEvents.length === 1 ? 'event' : 'events'} within ${NEARBY_KM} km that bear on this hazard, nearest: ${n.title} (${n.category.toLowerCase()}), ${n.km} km away.`)
    } else if (live && loc) {
      insights.push(`No active NASA-tracked event related to this hazard is listed within ${NEARBY_KM} km.`)
    }

    insights.push(corroboration.text)

    const latest = assets[assets.length - 1]
    if (latest) {
      const days = Math.max(0, Math.round((t.observedAt.getTime() - when(latest)) / 86_400_000))
      insights.push(
        days === 0
          ? 'The most recent capture at this site is from the same day as the reading.'
          : `The most recent capture at this site is ${days.toLocaleString('en-GB')} day${days === 1 ? '' : 's'} older than the reading${days > 30 ? ', so it may not reflect current conditions' : ''}.`,
      )
    }

    // Before/after. If the automatic pipeline captured a fresh snapshot, use it and its
    // chosen baseline (same season where possible). Otherwise fall back to the site's
    // first and latest captures. Either way it goes through the same comparison engine
    // as the Before / after page, so it is auditable there.
    let comparison: ReturnType<typeof describeChange> | null = null
    let before: AssetDocument | null = null
    let after: AssetDocument | null = null
    const capAsset = alert.capture?.assetId ? assets.find((x) => x._id.equals(alert.capture!.assetId!)) : undefined
    const baseAsset = alert.confirmation?.baselineAssetId ? assets.find((x) => x._id.equals(alert.confirmation!.baselineAssetId!)) : undefined
    if (capAsset && baseAsset) {
      before = baseAsset
      after = capAsset
    } else if (assets.length >= 2) {
      before = assets[0]
      after = latest
    }
    if (before && after) {
      const m = await measureFootprint(before, after)
      comparison = describeChange(before, after, {
        sameProject: before.projectId.equals(after.projectId),
        sameLocation: true,
        beforeProject: project?.name,
        afterProject: project?.name,
        sameFootprint: m.sameFootprint,
        pixels: m.pixels,
      })
      if (comparison.visual) {
        insights.push(`Before and after (${comparison.time.label} apart): ${comparison.visual.lines.slice(0, 3).join(' ')}${comparison.visual.seasonNote ? ' ' + comparison.visual.seasonNote : ''}`)
      } else {
        insights.push(`Comparing this site's first and latest captures (${comparison.time.label} apart): ${comparison.insights.slice(0, 2).join(' ')}`)
      }
    } else if (assets.length === 1) {
      insights.push('Only one capture exists for this site, so there is no before/after yet. Upload a fresh field capture to establish change.')
    }
    if (alert.capture) insights.push(`Automatic satellite capture: ${alert.capture.note}`)
    if (alert.confirmation) {
      const label = { confirmed: 'Confirmed', 'not-confirmed': 'Not confirmed', inconclusive: 'Inconclusive' }[alert.confirmation.status]
      insights.push(`Satellite check: ${label}. ${alert.confirmation.reasons.join(' ')}`)
    }

    let boardUrl: string | null = null
    if (before && after && before.resourceType === 'image' && after.resourceType === 'image') {
      const label = (prefix: string, a: AssetDocument) => `${prefix} ${fmtDate(a.capturedAt ?? a.createdAt)}`
      boardUrl = evidenceBoardUrl(
        { publicId: before.cloudinaryPublicId, version: before.cloudinaryVersion, label: label('BEFORE', before) },
        { publicId: after.cloudinaryPublicId, version: after.cloudinaryVersion, label: label('AFTER', after) },
        `${(alert.status === 'resolved' ? alert.peakValue : alert.latestValue).toFixed(1)} ${t.unit} ${BOARD_LABEL[alert.type]} ${alert.severity.toUpperCase()}${alert.status === 'resolved' ? ' PEAK' : ''}`,
      )
    }

    // Priority: how the desk should treat this. Severity sets the floor, and
    // imagery or a nearby tracked event that agrees raises it by one step.
    const supported = corroboration.level === 'corroborated' || nearbyEvents.length > 0
    const priority =
      alert.severity === 'emergency' ? 'escalate' : alert.severity === 'warning' ? (supported ? 'escalate' : 'respond') : supported ? 'respond' : 'monitor'
    const priorityReason =
      alert.severity === 'emergency'
        ? `The reading is at emergency level for a ${HAZARD_NAME[alert.type]}.`
        : supported
          ? `A ${alert.severity}-level ${HAZARD_NAME[alert.type]} backed by ${corroboration.level === 'corroborated' ? 'matching imagery' : 'a nearby active event'}.`
          : `A ${alert.severity}-level ${HAZARD_NAME[alert.type]} with no matching imagery or nearby event yet.`

    const side = (a: AssetDocument | null) =>
      a && {
        id: a._id.toHexString(),
        cloudinaryUrl: a.cloudinaryUrl,
        cloudinaryPublicId: a.cloudinaryPublicId,
        cloudinaryVersion: a.cloudinaryVersion,
        resourceType: a.resourceType,
        capturedAt: (a.capturedAt ?? a.createdAt).toISOString(),
        stage: a.stage,
        caption: a.observation?.caption ?? null,
      }

    const readings = await db
      .collection<ReadingDocument>('readings')
      .find({ locationId: alert.locationId })
      .sort({ observedAt: -1 })
      .limit(24)
      .toArray()

    res.json({
      alert: serializeAlert(alert, loc, project),
      priority,
      priorityReason,
      insights,
      corroboration,
      nearbyEvents,
      actions: actionsFor(alert.type, alert.severity),
      evidence: {
        assetCount: assets.length,
        before: side(before),
        after: side(after),
        boardUrl,
        comparison,
        compareLink: before && after ? `/compare?beforeId=${before._id.toHexString()}&afterId=${after._id.toHexString()}` : null,
      },
      readings: readings.reverse().map(serializeReading),
      notifications: (await db.collection<NotificationDocument>('notifications').find({ alertId: alert._id }).sort({ createdAt: -1 }).limit(20).toArray()).map((n) => ({
        id: n._id.toHexString(),
        contactName: n.contactName,
        channel: n.channel,
        status: n.status,
        detail: n.detail,
        subject: n.subject,
        createdAt: n.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    next(err)
  }
})

signalsRouter.post('/alerts/:id/status', async (req, res, next) => {
  try {
    const status = req.body?.status
    if (!ObjectId.isValid(req.params.id) || !['open', 'acknowledged', 'resolved'].includes(status)) {
      res.status(400).json({ error: 'a valid alert id and status (open | acknowledged | resolved) are required' })
      return
    }
    const now = new Date()
    const r = await getDb()
      .collection<AlertDocument>('alerts')
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status, updatedAt: now, resolvedAt: status === 'resolved' ? now : null } },
      )
    if (r.matchedCount === 0) {
      res.status(404).json({ error: 'alert not found' })
      return
    }
    res.json({ ok: true, status })
  } catch (err) {
    next(err)
  }
})

/** Run the capture -> compare -> confirm -> notify loop for an alert on demand (also runs automatically). */
signalsRouter.post('/alerts/:id/capture', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: 'invalid alert id' })
      return
    }
    const db = getDb()
    const alert = await db.collection<AlertDocument>('alerts').findOne({ _id: new ObjectId(req.params.id) })
    if (!alert) {
      res.status(404).json({ error: 'alert not found' })
      return
    }
    void runPipeline(db, alert._id, { escalated: true }).catch((e) => console.error('Pipeline error:', e))
    res.status(202).json({ ok: true, message: 'Capture started. Refresh in a few seconds.' })
  } catch (err) {
    next(err)
  }
})

/* ── Contacts: who is told ───────────────────────────────────────────────── */

function serializeContact(c: ContactDocument) {
  return {
    id: c._id.toHexString(),
    name: c.name,
    role: c.role,
    email: c.email ?? null,
    ntfyTopic: c.ntfyTopic ?? null,
    locationIds: c.locationIds.map((i) => i.toHexString()),
    minSeverity: c.minSeverity,
  }
}

signalsRouter.get('/contacts', async (_req, res, next) => {
  try {
    const list = await getDb().collection<ContactDocument>('contacts').find({}).sort({ createdAt: -1 }).toArray()
    res.json({ contacts: list.map(serializeContact), channels: channelsConfigured() })
  } catch (err) {
    next(err)
  }
})

signalsRouter.post('/contacts', async (req, res, next) => {
  try {
    const b = req.body ?? {}
    const name = String(b.name ?? '').trim()
    const email = String(b.email ?? '').trim() || null
    const ntfyTopic = String(b.ntfyTopic ?? '').trim() || null
    const minSeverity = (['watch', 'warning', 'emergency'] as const).includes(b.minSeverity) ? (b.minSeverity as HazardSeverity) : 'warning'
    if (!name) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'email does not look valid' })
      return
    }
    if (ntfyTopic && !/^[A-Za-z0-9_-]{4,64}$/.test(ntfyTopic)) {
      res.status(400).json({ error: 'ntfy topic must be 4-64 letters, digits, dashes or underscores (make it hard to guess: anyone who knows it can read it)' })
      return
    }
    const locationIds: ObjectId[] = Array.isArray(b.locationIds) ? b.locationIds.filter((i: unknown) => typeof i === 'string' && ObjectId.isValid(i)).map((i: string) => new ObjectId(i)) : []
    const doc: ContactDocument = { _id: new ObjectId(), name, role: String(b.role ?? '').trim() || 'Responsible officer', email, ntfyTopic, locationIds, minSeverity, createdAt: new Date() }
    await getDb().collection<ContactDocument>('contacts').insertOne(doc)
    res.status(201).json(serializeContact(doc))
  } catch (err) {
    next(err)
  }
})

signalsRouter.delete('/contacts/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: 'invalid contact id' })
      return
    }
    await getDb().collection<ContactDocument>('contacts').deleteOne({ _id: new ObjectId(req.params.id) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── Risk index ──────────────────────────────────────────────────────────── */

let riskCache: { at: number; body: unknown } | null = null

/**
 * GET /api/signals/risk: the Disaster Risk Index for every monitored site (0-100)
 * with its factor breakdown and a separate confidence score. Cached 10 minutes;
 * ?refresh=1 recomputes.
 */
signalsRouter.get('/risk', async (req, res, next) => {
  try {
    if (!req.query.refresh && riskCache && Date.now() - riskCache.at < 600_000) {
      res.json(riskCache.body)
      return
    }
    const db = getDb()
    const locations = (await db.collection<LocationDocument>('locations').find({ lat: { $ne: null }, lng: { $ne: null } }).toArray()).filter((l) => validCoords(l.lat, l.lng))
    const sites: SiteRisk[] = []
    // Three at a time: each site reads NASA tiles, a forecast and NASA events.
    for (let i = 0; i < locations.length; i += 3) {
      const batch = locations.slice(i, i + 3)
      sites.push(
        ...(await Promise.all(
          batch.map(async (loc) => {
            const [latest, alerts, assets] = await Promise.all([
              db.collection<ReadingDocument>('readings').find({ locationId: loc._id }).sort({ observedAt: -1 }).limit(1).next(),
              db.collection<AlertDocument>('alerts').find({ locationId: loc._id }).toArray(),
              db.collection<AssetDocument>('assets').find({ locationId: loc._id }, { projection: { observation: 1 } }).toArray(),
            ])
            return computeSiteRisk(db, loc, { latest, alerts, assets })
          }),
        )),
      )
    }
    sites.sort((a, b) => b.score - a.score)
    const body = {
      computedAt: new Date().toISOString(),
      sites,
      weights: RISK_WEIGHTS,
      levels: RISK_LEVELS,
      formula: 'risk = 100 x sum(weight x factor) / sum(weight of the factors that were available). Confidence = weighted trust in each factor (freshness, coverage, evidence count).',
    }
    riskCache = { at: Date.now(), body }
    res.json(body)
  } catch (err) {
    next(err)
  }
})

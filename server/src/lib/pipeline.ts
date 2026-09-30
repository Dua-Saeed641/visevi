import { ObjectId, type Db } from 'mongodb'
import { env } from '../env.js'
import { measureFootprint } from './compare.js'
import type { AlertDocument, AssetDocument, HazardType, LocationDocument, ProjectDocument } from './models.js'
import { ingestAsset } from './ingest.js'
import { notifyContacts } from './notify.js'
import type { PixelChange } from './pixels.js'
import { SATELLITE_SITES } from './satelliteSites.js'
import { latestClearSnapshot } from './worldview.js'

/**
 * The automatic loop that starts when a site turns alarming:
 *
 *   alert raised -> fresh NASA satellite snapshot of the site is captured and
 *   pushed through the normal Cloudinary pipeline -> compared, pixel by pixel,
 *   with an earlier same-footprint capture (same season where possible) ->
 *   the comparison confirms, fails to confirm, or cannot judge the hazard ->
 *   the responsible contacts are told.
 *
 * It never invents a confirmation: "inconclusive" is a first-class answer, and
 * every step is recorded on the alert so the reasoning can be read.
 */
const running = new Set<string>()
const DAY = 86_400_000
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`)

export type Judgement = { status: 'confirmed' | 'not-confirmed' | 'inconclusive'; reasons: string[] }

/**
 * Does the measured change support the hazard? MODIS true colour at ~250 m per
 * pixel shows land drying, vegetation stress, snow and gross water change; it
 * cannot resolve waves or feel cold, and the reasons say so instead of guessing.
 */
export function judge(type: HazardType, c: PixelChange, sameSeason: boolean): Judgement {
  const reasons: string[] = []
  if (c.commonClearPct < 50 || c.after.cloudPct > 30) {
    return { status: 'inconclusive', reasons: [`Only ${Math.round(c.commonClearPct)}% of the frame is clear in both images (cloud or missing data), too little to judge.`] }
  }
  const dGreen = c.after.green - c.before.green
  const dWater = c.after.waterPct - c.before.waterPct
  const dWhite = c.after.cloudPct - c.before.cloudPct

  if (type === 'heatwave') {
    // Thresholds sit well above the day-to-day noise of a true-colour index (about 0.02): a
    // change that small is not evidence of anything.
    if (dGreen <= -0.04) reasons.push(`Vegetation greenness fell (index ${c.before.green.toFixed(2)} to ${c.after.green.toFixed(2)}), consistent with drying under heat.`)
    if (dWater <= -5) reasons.push(`Water-like area shrank from ${Math.round(c.before.waterPct)}% to ${Math.round(c.after.waterPct)}% of the clear ground.`)
    if (reasons.length > 0 && sameSeason) return { status: 'confirmed', reasons }
    if (reasons.length > 0) return { status: 'inconclusive', reasons: [...reasons, 'The baseline is from a different season, so this may be seasonal rather than heat-driven.'] }
    if (sameSeason) return { status: 'not-confirmed', reasons: ['Compared with the same season a year earlier, the satellite view shows no drying: greenness and water-like area are about the same. Heat is not always visible from orbit, so this does not rule the alert out.'] }
    return { status: 'inconclusive', reasons: ['No drying is visible, but the baseline is from a different season, so it cannot be compared fairly.'] }
  }
  if (type === 'coldwave') {
    if (dWhite >= 8) return { status: 'confirmed', reasons: [`Bright, snow-like cover grew from ${Math.round(c.before.cloudPct)}% to ${Math.round(c.after.cloudPct)}% of the frame.`] }
    return { status: 'inconclusive', reasons: ['Cold is rarely visible in true-colour satellite imagery unless snow has fallen, and no new snow-like cover shows here.'] }
  }
  // highwaves
  if (dWater >= 5) return { status: 'confirmed', reasons: [`Water-like area grew from ${Math.round(c.before.waterPct)}% to ${Math.round(c.after.waterPct)}% of the clear ground, consistent with coastal flooding.`] }
  return { status: 'inconclusive', reasons: ['Waves cannot be resolved at this satellite resolution (about 250 m per pixel), and no gross coastal change is visible.'] }
}

const HAZARD: Record<HazardType, string> = { heatwave: 'Heat wave', coldwave: 'Cold wave', highwaves: 'High waves' }

export async function runPipeline(db: Db, alertId: ObjectId, opts: { escalated?: boolean } = {}): Promise<void> {
  const key = alertId.toHexString()
  if (running.has(key)) return
  running.add(key)
  const alerts = db.collection<AlertDocument>('alerts')
  const set = (patch: Partial<AlertDocument>) => alerts.updateOne({ _id: alertId }, { $set: { ...patch, updatedAt: new Date() } })
  try {
    const alert = await alerts.findOne({ _id: alertId })
    if (!alert) return
    const loc = await db.collection<LocationDocument>('locations').findOne({ _id: alert.locationId })
    const project = loc ? await db.collection<ProjectDocument>('projects').findOne({ _id: loc.projectId }) : null
    if (!loc || !project || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return
    const site = SATELLITE_SITES.find((s) => s.name === loc.name)
    const half = site?.half ?? 0.5
    const maxWhite = site?.maxWhite ?? 25
    const same = (a: AssetDocument) => a.capture && a.capture.lat === loc.lat && a.capture.lng === loc.lng && a.capture.halfDeg === half

    await set({ capture: { status: 'pending', note: 'Requesting a fresh NASA satellite snapshot of this site.', at: new Date() } })

    // 1. Capture. Reuse a recent capture rather than spending another AI analysis on the same days.
    const existing = (await db.collection<AssetDocument>('assets').find({ locationId: loc._id }).toArray()).filter(same)
    const today = Date.now()
    let after = existing.filter((a) => dayMs(a.capture!.date) >= today - 8 * DAY).sort((a, b) => b.capture!.date.localeCompare(a.capture!.date))[0]
    let capNote = ''
    if (after) {
      capNote = `A satellite capture from ${after.capture!.date} is recent enough, so it was reused.`
    } else {
      const snap = await latestClearSnapshot(loc.lat, loc.lng, half, { maxWhite, days: 10, skipDates: new Set(existing.map((a) => a.capture!.date)) })
      if (!snap.buf) {
        await set({
          capture: { status: 'cloudy', note: `No clear satellite view in the last 10 days (${snap.tried.slice(0, 4).join('; ')}).`, at: new Date() },
          confirmation: { status: 'inconclusive', reasons: ['No clear satellite view was available, so the sensor reading could not be checked against imagery. A field capture would resolve this.'], at: new Date() },
        })
        await notifyIfNeeded(db, alertId, opts.escalated ?? false)
        return
      }
      const r = await ingestAsset(db, {
        buffer: snap.buf,
        mimetype: 'image/jpeg',
        projectName: project.name,
        locationName: loc.name,
        stage: 'Live satellite capture',
        capturedAt: new Date(`${snap.date}T00:00:00Z`),
        lat: loc.lat,
        lng: loc.lng,
        capture: { halfDeg: half, date: snap.date, trusted: true },
      })
      after = r.asset
      capNote = `Captured a fresh NASA satellite snapshot from ${snap.date} (${snap.whitePct}% cloud) and ran it through Cloudinary.`
    }
    await set({ capture: { status: 'captured', assetId: after._id, date: after.capture!.date, note: capNote, at: new Date() } })

    // 2. Baseline: the capture closest to one year earlier (same season), else the closest overall.
    const afterMs = dayMs(after.capture!.date)
    const candidates = existing.filter((a) => a._id && !a._id.equals(after._id) && dayMs(a.capture!.date) < afterMs - 20 * DAY)
    const target = afterMs - 365 * DAY
    const baseline = [...candidates].sort((a, b) => Math.abs(dayMs(a.capture!.date) - target) - Math.abs(dayMs(b.capture!.date) - target))[0]
    if (!baseline) {
      await set({ confirmation: { status: 'inconclusive', reasons: ['There is no earlier capture of this site to compare with yet.'], at: new Date() } })
      await notifyIfNeeded(db, alertId, opts.escalated ?? false)
      return
    }
    const offDays = Math.abs(dayMs(baseline.capture!.date) - target) / DAY
    const sameSeason = offDays <= 50

    // 3. Compare pixel by pixel and judge.
    const m = await measureFootprint(baseline, after)
    if (!m.pixels) {
      await set({ confirmation: { status: 'inconclusive', reasons: ['The two images could not be compared.'], baselineAssetId: baseline._id, baselineDate: baseline.capture!.date, at: new Date() } })
    } else {
      const j = judge(alert.type, m.pixels, sameSeason)
      const reasons = [...j.reasons, `Baseline: capture from ${baseline.capture!.date}${sameSeason ? ' (same season a year earlier)' : ' (closest available, but a different season)'}.`]
      await set({ confirmation: { status: j.status, reasons, baselineAssetId: baseline._id, baselineDate: baseline.capture!.date, at: new Date() } })
    }
    await notifyIfNeeded(db, alertId, opts.escalated ?? false)
  } catch (err) {
    console.error('Alert pipeline failed:', err instanceof Error ? err.message : err)
    await set({ capture: { status: 'failed', note: err instanceof Error ? err.message : 'pipeline error', at: new Date() } }).catch(() => undefined)
  } finally {
    running.delete(key)
  }
}

/** Tell the responsible people once an alert is confirmed, or is an emergency (which should not wait for imagery). */
async function notifyIfNeeded(db: Db, alertId: ObjectId, escalated: boolean) {
  const alerts = db.collection<AlertDocument>('alerts')
  const alert = await alerts.findOne({ _id: alertId })
  if (!alert) return
  const confirmed = alert.confirmation?.status === 'confirmed'
  const emergency = alert.severity === 'emergency'
  if (!confirmed && !emergency) return
  if (alert.notifiedAt && !escalated) return
  const loc = await db.collection<LocationDocument>('locations').findOne({ _id: alert.locationId })
  const t = alert.trigger
  const status = confirmed
    ? 'CONFIRMED by satellite imagery.'
    : alert.confirmation?.status === 'not-confirmed'
      ? 'Sensor emergency; satellite imagery does not confirm it (yet).'
      : 'Sensor emergency; satellite confirmation is pending or inconclusive.'
  const body = [
    `${HAZARD[alert.type]} at ${loc?.name ?? 'a monitored site'}: ${alert.latestValue.toFixed(1)} ${t.unit} (${alert.severity}).`,
    status,
    ...(alert.confirmation?.reasons ?? []),
  ].join('\n')
  const sent = await notifyContacts(db, {
    alert,
    loc,
    headline: `${HAZARD[alert.type]} at ${loc?.name ?? 'monitored site'}`,
    body,
    link: `${env.clientUrl}/watch?alert=${alert._id.toHexString()}`,
  })
  await alerts.updateOne({ _id: alertId }, { $set: { notifiedAt: new Date() } })
  if (sent.length === 0) console.log(`Alert ${alertId.toHexString()} is notify-worthy but no contact is set up for it.`)
}

/**
 * Replays real historical weather through the live alert engine.
 *
 * For every monitored site it pulls hourly ERA5 temperature (and wave height
 * for coastal points) from Open-Meteo's free archive for a past period, judges
 * each hour with exactly the same rules as live polling (fixed limits, the
 * "unusual for this place and month" test, wave tiers), and records the
 * resulting alerts with their real timestamps. An alert closes once conditions
 * have been back to normal for a while (48 h for heat/cold, 12 h for waves), which gives a realistic history of
 * dated, resolved incidents, each with a before/after board limited to
 * evidence that existed when it closed.
 *
 *   npm run replay                                   1 Apr to 30 Jun 2026 (the India pre-monsoon heat)
 *   npm run replay -- --from 2024-05-15 --to 2024-06-05   the May 2024 heat wave
 *   npm run replay -- --from 2024-05-20 --to 2024-05-30   Cyclone Remal (coastal waves)
 *   npm run replay -- --dry-run                      list the incidents, write nothing
 *   npm run replay -- --only Barmer                  one site (substring match)
 *   npm run replay -- --clean                        delete everything a replay created
 *
 * Caveat: the "normal" baseline is the last ten complete years. If the replay
 * period falls inside those years, the event is part of its own baseline,
 * which makes it look slightly less unusual than it was.
 */
import type { Db } from 'mongodb'
import { evaluateTemperature, evaluateWaves, SEVERITY_RANK, type Trigger } from '../lib/hazards.js'
import type { AlertDocument, HazardSeverity, HazardType, LocationDocument, ReadingDocument } from '../lib/models.js'
import { closeMongo, connectMongo } from '../lib/mongo.js'
import { fetchClimatologyMonths, fetchTemperatureHistory, fetchWaveHistory, type Climatology } from '../lib/weather.js'
import { recordReading } from '../routes/signals.js'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const opt = (n: string, d: string) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const from = opt('--from', '2026-04-01')
const to = opt('--to', '2026-06-30')
const stepHours = Math.max(1, Number(opt('--step-hours', '3')))
// How long conditions must stay normal before an incident is over. Heat and cold
// waves last days and dip below the limit every night, so they need a long quiet
// period; sea state changes within hours.
const resolveOverride = opt('--resolve-after-hours', '')
const resolveAfterHours = (type: HazardType) => (resolveOverride ? Math.max(1, Number(resolveOverride)) : type === 'highwaves' ? 12 : 48)
const only = opt('--only', '').toLowerCase()
const dry = flag('--dry-run')

interface Episode {
  type: HazardType
  start: Date
  lastBreach: Date
  worst: HazardSeverity
  basis: Trigger['basis']
  peak: number
  unit: '°C' | 'm'
  alertId?: AlertDocument['_id']
}

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ')

async function clean(db: Db) {
  const a = await db.collection('alerts').deleteMany({ 'trigger.source': 'historical-replay' })
  const r = await db.collection<ReadingDocument>('readings').deleteMany({ source: 'historical-replay' })
  console.log(`Removed ${a.deletedCount} replayed alerts and ${r.deletedCount} replayed readings. Live data was not touched.`)
}

async function replaySite(db: Db, loc: LocationDocument, clim: Map<number, Climatology>) {
  const lat = loc.lat as number
  const lng = loc.lng as number
  const [hours, waves] = await Promise.all([
    fetchTemperatureHistory(lat, lng, from, to),
    fetchWaveHistory(lat, lng, from, to).catch(() => new Map<number, number>()),
  ])
  const done: Episode[] = []
  const active = new Map<HazardType, Episode>()
  let last = hours[0]?.at ?? new Date(from)

  const close = async (ep: Episode, at: Date) => {
    if (!dry && ep.alertId) {
      await db.collection<AlertDocument>('alerts').updateOne({ _id: ep.alertId }, { $set: { status: 'resolved', resolvedAt: at, updatedAt: at } })
    }
    done.push(ep)
    active.delete(ep.type)
  }

  for (let i = 0; i < hours.length; i += stepHours) {
    const h = hours[i]
    last = h.at
    const c = clim.get(h.at.getUTCMonth() + 1) ?? null
    const normal = c ? { mean: c.hourMean[h.at.getUTCHours()], sd: c.hourSd[h.at.getUTCHours()] } : null
    const wave = waves.get(h.at.getTime()) ?? null
    const triggers = [evaluateTemperature(h.tempC, lat, normal), wave !== null ? evaluateWaves(wave) : null].filter((t): t is Trigger => t !== null)

    let alertsByType = new Map<HazardType, AlertDocument['_id']>()
    if (triggers.length > 0 && !dry) {
      // The real engine writes the alert, so replayed and live alerts are the same thing.
      const out = await recordReading(
        db,
        loc,
        { tempC: h.tempC, feelsLikeC: h.feelsLikeC, humidity: null, condition: null, observedAt: h.at, source: 'historical-replay' },
        wave !== null ? { waveHeightM: wave, seaTempC: null, seaLevelM: null } : null,
        { clim: c, now: h.at, storeOnlyIfTriggered: true },
      )
      alertsByType = new Map(out.alerts.map((a) => [a.type, a._id]))
    }

    for (const t of triggers) {
      let ep = active.get(t.type)
      if (!ep) {
        ep = { type: t.type, start: h.at, lastBreach: h.at, worst: t.severity, basis: t.basis, peak: t.value, unit: t.unit }
        active.set(t.type, ep)
      }
      ep.lastBreach = h.at
      if (SEVERITY_RANK[t.severity] > SEVERITY_RANK[ep.worst]) {
        ep.worst = t.severity
        ep.basis = t.basis
      }
      ep.peak = t.type === 'coldwave' ? Math.min(ep.peak, t.value) : Math.max(ep.peak, t.value)
      ep.alertId = alertsByType.get(t.type) ?? ep.alertId
    }
    // Conditions back to normal for long enough: the incident is over.
    for (const ep of [...active.values()]) {
      if (h.at.getTime() - ep.lastBreach.getTime() >= resolveAfterHours(ep.type) * 3_600_000) await close(ep, h.at)
    }
  }
  for (const ep of [...active.values()]) await close(ep, last)
  return { episodes: done, hours: hours.length, coastal: waves.size > 0 }
}

async function main() {
  const db = await connectMongo()
  if (flag('--clean')) {
    await clean(db)
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('--from and --to must be YYYY-MM-DD dates, from <= to')
  const lastYear = new Date().getUTCFullYear() - 1
  if (Number(from.slice(0, 4)) >= lastYear - 9 && Number(to.slice(0, 4)) <= lastYear) {
    console.log(`Note: ${from.slice(0, 4)} is inside the ten-year baseline, so this period is part of its own "normal".`)
  }

  const locations = (await db.collection<LocationDocument>('locations').find({ lat: { $ne: null }, lng: { $ne: null } }).toArray()).filter(
    (l) => !only || l.name.toLowerCase().includes(only),
  )
  console.log(`${dry ? 'DRY RUN. ' : ''}Replaying ${from} to ${to}, every ${stepHours} h, over ${locations.length} monitored site(s)\n`)

  let total = 0
  for (const loc of locations) {
    // Never mix history into a live incident: skip sites with an open non-replay alert.
    if (!dry) {
      const live = await db.collection<AlertDocument>('alerts').countDocuments({ locationId: loc._id, status: { $ne: 'resolved' }, 'trigger.source': { $ne: 'historical-replay' } })
      if (live > 0) {
        console.log(`${loc.name}: skipped, it has a live open alert`)
        continue
      }
    }
    try {
      const clim = await fetchClimatologyMonths(loc.lat as number, loc.lng as number)
      const r = await replaySite(db, loc, clim)
      total += r.episodes.length
      console.log(`${loc.name}  (${r.hours} hourly readings${r.coastal ? ', coastal' : ''})`)
      if (r.episodes.length === 0) console.log('   no incidents')
      for (const e of r.episodes) {
        console.log(`   ${e.type.padEnd(9)} ${e.worst.padEnd(9)} ${fmt(e.start)} -> ${fmt(e.lastBreach)}  peak ${e.peak.toFixed(1)} ${e.unit}  (${e.basis})`)
      }
    } catch (err) {
      console.error(`${loc.name}: FAILED ${err instanceof Error ? err.message : err}`)
      process.exitCode = 1
    }
  }
  console.log(`\n${total} incident(s) ${dry ? 'found (nothing written)' : 'recorded as resolved alerts'}.`)
  if (!dry) console.log('Open the Disaster watch page and pick a resolved alert. "npm run replay -- --clean" removes them.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => closeMongo())

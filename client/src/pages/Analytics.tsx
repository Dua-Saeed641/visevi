import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarList, Donut, DivergingBars, Kpi, Panel, Pill, StackedColumns } from '../components/dash'
import { levelTone } from '../components/dashTheme'
import { Loading, Notice, PageHeader } from '../components/ui'
import { api, signalsApi, type AlertSummary, type Overview, type RiskResponse, type SitesResponse } from '../lib/api'

const WEEKS = 26
const WEEK = 7 * 86_400_000
const kind = (t: string) => (t === 'heatwave' ? 'Heat wave' : t === 'coldwave' ? 'Cold wave' : 'High waves')
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function useDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [sites, setSites] = useState<SitesResponse | null>(null)
  const [alerts, setAlerts] = useState<AlertSummary[] | null>(null)
  const [risk, setRisk] = useState<RiskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Time is state, not read during render, so a re-render can never shift the weekly buckets.
  const [now, setNow] = useState(() => Date.now())

  const fetchAll = useCallback(() => {
    const msg = (e: unknown) => (e instanceof Error ? e.message : 'Failed to load')
    // Each part loads on its own, so one slow source never blanks the page.
    api.getOverview().then(setOverview).catch((e: unknown) => setError(msg(e)))
    signalsApi.sites().then(setSites).catch((e: unknown) => setError(msg(e)))
    signalsApi.alerts().then(setAlerts).catch((e: unknown) => setError(msg(e)))
    signalsApi.risk().then(setRisk).catch(() => setRisk(null))
  }, [])
  useEffect(() => {
    fetchAll()
  }, [fetchAll])
  const reload = useCallback(() => {
    setNow(Date.now())
    fetchAll()
  }, [fetchAll])
  return { overview, sites, alerts, risk, error, now, reload }
}

export function Analytics() {
  const { overview, sites, alerts, risk, error, now, reload } = useDashboard()

  const stats = useMemo(() => {
    if (!alerts) return null
    const live = alerts.filter((a) => a.status !== 'resolved')
    const weekly = Array.from({ length: WEEKS }, (_, i) => ({ key: String(i), label: '', values: [0, 0, 0] }))
    for (const a of alerts) {
      const i = Math.floor((now - new Date(a.createdAt).getTime()) / WEEK)
      if (i < 0 || i >= WEEKS) continue
      weekly[WEEKS - 1 - i].values[a.severity === 'watch' ? 0 : a.severity === 'warning' ? 1 : 2]++
    }
    weekly.forEach((w, idx) => (w.label = when(new Date(now - (WEEKS - 1 - idx) * WEEK).toISOString())))
    const byKind = { heatwave: 0, coldwave: 0, highwaves: 0 }
    for (const a of alerts) byKind[a.type]++
    // The automatic loop only runs for live alerts; replayed history is excluded from it.
    const liveOnly = alerts.filter((a) => a.trigger.source !== 'historical-replay')
    return {
      open: live.length,
      emergency: live.filter((a) => a.severity === 'emergency').length,
      warning: live.filter((a) => a.severity === 'warning').length,
      weekly,
      spark: weekly.slice(-12).map((w) => w.values.reduce((s, v) => s + v, 0)),
      byKind,
      pipeline: {
        raised: liveOnly.length,
        captured: liveOnly.filter((a) => a.capture?.status === 'captured').length,
        confirmed: liveOnly.filter((a) => a.confirmation?.status === 'confirmed').length,
        notified: liveOnly.filter((a) => a.notifiedAt).length,
      },
      recent: [...alerts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6),
    }
  }, [alerts, now])

  const top = risk?.sites[0]
  const k = overview?.kpis
  const fresh = sites ? sites.sites.filter((s) => s.latest && now - new Date(s.latest.observedAt).getTime() < 3 * 3_600_000).length : 0
  const loading = !overview && !sites && !alerts && !error

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="Disaster overview"
        actions={<button className="btn btn-outline" onClick={reload}>Refresh</button>}
      >
        Live signals, risk and response across every monitored site.
      </PageHeader>

      {error && <Notice>Could not load everything: {error}. Check that the API is running.</Notice>}
      {loading && <Loading>Loading the dashboard...</Loading>}

      {(overview || sites || alerts) && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Active alerts"
              value={stats ? stats.open : '-'}
              note={stats ? `${stats.emergency} emergency, ${stats.warning} warning. ${alerts?.length ?? 0} recorded in total.` : undefined}
              spark={stats?.spark}
              badge={stats && stats.emergency > 0 ? <Pill tone="solid">Emergency</Pill> : undefined}
            />
            <Kpi
              label="Sites monitored"
              value={sites ? sites.sites.length : '-'}
              note={sites ? `${fresh} with a reading in the last 3 hours. Checked every ${sites.pollMinutes || 15} minutes.` : undefined}
            />
            <Kpi
              label="Highest risk"
              value={top ? top.score : '-'}
              note={top ? `${top.name}. ${top.level} risk, ${top.confidence}% confidence.` : risk === null ? 'Computing the risk index...' : undefined}
              badge={top ? <Pill tone={levelTone(top.level)}>{top.level}</Pill> : undefined}
            />
            <Kpi
              label="Evidence verified"
              value={k ? `${k.verifiedRate}%` : '-'}
              note={k ? `${k.verified} of ${k.totalAssets} captures across ${k.projects} projects. ${k.flagged} flagged.` : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title="Alerts over time" description={`Weekly alerts raised across all sites, last ${WEEKS} weeks, by severity.`}>
              {stats && (
                <StackedColumns
                  columns={stats.weekly}
                  series={[
                    { label: 'Watch', tone: 'light' },
                    { label: 'Warning', tone: 'mid' },
                    { label: 'Emergency', tone: 'solid' },
                  ]}
                />
              )}
            </Panel>
            <Panel title="Alerts by hazard" description="All recorded alerts.">
              {stats && (
                <Donut
                  centre={String(alerts?.length ?? 0)}
                  sub="alerts"
                  slices={[
                    { label: 'Heat wave', value: stats.byKind.heatwave, tone: 'solid' },
                    { label: 'Cold wave', value: stats.byKind.coldwave, tone: 'hatch' },
                    { label: 'High waves', value: stats.byKind.highwaves, tone: 'light' },
                  ]}
                />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel
              title="Risk index by site"
              description="0 to 100. A weighted score of long-run exposure, live conditions, the forecast, recent incidents, nearby events and imagery."
              action={<Link to="/report" className="text-base font-bold text-brand hover:underline">Details</Link>}
            >
              {!risk ? (
                <p className="py-6 text-center text-base text-muted">Computing the risk index. The first run reads NASA hazard maps and can take about 20 seconds.</p>
              ) : (
                <BarList
                  max={100}
                  rows={risk.sites.slice(0, 10).map((s) => ({
                    key: s.locationId,
                    label: s.name,
                    value: s.score,
                    tone: s.level === 'Severe' ? 'solid' : s.level === 'High' ? 'mid' : s.level === 'Moderate' ? 'light' : 'pale',
                    hint: `${s.level}, ${s.confidence}% confidence`,
                  }))}
                />
              )}
              <p className="mt-4 text-sm text-muted">Bar length is the score; the label at the right gives the level and how much fresh, sourced data it rests on.</p>
            </Panel>

            <Panel title="Temperature against normal" description="Latest reading minus what is normal for that place, month and hour (ten-year history).">
              {sites && (
                <DivergingBars
                  unit="°C"
                  rows={[...sites.sites]
                    .sort((a, b) => Math.abs(b.latest?.anomalyC ?? 0) - Math.abs(a.latest?.anomalyC ?? 0))
                    .slice(0, 10)
                    .map((s) => ({ key: s.locationId, label: s.name, value: s.latest?.anomalyC ?? null }))}
                />
              )}
              <p className="mt-4 text-sm text-muted">Solid bars are warmer than normal, hatched bars colder.</p>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel title="Response pipeline" description="For live alerts: capture, confirm, notify.">
              {stats && stats.pipeline.raised > 0 ? (
                <BarList
                  max={stats.pipeline.raised}
                  rows={[
                    { key: 'r', label: 'Alerts raised', value: stats.pipeline.raised, tone: 'light' },
                    { key: 'c', label: 'Satellite captured', value: stats.pipeline.captured, tone: 'mid' },
                    { key: 'f', label: 'Confirmed by imagery', value: stats.pipeline.confirmed, tone: 'solid' },
                    { key: 'n', label: 'People notified', value: stats.pipeline.notified, tone: 'hatch' },
                  ]}
                />
              ) : (
                <p className="py-6 text-base leading-relaxed text-muted">
                  No live alert yet, so nothing has been through the loop. Send a test signal from <Link to="/watch" className="font-bold text-brand hover:underline">Disaster watch</Link> to see a satellite capture, a confirmation and a notification.
                </p>
              )}
            </Panel>

            <Panel title="Evidence by project" description="Captures per project, split by verification." className="xl:col-span-2">
              {overview && (
                <BarList
                  rows={[...overview.perProject]
                    .sort((a, b) => b.verified + b.unverified + b.flagged - (a.verified + a.unverified + a.flagged))
                    .slice(0, 8)
                    .map((p) => ({
                      key: p.name,
                      label: p.name,
                      value: p.verified,
                      tone: 'solid' as const,
                      stack: [
                        { value: p.unverified, tone: 'light' as const, label: 'Unverified' },
                        { value: p.flagged, tone: 'hatch' as const, label: 'Flagged' },
                      ],
                      hint: `${p.verified} verified`,
                    }))}
                />
              )}
              <p className="mt-4 flex flex-wrap gap-x-5 text-sm text-muted">
                <span>Solid: verified</span><span>Light: unverified</span><span>Hatched: flagged</span>
              </p>
            </Panel>
          </div>

          <Panel title="Recent alerts" description="Newest first." action={<Link to="/watch" className="text-base font-bold text-brand hover:underline">Open Disaster watch</Link>}>
            {stats && stats.recent.length === 0 ? (
              <p className="py-6 text-center text-base text-muted">No alerts yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {stats?.recent.map((a) => (
                  <li key={a.id}>
                    <Link to={`/watch?alert=${a.id}`} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 hover:bg-tint">
                      <span className="flex min-w-0 items-center gap-3">
                        <Pill tone={levelTone(a.severity)}>{a.severity}</Pill>
                        <span className="truncate text-lg font-bold">{kind(a.type)} at {a.location}</span>
                      </span>
                      <span className="flex items-center gap-4 text-base text-muted">
                        <span className="font-bold tabular-nums text-ink">{a.latestValue.toFixed(1)} {a.unit}</span>
                        <span>{when(a.createdAt)}</span>
                        <span className="capitalize">{a.status}</span>
                        {a.trigger.source === 'historical-replay' && <Pill tone="outline">History</Pill>}
                        {a.confirmation?.status === 'confirmed' && <Pill tone="solid">Confirmed</Pill>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

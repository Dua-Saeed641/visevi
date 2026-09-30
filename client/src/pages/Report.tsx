import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssetDetail } from '../components/AssetDetail'
import { BarList, Donut, Gauge, Kpi, Meter, Panel, Pill, StackedColumns } from '../components/dash'
import { levelTone } from '../components/dashTheme'
import { StatusBadge } from '../components/StatusBadge'
import { Empty, Loading, Notice, PageHeader } from '../components/ui'
import {
  api, signalsApi, thumbUrl,
  type AlertSummary, type Asset, type MonitoredSite, type ProjectReport, type ProjectSimple, type RiskResponse,
} from '../lib/api'

const kind = (t: string) => (t === 'heatwave' ? 'Heat wave' : t === 'coldwave' ? 'Cold wave' : 'High waves')
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

/** A site report: one project (and its monitored sites) as cards and charts. */
export function Report() {
  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [projectId, setProjectId] = useState('')
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [risk, setRisk] = useState<RiskResponse | null>(null)
  const [sites, setSites] = useState<MonitoredSite[]>([])
  const [alerts, setAlerts] = useState<AlertSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Asset | null>(null)

  const openAsset = (id: string) => { api.getAsset(id).then(setDetail).catch(() => {}) }

  useEffect(() => {
    api.listProjects()
      .then((l) => {
        setProjects(l)
        // Open on the project with the most evidence, not simply the oldest one.
        const best = [...l].sort((a, b) => b.assetCount - a.assetCount)[0]
        if (best) setProjectId(best.id)
        else setLoading(false)
      })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Failed to load projects'); setLoading(false) })
    // Risk, sites and alerts are additions: the report still renders without them.
    signalsApi.risk().then(setRisk).catch(() => {})
    signalsApi.sites().then((s) => setSites(s.sites)).catch(() => {})
    signalsApi.alerts().then(setAlerts).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) return
    let ignore = false
    api.getProjectReport(projectId)
      .then((d) => { if (!ignore) { setReport(d); setError(null); setLoading(false) } })
      .catch((e: unknown) => { if (!ignore) { setError(e instanceof Error ? e.message : 'Failed to load report'); setLoading(false) } })
    return () => { ignore = true }
  }, [projectId])

  const mine = useMemo(() => {
    const name = report?.project.name
    const projectSites = sites.filter((s) => s.projectName === name)
    const ids = new Set(projectSites.map((s) => s.locationId))
    const siteRisks = (risk?.sites ?? []).filter((r) => ids.has(r.locationId)).sort((a, b) => b.score - a.score)
    return { projectSites, siteRisk: siteRisks[0] ?? null, alerts: alerts.filter((a) => ids.has(a.locationId)).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) }
  }, [report, sites, risk, alerts])

  const s = report?.stats
  const monthly = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const t of report?.timeline ?? []) {
      const d = new Date(t.createdAt)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const row = m.get(key) ?? [0, 0, 0]
      row[t.status === 'VERIFIED' ? 0 : t.status === 'UNVERIFIED' ? 1 : 2]++
      m.set(key, row)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({ key, label: shortDate(`${key}-01`), values }))
  }, [report])

  const latest = mine.projectSites.find((x) => x.locationId === mine.siteRisk?.locationId)?.latest ?? mine.projectSites[0]?.latest ?? null
  const openAlerts = mine.alerts.filter((a) => a.status !== 'resolved').length
  const ba = report?.beforeAfter

  return (
    <div>
      <PageHeader
        eyebrow="Site report"
        title={report?.project.name ?? 'Site report'}
        actions={
          <>
            {projects.length > 0 && (
              <select className="input" aria-label="Project" value={projectId} onChange={(e) => { setLoading(true); setProjectId(e.target.value) }}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button className="btn btn-outline" onClick={() => window.print()}>Print or save as PDF</button>
          </>
        }
      >
        Risk, live conditions, alerts and evidence for one site.
      </PageHeader>

      {error && <Notice>{error}</Notice>}
      {loading && <Loading>Building the report...</Loading>}
      {!loading && !error && projects.length === 0 && <Empty title="No projects yet">Upload evidence to generate a report.</Empty>}

      {!loading && report && s && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Risk index"
              value={mine.siteRisk ? mine.siteRisk.score : 'n/a'}
              note={mine.siteRisk ? `${mine.siteRisk.name}. ${mine.siteRisk.level} risk, ${mine.siteRisk.confidence}% confidence.` : 'This project has no monitored site. Add coordinates when uploading to start monitoring.'}
              badge={mine.siteRisk ? <Pill tone={levelTone(mine.siteRisk.level)}>{mine.siteRisk.level}</Pill> : undefined}
            />
            <Kpi label="Active alerts" value={mine.projectSites.length ? openAlerts : 'n/a'} note={mine.projectSites.length ? `${mine.alerts.length} recorded at this project's sites.` : undefined} />
            <Kpi
              label="Now"
              value={latest ? `${latest.tempC.toFixed(1)}°` : 'n/a'}
              note={latest ? `${latest.anomalyC !== null ? `${latest.anomalyC > 0 ? '+' : ''}${latest.anomalyC.toFixed(1)} °C against normal. ` : ''}${latest.waveHeightM !== null ? `Waves ${latest.waveHeightM.toFixed(1)} m. ` : ''}${latest.sourceLabel}.` : undefined}
            />
            <Kpi
              label="Evidence verified"
              value={s.totalAssets ? `${Math.round((s.verifiedAssets / s.totalAssets) * 100)}%` : 'n/a'}
              note={`${s.verifiedAssets} of ${s.totalAssets} captures. ${s.flaggedAssets} flagged.`}
            />
          </div>

          {mine.siteRisk && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Panel title="Risk index" description={`${mine.siteRisk.name}. Leading hazard: ${mine.siteRisk.dominant.hazard}, from ${mine.siteRisk.dominant.driver}.`}>
                <Gauge score={mine.siteRisk.score} level={mine.siteRisk.level} confidence={mine.siteRisk.confidence} />
              </Panel>
              <Panel className="xl:col-span-2" title="What the score is made of" description="Points each factor adds to the 0 to 100 score, with how far its data can be trusted.">
                <ul className="space-y-4">
                  {mine.siteRisk.factors.map((f) => (
                    <li key={f.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-base font-bold">{f.label} <span className="font-normal text-muted">(weight {f.weight})</span></span>
                        <span className="text-base font-bold tabular-nums">{f.value === null ? 'no data' : `${f.points.toFixed(1)} pts`}</span>
                      </div>
                      <div className="mt-1.5"><Meter value={f.value ?? 0} label={f.label} /></div>
                      <p className="mt-1.5 text-sm leading-snug text-muted">{f.detail} <span className="whitespace-nowrap">Source: {f.source}. Trust {Math.round(f.confidence * 100)}%.</span></p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
                  {risk?.formula} The weights are judgement, not a trained model: they are returned with every result and can be changed.
                </p>
              </Panel>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel title="Evidence status" description="Verification result per capture.">
              <Donut
                centre={String(s.totalAssets)}
                sub="captures"
                slices={[
                  { label: 'Verified', value: s.verifiedAssets, tone: 'solid' },
                  { label: 'Unverified', value: s.unverifiedAssets, tone: 'light' },
                  { label: 'Flagged', value: s.flaggedAssets, tone: 'hatch' },
                ]}
              />
            </Panel>
            <Panel className="xl:col-span-2" title="Captures over time" description="Evidence per month by capture date.">
              {monthly.length > 0 ? (
                <StackedColumns
                  columns={monthly}
                  series={[{ label: 'Verified', tone: 'solid' }, { label: 'Unverified', tone: 'light' }, { label: 'Flagged', tone: 'hatch' }]}
                  height={150}
                />
              ) : (
                <p className="py-6 text-center text-base text-muted">No captures yet.</p>
              )}
            </Panel>
          </div>

          {ba && (
            <Panel
              title="Before and after"
              description={`${ba.summary.timeSpanLabel}${ba.sameSeason ? ', same season' : ''}`}
              action={<Link to={`/compare?beforeId=${ba.beforeId}&afterId=${ba.afterId}`} className="no-print text-base font-bold text-brand hover:underline">Open the full comparison</Link>}
            >
              <div className="grid gap-5 md:grid-cols-2">
                {[
                  { label: 'Before', url: ba.beforeUrl, date: ba.beforeDate },
                  { label: 'After', url: ba.afterUrl, date: ba.afterDate },
                ].map((x) => (
                  <figure key={x.label}>
                    <img src={thumbUrl({ cloudinaryUrl: x.url }, 900)} alt={x.label} className="w-full rounded-md bg-tint" />
                    <figcaption className="mt-2 flex justify-between text-base"><strong>{x.label}</strong><span className="text-brand">{new Date(x.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span></figcaption>
                  </figure>
                ))}
              </div>
              <ul className="mt-5 list-disc space-y-1.5 pl-6 text-base leading-relaxed">
                {(ba.summary.visual?.lines ?? ba.summary.insights.slice(0, 3)).map((l) => <li key={l}>{l}</li>)}
              </ul>
              {ba.summary.visual?.seasonNote && <p className="mt-3 border-l-4 border-brand bg-tint px-4 py-2 text-base">{ba.summary.visual.seasonNote}</p>}
            </Panel>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title="Alerts at this site" description="Newest first." action={<Link to="/watch" className="no-print text-base font-bold text-brand hover:underline">Disaster watch</Link>}>
              {mine.alerts.length === 0 ? (
                <p className="py-6 text-center text-base text-muted">No alerts recorded for this project.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {mine.alerts.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      <Link to={`/watch?alert=${a.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-tint">
                        <span className="flex min-w-0 items-center gap-2.5"><Pill tone={levelTone(a.severity)}>{a.severity}</Pill><span className="truncate text-base font-bold">{kind(a.type)}</span></span>
                        <span className="shrink-0 text-sm text-muted">{a.latestValue.toFixed(1)} {a.unit}, {shortDate(a.createdAt)}, <span className="capitalize">{a.status}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="UN SDG indicators" description="Score = supporting unflagged captures, not a probability.">
              {report.indicators.length === 0 ? (
                <p className="py-6 text-center text-base text-muted">No indicator can be mapped yet.</p>
              ) : (
                <BarList
                  max={100}
                  format={(v) => `${Math.round(v)}%`}
                  rows={report.indicators.slice(0, 8).map((i) => ({
                    key: i.code,
                    label: `SDG ${i.code}`,
                    value: Math.round(i.confidence * 100),
                    tone: i.status === 'asserted' ? 'solid' : 'light',
                    hint: i.status === 'asserted' ? 'Asserted' : 'Needs review',
                  }))}
                />
              )}
              <p className="mt-4 text-sm text-muted">Solid: asserted (50% or more). Light: shown for review, never asserted.</p>
            </Panel>
          </div>

          {report.activities.length > 0 && (
            <Panel title="Activities identified" description="What the AI saw across the captures.">
              <BarList
                rows={report.activities.slice(0, 8).map((a) => ({ key: a.name, label: a.name, value: a.verified, tone: 'solid' as const, stack: [{ value: Math.max(0, a.count - a.verified), tone: 'light' as const, label: 'Not verified' }], hint: `${a.count} capture${a.count === 1 ? '' : 's'}` }))}
              />
              <p className="mt-4 text-sm text-muted">Solid: on verified captures. Light: on the others.</p>
            </Panel>
          )}

          <Panel title={`Evidence (${report.timeline.length})`} description="Select a capture for its full record.">
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {[...report.timeline].reverse().slice(0, 20).map((t) => (
                <li key={t.id}>
                  <button onClick={() => openAsset(t.id)} className="block w-full cursor-pointer overflow-hidden rounded-md border border-line text-left transition-shadow hover:shadow-md">
                    <img src={thumbUrl({ cloudinaryUrl: t.cloudinaryUrl }, 420)} alt={t.observation?.caption ?? 'Evidence'} loading="lazy" className="aspect-[4/3] w-full bg-tint object-cover" />
                    <div className="p-3">
                      <p className="truncate text-base font-bold">{new Date(t.createdAt).toLocaleDateString()}</p>
                      <p className="truncate text-sm text-muted">{t.location}</p>
                      <div className="mt-2"><StatusBadge status={t.status} /></div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {report.timeline.length > 20 && <p className="mt-3 text-sm text-muted">Showing the newest 20. The Evidence library lists all of them.</p>}
          </Panel>
        </div>
      )}

      {detail && <AssetDetail asset={detail} onClose={() => setDetail(null)} onChanged={setDetail} />}
    </div>
  )
}

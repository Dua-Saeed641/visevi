import { useEffect, useState } from 'react'
import {
  AssetsByYear, CaptureTimeline, ChartPanel, CheckOutcomes, IndicatorScores, Legend,
  ProjectStatusBars, ThemeBars, TipBox,
} from '../components/charts'
import { STATUS_LEGEND, type Tip } from '../components/chartTheme'
import { Empty, Loading, Notice, PageHeader } from '../components/ui'
import { api, type Overview } from '../lib/api'

function Kpi({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="card card-accent p-7">
      <p className="numeral text-6xl text-brand">{value}</p>
      <p className="mt-4 text-xl font-bold">{label}</p>
      <p className="mt-1 text-lg text-muted">{note}</p>
    </div>
  )
}

function Tables({ o }: { o: Overview }) {
  const th = 'border-b-2 border-ink px-3 py-2 text-left text-sm font-bold uppercase tracking-wider'
  const td = 'border-b border-line px-3 py-2 text-base'
  return (
    <div className="grid grid-cols-1 gap-12 xl:grid-cols-2">
      <table className="w-full">
        <caption className="mb-2 text-left text-xl font-bold">Verification by project</caption>
        <thead><tr><th className={th}>Project</th><th className={th}>Verified</th><th className={th}>Unverified</th><th className={th}>Flagged</th></tr></thead>
        <tbody>{o.perProject.map((p) => <tr key={p.name}><td className={td}>{p.name}</td><td className={td}>{p.verified}</td><td className={td}>{p.unverified}</td><td className={td}>{p.flagged}</td></tr>)}</tbody>
      </table>
      <table className="w-full">
        <caption className="mb-2 text-left text-xl font-bold">Verification checks</caption>
        <thead><tr><th className={th}>Check</th><th className={th}>Passed</th><th className={th}>Failed</th><th className={th}>No data</th></tr></thead>
        <tbody>{o.checks.map((c) => <tr key={c.id}><td className={td}>{c.label}</td><td className={td}>{c.pass}</td><td className={td}>{c.fail}</td><td className={td}>{c.skipped}</td></tr>)}</tbody>
      </table>
      <table className="w-full">
        <caption className="mb-2 text-left text-xl font-bold">Detected themes</caption>
        <thead><tr><th className={th}>Theme</th><th className={th}>Assets</th></tr></thead>
        <tbody>{o.themes.map((t) => <tr key={t.name}><td className={td}>{t.name}</td><td className={td}>{t.count}</td></tr>)}</tbody>
      </table>
      <table className="w-full">
        <caption className="mb-2 text-left text-xl font-bold">Indicator scores</caption>
        <thead><tr><th className={th}>SDG</th><th className={th}>Project</th><th className={th}>Score</th><th className={th}>Status</th></tr></thead>
        <tbody>{o.indicators.map((i) => <tr key={i.project + i.code}><td className={td}>{i.code}</td><td className={td}>{i.project}</td><td className={td}>{Math.round(i.confidence * 100)}%</td><td className={td}>{i.status === 'asserted' ? 'Asserted' : 'Needs review'}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export function Analytics() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tip, setTip] = useState<Tip>(null)
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    api.getOverview().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
  }, [])

  const k = data?.kpis

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="The evidence at a glance"
        actions={
          data && data.totalAssets > 0 ? (
            <button className="btn btn-outline" onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Show charts' : 'View as tables'}
            </button>
          ) : undefined
        }
      >
        Evidence volume, verification results, capture dates and SDG indicators.
      </PageHeader>

      {error && <Notice>Could not load analytics: {error}. Check that the API is running.</Notice>}
      {!data && !error && <Loading>Loading analytics...</Loading>}
      {data && data.totalAssets === 0 && <Empty title="No evidence yet">Upload photos to see analytics.</Empty>}

      {data && k && data.totalAssets > 0 && (
        <>
          <div className="mb-14 grid grid-cols-1 gap-7 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Evidence assets" value={k.totalAssets} note={`across ${k.projects} projects, ${k.locations} locations`} />
            <Kpi label="Verification rate" value={`${k.verifiedRate}%`} note={`${k.verified} of ${k.totalAssets} assets verified`} />
            <Kpi label="Flagged for review" value={k.flagged} note={`${k.unverified} more unverified`} />
            <Kpi label="Indicators asserted" value={k.assertedIndicators} note="UN SDG targets with enough evidence" />
          </div>

          {asTable ? (
            <Tables o={data} />
          ) : (
            <div className="space-y-20">
              <ChartPanel
                title="When each project's evidence was captured"
                note="One dot per photo, placed by capture date. Each line spans first to last capture."
              >
                <Legend items={STATUS_LEGEND} />
                <CaptureTimeline points={data.points} onTip={setTip} />
              </ChartPanel>

              <div className="grid grid-cols-1 gap-x-16 gap-y-20 2xl:grid-cols-2">
                <ChartPanel title="Assets by capture year" note="Photos per capture year, split by status.">
                  <Legend items={STATUS_LEGEND} />
                  <AssetsByYear points={data.points} onTip={setTip} />
                </ChartPanel>
                <ChartPanel title="Verification status by project" note="Verified, unverified and flagged photos per project.">
                  <Legend items={STATUS_LEGEND} />
                  <ProjectStatusBars data={data.perProject} onTip={setTip} />
                </ChartPanel>
              </div>

              <div className="grid grid-cols-1 gap-x-16 gap-y-20 2xl:grid-cols-2">
                <ChartPanel title="How the four checks perform" note="Share of photos that passed, failed or lacked data, per check.">
                  <CheckOutcomes data={data.checks} onTip={setTip} />
                </ChartPanel>
                <ChartPanel title="What the evidence shows" note="The themes the AI detected most often.">
                  <ThemeBars data={data.themes} onTip={setTip} />
                </ChartPanel>
              </div>

              <ChartPanel
                title="Impact indicator evidence scores"
                note="Strongest SDG mappings per project. The score counts supporting photos; it is not a probability."
              >
                <IndicatorScores data={data.indicators} onTip={setTip} />
              </ChartPanel>
            </div>
          )}
        </>
      )}
      <TipBox tip={tip} />
    </div>
  )
}

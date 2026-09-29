import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssetDetail } from '../components/AssetDetail'
import { StatusBadge } from '../components/StatusBadge'
import { Empty, Loading, Notice, PageHeader, Section } from '../components/ui'
import { api, thumbUrl, type Asset, type IndicatorResult, type ProjectReport, type ProjectSimple } from '../lib/api'

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card card-accent p-6">
      <p className="numeral text-5xl text-brand">{value}</p>
      <p className="mt-3 text-lg font-bold">{label}</p>
    </div>
  )
}

function IndicatorRow({ ind, thumbs, onOpen }: { ind: IndicatorResult; thumbs: { id: string; url: string }[]; onOpen: (id: string) => void }) {
  const pct = Math.round(ind.confidence * 100)
  const asserted = ind.status === 'asserted'
  return (
    <li className="card mb-5 grid gap-5 p-7 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <p className="text-xl font-bold">
          <span className="text-brand">SDG {ind.code}</span> &middot; {ind.title}
        </p>
        <p className="mt-2 text-lg leading-relaxed text-muted">{ind.reason}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {thumbs.map((t) => (
            <li key={t.id}>
              <button onClick={() => onOpen(t.id)} className="block h-16 w-16 cursor-pointer overflow-hidden border-2 border-line hover:border-brand" aria-label="Open backing evidence">
                <img src={thumbUrl({ cloudinaryUrl: t.url }, 160)} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="numeral text-4xl text-brand">{pct}%</p>
        <div className="mt-2 h-3 w-full border-2 border-brand bg-white" role="img" aria-label={`Evidence score ${pct} percent`}>
          <div className={`h-full ${asserted ? 'bg-brand' : 'bg-tint-2'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-base font-bold">{asserted ? 'Asserted' : 'Needs review, not asserted'}</p>
      </div>
    </li>
  )
}

export function Report() {
  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [projectId, setProjectId] = useState('')
  const [report, setReport] = useState<ProjectReport | null>(null)
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
  }, [])

  useEffect(() => {
    if (!projectId) return
    let ignore = false
    api.getProjectReport(projectId)
      .then((d) => { if (!ignore) { setReport(d); setError(null); setLoading(false) } })
      .catch((e: unknown) => { if (!ignore) { setError(e instanceof Error ? e.message : 'Failed to load report'); setLoading(false) } })
    return () => { ignore = true }
  }, [projectId])

  const asserted = report?.indicators.filter((i) => i.status === 'asserted') ?? []
  const review = report?.indicators.filter((i) => i.status === 'needs-review') ?? []
  const byId = new Map((report?.timeline ?? []).map((t) => [t.id, t.cloudinaryUrl]))
  const thumbsOf = (i: IndicatorResult) => i.backingAssetIds.flatMap((id) => (byId.has(id) ? [{ id, url: byId.get(id)! }] : []))

  return (
    <div>
      <PageHeader
        eyebrow="Impact report"
        title={report?.project.name ?? 'Project impact report'}
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
        {report?.project.description ?? 'Verified evidence, activities, indicators and change, ready for stakeholders.'}
      </PageHeader>

      {error && <Notice>{error}</Notice>}
      {loading && <Loading>Building the report...</Loading>}
      {!loading && !error && projects.length === 0 && <Empty title="No projects yet">Upload evidence to generate a report.</Empty>}

      {!loading && report && (
        <>
          <div className="mb-14 grid grid-cols-2 gap-6 lg:grid-cols-5">
            <Stat label="Verified activities" value={report.stats.verifiedActivities} />
            <Stat label="Evidence assets" value={report.stats.totalAssets} />
            <Stat label="Verified assets" value={report.stats.verifiedAssets} />
            <Stat label="Locations" value={report.stats.locationCount} />
            <Stat label="Flagged" value={report.stats.flaggedAssets} />
          </div>

          {report.activities.length > 0 && (
            <Section title="Field activities identified" note="What the AI saw. Verified counts photos that passed every check.">
              <div className="card p-7"><table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-ink text-sm uppercase tracking-wider">
                    <th className="py-3 pr-4">Activity</th><th className="py-3 pr-4">Assets</th><th className="py-3">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {report.activities.map((a) => (
                    <tr key={a.name} className="border-b border-line text-lg">
                      <td className="py-3 pr-4 font-bold">{a.name}</td><td className="py-3 pr-4">{a.count}</td><td className="py-3">{a.verified}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Section>
          )}

          <Section title="UN SDG indicators" note="Score = supporting unflagged photos, not a probability.">
            {report.indicators.length === 0 ? (
              <p className="text-lg text-muted">No indicators can be mapped yet. This project needs analysed, unflagged evidence.</p>
            ) : (
              <>
                {asserted.length > 0 && <ul>{asserted.map((i) => <IndicatorRow key={i.code} ind={i} thumbs={thumbsOf(i)} onOpen={openAsset} />)}</ul>}
                {review.length > 0 && (
                  <>
                    <h3 className="mt-10 text-xl font-bold text-brand">Needs review, not asserted</h3>
                    <ul>{review.map((i) => <IndicatorRow key={i.code} ind={i} thumbs={thumbsOf(i)} onOpen={openAsset} />)}</ul>
                  </>
                )}
              </>
            )}
          </Section>

          {report.beforeAfter && (
            <Section title="Featured progress" note={report.beforeAfter.summary.timeSpanLabel}>
              <p className="mb-8 max-w-4xl text-xl leading-relaxed">{report.beforeAfter.summary.narrative}</p>
              <div className="grid gap-8 md:grid-cols-2">
                {[
                  { label: 'Before', url: report.beforeAfter.beforeUrl, date: report.beforeAfter.beforeDate },
                  { label: 'After', url: report.beforeAfter.afterUrl, date: report.beforeAfter.afterDate },
                ].map((s) => (
                  <figure key={s.label}>
                    <img src={thumbUrl({ cloudinaryUrl: s.url }, 900)} alt={s.label} className="w-full bg-tint" />
                    <figcaption className="mt-3 flex justify-between border-t-2 border-ink pt-2 text-lg">
                      <strong>{s.label}</strong>
                      <span className="text-brand">{new Date(s.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <Link to={`/compare?beforeId=${report.beforeAfter.beforeId}&afterId=${report.beforeAfter.afterId}`} className="no-print mt-6 inline-block text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark">
                Open the full comparison
              </Link>
            </Section>
          )}

          <Section title={`Evidence timeline (${report.timeline.length})`} note="Select a photo for its full record.">
            <ul className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-4">
              {report.timeline.map((t) => (
                <li key={t.id}>
                  <button onClick={() => openAsset(t.id)} className="card card-hover block w-full cursor-pointer overflow-hidden text-left">
                    <img src={thumbUrl({ cloudinaryUrl: t.cloudinaryUrl }, 480)} alt={t.observation?.caption ?? 'Evidence'} loading="lazy" className="aspect-[4/3] w-full bg-tint object-cover" />
                    <div className="p-5">
                      <p className="text-xl font-bold leading-snug">{t.observation?.activity ?? 'Unclassified'}</p>
                      <p className="mt-1 text-lg text-muted">{new Date(t.createdAt).toLocaleDateString()} &middot; {t.location}</p>
                      <div className="mt-3"><StatusBadge status={t.status} /></div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {detail && <AssetDetail asset={detail} onClose={() => setDetail(null)} onChanged={setDetail} />}
    </div>
  )
}

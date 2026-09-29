import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssetDetail } from '../components/AssetDetail'
import { StatusBadge } from '../components/StatusBadge'
import { api, type Asset, type IndicatorResult, type ProjectReport, type ProjectSimple } from '../lib/api'

function IndicatorRow({
  ind,
  thumbs,
  onOpen,
}: {
  ind: IndicatorResult
  thumbs: { id: string; url: string }[]
  onOpen: (id: string) => void
}) {
  const pct = Math.round(ind.confidence * 100)
  const asserted = ind.status === 'asserted'
  const tone = asserted ? 'var(--color-accent-green)' : 'var(--color-accent-orange)'
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-mono text-sm font-bold text-[var(--color-accent-cyan)]">SDG {ind.code}</span>
          <p className="text-sm text-[var(--color-text)]">{ind.title}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold" style={{ color: tone }}>
            {pct}% evidence
          </span>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div className="h-full" style={{ width: pct + '%', background: tone }} />
          </div>
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{ind.reason}</p>
      <div className="flex flex-wrap gap-2">
        {thumbs.map((t) => (
          <button
            key={t.id}
            onClick={() => onOpen(t.id)}
            title="Open backing evidence"
            className="h-12 w-12 cursor-pointer overflow-hidden rounded border border-[var(--color-border)] hover:border-[var(--color-accent-cyan)]"
          >
            <img src={t.url} alt="Backing evidence" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function Report() {
  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Asset | null>(null)

  const openAsset = (id: string) => {
    api.getAsset(id).then(setDetail).catch(() => {})
  }

  // Load projects list
  useEffect(() => {
    api
      .listProjects()
      .then((list) => {
        setProjects(list)
        if (list.length > 0) {
          setSelectedProjectId(list[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Load project report whenever selected project changes
  useEffect(() => {
    let ignore = false
    if (!selectedProjectId && projects.length === 0) {
      return
    }

    const targetId = selectedProjectId || 'default'

    api
      .getProjectReport(targetId)
      .then((data) => {
        if (!ignore) {
          setReport(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load report')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [selectedProjectId, projects.length])

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-accent-cyan)] uppercase tracking-wider">
            <span>Verified Impact Report</span> • <span>Cloudinary Evidence</span>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Project Impact Summary</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Synthesized visual evidence, verified activities, and change showcase ready for stakeholder review.
          </p>
        </div>

        {projects.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)] font-medium">Select Project:</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent-cyan)] focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-5 text-sm text-[var(--color-accent-red)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
          Synthesizing project report metrics and evidence timeline...
        </div>
      )}

      {!loading && report && (
        <div className="space-y-8 print:space-y-6">
          {/* Executive Overview Header */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">
                  {report.project.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {report.project.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-accent-cyan)] transition-all cursor-pointer"
                >
                  🖨️ Export PDF / Print
                </button>
              </div>
            </div>

            {/* Key Performance Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="rounded-xl border border-[var(--color-accent-green)]/30 bg-[var(--color-bg)] p-4">
                <span className="text-xs text-[var(--color-text-muted)] font-medium">Verified Activities</span>
                <p className="numeral mt-1 text-4xl text-[var(--color-accent-green)]">
                  {report.stats.verifiedActivities}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <span className="text-xs text-[var(--color-text-muted)] font-medium">Total Evidence Assets</span>
                <p className="numeral mt-1 text-4xl text-[var(--color-accent-cyan)]">
                  {report.stats.totalAssets}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <span className="text-xs text-[var(--color-text-muted)] font-medium">Verified Assets</span>
                <p className="numeral mt-1 text-4xl text-[var(--color-accent-green)]">
                  {report.stats.verifiedAssets}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <span className="text-xs text-[var(--color-text-muted)] font-medium">Monitored Locations</span>
                <p className="numeral mt-1 text-4xl text-[var(--color-accent-yellow)]">
                  {report.stats.locationCount}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <span className="text-xs text-[var(--color-text-muted)] font-medium">Flagged Items</span>
                <p className="numeral mt-1 text-4xl text-[var(--color-accent-red)]">
                  {report.stats.flaggedAssets}
                </p>
              </div>
            </div>
          </div>

          {/* Activities Breakdown */}
          {report.activities.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                ⚡ Identified Field Activities
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {report.activities.map((act, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                  >
                    <span className="text-xs font-semibold text-[var(--color-text)]">{act.name}</span>
                    <span className="rounded-full bg-[var(--color-accent-cyan)]/20 px-2 py-0.5 text-xs font-bold text-[var(--color-accent-cyan)]">
                      {act.verified}/{act.count} verified
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impact indicators */}
          {(() => {
            const byId = new Map(report.timeline.map((t) => [t.id, t.cloudinaryUrl]))
            const asserted = report.indicators.filter((i) => i.status === 'asserted')
            const review = report.indicators.filter((i) => i.status === 'needs-review')
            const thumbsOf = (i: IndicatorResult) =>
              i.backingAssetIds.flatMap((id) => (byId.has(id) ? [{ id, url: byId.get(id)! }] : []))
            return (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text)]">🎯 Impact Indicators (UN SDG)</h3>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Mapped from what the verified evidence actually shows. The score reflects how many
                    independent assets support an indicator — it is not a model probability. Flagged
                    assets are excluded.
                  </p>
                </div>
                {report.indicators.length === 0 && (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    No indicators can be mapped yet — this project needs analysed, unflagged evidence.
                  </p>
                )}
                {asserted.length > 0 && (
                  <div className="space-y-3">
                    {asserted.map((i) => (
                      <IndicatorRow key={i.code} ind={i} thumbs={thumbsOf(i)} onOpen={openAsset} />
                    ))}
                  </div>
                )}
                {review.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-orange)]">
                      Needs review — not asserted
                    </h4>
                    {review.map((i) => (
                      <IndicatorRow key={i.code} ind={i} thumbs={thumbsOf(i)} onOpen={openAsset} />
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Featured Before & After Showcase */}
          {report.beforeAfter && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                <h3 className="text-lg font-bold text-[var(--color-text)]">
                  📸 Featured Progress Transformation
                </h3>
                <span className="text-xs font-mono text-[var(--color-accent-yellow)]">
                  ⏱️ {report.beforeAfter.summary.timeSpanLabel}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                {report.beforeAfter.summary.narrative}
              </p>
              <Link
                to={'/compare?beforeId=' + report.beforeAfter.beforeId + '&afterId=' + report.beforeAfter.afterId}
                className="inline-block text-xs text-[var(--color-accent-cyan)] hover:underline print:hidden"
              >
                Open full comparison →
              </Link>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase text-[var(--color-accent-orange)]">
                    Baseline ({new Date(report.beforeAfter.beforeDate).toLocaleDateString()})
                  </span>
                  <div className="aspect-video w-full rounded-lg overflow-hidden border border-[var(--color-border)]">
                    <img src={report.beforeAfter.beforeUrl} alt="Baseline" className="h-full w-full object-cover" />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase text-[var(--color-accent-green)]">
                    Follow-Up ({new Date(report.beforeAfter.afterDate).toLocaleDateString()})
                  </span>
                  <div className="aspect-video w-full rounded-lg overflow-hidden border border-[var(--color-border)]">
                    <img src={report.beforeAfter.afterUrl} alt="Followup" className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {report.suggestedPairs.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-3 print:hidden">
              <h3 className="text-lg font-bold text-[var(--color-text)]">🔁 Suggested Before/After Pairs</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Earliest vs latest unflagged evidence at each location.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {report.suggestedPairs.map((p) => (
                  <Link
                    key={p.location}
                    to={'/compare?beforeId=' + p.beforeId + '&afterId=' + p.afterId}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 hover:border-[var(--color-accent-cyan)]"
                  >
                    <img src={p.beforeUrl} alt="" className="h-12 w-16 rounded object-cover" />
                    <span className="text-[var(--color-text-muted)]">→</span>
                    <img src={p.afterUrl} alt="" className="h-12 w-16 rounded object-cover" />
                    <span className="text-xs">
                      <strong className="block text-[var(--color-text)]">📍 {p.location}</strong>
                      <span className="text-[var(--color-text-muted)]">{p.spanDays} days apart</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Timeline of All Evidence */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              📅 Evidence Timeline ({report.timeline.length})
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {report.timeline.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openAsset(item.id)}
                  className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 space-y-2 text-left hover:border-[var(--color-accent-cyan)]"
                >
                  <div className="aspect-square w-full rounded overflow-hidden bg-black/40">
                    <img src={item.cloudinaryUrl} alt="Evidence item" className="h-full w-full object-cover" />
                  </div>
                  <div className="text-[11px] space-y-1">
                    <p className="font-semibold text-[var(--color-text)] line-clamp-1">
                      {item.observation?.activity ?? 'Unclassified'}
                    </p>
                    <p className="text-[var(--color-text-muted)]">
                      {new Date(item.createdAt).toLocaleDateString()} • {item.location}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {detail && <AssetDetail asset={detail} onClose={() => setDetail(null)} onChanged={setDetail} />}
    </div>
  )
}

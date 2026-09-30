import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { Empty, Loading, Notice, PageHeader } from '../components/ui'
import { api, thumbUrl, type CompareResult, type CompareSide, type ProjectReport, type ProjectSimple } from '../lib/api'

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Drag-to-reveal comparison. A native range input sits on top, so the slider is
 * draggable, touch-friendly and keyboard accessible (arrow keys). */
function RevealSlider({ before, after }: { before: CompareSide; after: CompareSide }) {
  const [pos, setPos] = useState(50)
  return (
    <div>
      <div className="relative aspect-[4/3] max-h-[78vh] w-full select-none overflow-hidden bg-tint">
        <img src={thumbUrl(after, 1400)} alt={after.observation?.caption ?? 'After'} className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        <img
          src={thumbUrl(before, 1400)}
          alt={before.observation?.caption ?? 'Before'}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />
        <span className="absolute left-4 top-4 bg-ink px-3 py-1.5 text-base font-bold text-white">Before · {fmt(before.createdAt)}</span>
        <span className="absolute right-4 top-4 bg-brand px-3 py-1.5 text-base font-bold text-white">After · {fmt(after.createdAt)}</span>
        <div className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(42,11,14,0.35)]" style={{ left: `${pos}%` }}>
          <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-brand shadow-lg">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
            </svg>
          </div>
        </div>
        <input
          type="range" min={0} max={100} value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Drag to reveal the before image on the left and the after image on the right"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button className="btn btn-outline" onClick={() => setPos(100)}>Show before</button>
        <button className="btn btn-outline" onClick={() => setPos(50)}>Split</button>
        <button className="btn btn-outline" onClick={() => setPos(0)}>Show after</button>
      </div>
    </div>
  )
}

function SideBySide({ before, after }: { before: CompareSide; after: CompareSide }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {[{ l: 'Before', s: before }, { l: 'After', s: after }].map(({ l, s }) => (
        <figure key={l}>
          <div className="flex items-baseline justify-between border-b-4 border-ink pb-2">
            <figcaption className="text-2xl font-bold">{l}</figcaption>
            <span className="text-lg font-bold text-brand">{fmt(s.createdAt)}</span>
          </div>
          <img src={thumbUrl(s, 1000)} alt={s.observation?.caption ?? l} className="mt-3 w-full bg-tint" />
        </figure>
      ))}
    </div>
  )
}

function Record({ label, side }: { label: string; side: CompareSide }) {
  const obs = side.observation
  return (
    <article className="card p-7">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{label}</h3>
        <StatusBadge status={side.verificationStatus} />
      </div>
      <p className="mt-1 text-lg text-muted">{fmt(side.createdAt)} &middot; {side.location}{side.stage ? ` · ${side.stage}` : ''}</p>
      {obs?.activity && <p className="mt-5 text-xl font-bold text-brand">{obs.activity}</p>}
      {obs?.caption ? <p className="mt-2 text-xl leading-relaxed">{obs.caption}</p> : <p className="mt-4 text-lg text-muted">No AI description for this image.</p>}
      {obs && obs.tags.length > 0 && <p className="mt-4 text-lg text-muted">{obs.tags.join(' / ')}</p>}
      <p className="mt-5 break-all font-mono text-base text-muted">{side.cloudinaryPublicId} &middot; v{side.cloudinaryVersion}</p>
      <a href={side.cloudinaryUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark">
        Open source asset
      </a>
    </article>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card p-6">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function InsightCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card card-accent p-7">
      <h3 className="text-2xl font-bold">{title}</h3>
      <div className="mt-4 space-y-4 text-xl leading-relaxed">{children}</div>
    </section>
  )
}

function Chips({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-base font-bold text-muted">{title}</p>
      <ul className="flex flex-wrap gap-2.5">
        {items.map((t) => (
          <li key={t} className="border-2 border-brand px-3.5 py-1.5 text-lg font-bold text-brand">{t}</li>
        ))}
      </ul>
    </div>
  )
}

export function Compare() {
  const [params, setParams] = useSearchParams()
  const beforeId = params.get('beforeId') ?? undefined
  const afterId = params.get('afterId') ?? undefined

  const [data, setData] = useState<CompareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'slider' | 'side'>('slider')

  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [projectId, setProjectId] = useState('')
  const [report, setReport] = useState<ProjectReport | null>(null)

  useEffect(() => {
    api.listProjects().then((l) => {
      const usable = l.filter((p) => p.assetCount >= 2)
      setProjects(usable)
      // Open on the project with the most evidence.
      const best = [...usable].sort((a, b) => b.assetCount - a.assetCount)[0]
      if (best) setProjectId((cur) => cur || best.id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) return
    let ignore = false
    api.getProjectReport(projectId).then((r) => {
      if (ignore) return
      setReport(r)
      // No pair in the URL yet: open the project's featured before/after.
      if (!beforeId && !afterId && r.beforeAfter) {
        setParams({ beforeId: r.beforeAfter.beforeId, afterId: r.beforeAfter.afterId }, { replace: true })
      }
    }).catch(() => {})
    return () => { ignore = true }
  }, [projectId, beforeId, afterId, setParams])

  useEffect(() => {
    if (!beforeId || !afterId) return
    let ignore = false
    api.getCompareReport(beforeId, afterId)
      .then((d) => { if (!ignore) { setData(d); setError(null) } })
      .catch((e: unknown) => { if (!ignore) setError(e instanceof Error ? e.message : 'Failed to compare') })
    return () => { ignore = true }
  }, [beforeId, afterId])

  // Loading = a pair is requested but what's on screen isn't it yet.
  const showing = data ? [data.before.id, data.after.id] : []
  const loading = !!(beforeId && afterId) && !error && !(showing.includes(beforeId) && showing.includes(afterId))

  const c = data?.comparison
  const levelLabel = c && { comparable: 'Comparable pair', limited: 'Limited comparability', 'not-comparable': 'Not a valid before and after' }[c.comparability.level]
  const tier = c && { 'same-footprint': 'Same place', 'same-photo': 'Near-identical', similar: 'Similar framing', different: 'Substantially different', unrelated: 'Visually unrelated', unknown: 'Not available' }[c.scene.tier]

  return (
    <div>
      <PageHeader eyebrow="Before / after" title="What changed?">
        Two photos of a site, in time order, compared using what the AI saw in each.
      </PageHeader>

      {projects.length > 0 && (
        <div className="card mb-10 grid gap-6 p-7 lg:grid-cols-[minmax(0,24rem)_1fr]">
          <label className="block">
            <span className="mb-2 block text-lg font-bold">Project</span>
            <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setParams({}, { replace: true }); setData(null) }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div>
            <p className="mb-2 text-lg font-bold">Suggested pairs</p>
            {report && report.suggestedPairs.length > 0 ? (
              <ul className="flex flex-wrap gap-3">
                {report.suggestedPairs.map((p) => (
                  <li key={p.location}>
                    <Link to={`/compare?beforeId=${p.beforeId}&afterId=${p.afterId}`} className="block border-2 border-brand bg-white px-4 py-2.5 text-lg font-bold text-brand hover:bg-brand hover:text-white">
                      {p.location} &middot; {p.spanDays} days apart{p.sameSeason ? ', same season' : ''}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-lg text-muted">No location here has two unflagged photos yet.</p>
            )}
            <p className="mt-3 text-base text-muted">You can also select two photos in the Evidence library.</p>
          </div>
        </div>
      )}

      {error && <Notice>{error}</Notice>}
      {loading && <Loading>Comparing the pair...</Loading>}
      {!loading && !data && !error && <Empty title="No pair selected">Pick a project above, or select two photos in the Evidence library.</Empty>}

      {!loading && data && c && (
        <>
          {/* Verdict */}
          <section className={`card mb-8 border-l-8 p-7 ${c.comparability.level === 'comparable' ? 'border-l-brand' : 'border-l-brand-dark bg-tint'}`}>
            <p className="eyebrow">{levelLabel}</p>
            <p className="mt-2 text-3xl font-bold leading-snug">{c.comparability.headline}</p>
          </section>

          {/* Key facts */}
          <div className="mb-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Time apart">
              <p className="numeral text-4xl text-brand">{c.time.basis === 'capture-dates' ? c.time.label : 'Unknown'}</p>
              <p className="mt-2 text-lg text-muted">{c.time.basis === 'capture-dates' ? `${c.time.beforeDate} to ${c.time.afterDate}` : 'A capture date is missing'}</p>
            </Tile>
            <Tile label="Framing">
              <p className="text-2xl font-bold">{tier}</p>
              {c.scene.tier === 'same-footprint' && <p className="mt-2 text-lg text-muted">Identical coordinates and extent</p>}
              {c.scene.distance !== null && <p className="mt-2 text-lg text-muted">Fingerprint distance {c.scene.distance} of {c.scene.bits}</p>}
            </Tile>
            <Tile label="Description overlap">
              <ul className="space-y-1 text-xl">
                {([['Themes', c.overlap.themes], ['Objects', c.overlap.objects], ['Tags', c.overlap.tags]] as const).map(([k, v]) => (
                  <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><strong>{v === null ? 'n/a' : `${v}%`}</strong></li>
                ))}
              </ul>
            </Tile>
            <Tile label="Verification">
              <div className="space-y-2 text-lg">
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Before</span><StatusBadge status={data.before.verificationStatus} /></div>
                <div className="flex items-center justify-between gap-3"><span className="text-muted">After</span><StatusBadge status={data.after.verificationStatus} /></div>
              </div>
            </Tile>
          </div>

          {/* Viewer */}
          <section className="card mb-10 p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-3xl font-bold">{data.before.projectName === data.after.projectName ? data.before.projectName : 'Compare'}</h2>
              <div className="flex" role="group" aria-label="View mode">
                {([['slider', 'Slider'], ['side', 'Side by side']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMode(k)}
                    aria-pressed={mode === k}
                    className={`cursor-pointer border-2 border-brand px-5 py-2.5 text-lg font-bold ${mode === k ? 'bg-brand text-white' : 'bg-white text-brand hover:bg-tint-2'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'slider' ? <RevealSlider before={data.before} after={data.after} /> : <SideBySide before={data.before} after={data.after} />}
          </section>

          {/* Insights as separate cards */}
          <div className="mb-10 grid gap-6 xl:grid-cols-2">
            <InsightCard title="Same place?">
              <p>{c.scene.text}</p>
              {data.before.capture && (
                <p className="text-lg text-muted">
                  Source: NASA Worldview satellite snapshots. {data.before.capture.provenance === 'failed' || data.after.capture?.provenance === 'failed'
                    ? 'One of the two failed its provenance check.'
                    : 'Both were confirmed against NASA for their coordinates and dates.'}
                </p>
              )}
            </InsightCard>
            {c.visual && (
              <InsightCard title="Measured change">
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-lg">
                  <dt className="font-bold text-muted"></dt><dd className="font-bold text-muted">Before</dd><dd className="font-bold text-muted">After</dd>
                  <dt>Vegetation greenness</dt><dd>{c.visual.measured.before.green.toFixed(2)}</dd><dd>{c.visual.measured.after.green.toFixed(2)}</dd>
                  <dt>Water-like area</dt><dd>{Math.round(c.visual.measured.before.waterPct)}%</dd><dd>{Math.round(c.visual.measured.after.waterPct)}%</dd>
                  <dt>Cloud cover</dt><dd>{Math.round(c.visual.measured.before.cloudPct)}%</dd><dd>{Math.round(c.visual.measured.after.cloudPct)}%</dd>
                </dl>
                <ul className="list-disc space-y-2 pl-6 text-lg">
                  {c.visual.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
                {c.visual.seasonNote && <p className="border-l-4 border-brand bg-tint px-4 py-3 text-lg">{c.visual.seasonNote}</p>}
              </InsightCard>
            )}
            <InsightCard title="Activity">
              <p>{c.activity.text}</p>
            </InsightCard>
            <InsightCard title="Themes">
              <Chips title="In both images" items={c.themes.shared} />
              <Chips title="Only in the after image" items={c.themes.onlyAfter} />
              <Chips title="Only in the before image" items={c.themes.onlyBefore} />
              {c.themes.shared.length + c.themes.onlyAfter.length + c.themes.onlyBefore.length === 0 && <p className="text-muted">No recognised theme was detected in either image.</p>}
            </InsightCard>
            <InsightCard title="Objects named">
              <Chips title="In both images" items={c.objects.shared} />
              <Chips title="Only in the after image" items={c.objects.onlyAfter} />
              <Chips title="Only in the before image" items={c.objects.onlyBefore} />
              {c.objects.shared.length + c.objects.onlyAfter.length + c.objects.onlyBefore.length === 0 && <p className="text-muted">No objects were named.</p>}
            </InsightCard>
          </div>

          <details className="card mb-12 p-7">
            <summary className="cursor-pointer text-2xl font-bold text-brand-dark">Read with care ({c.caveats.length})</summary>
            <ul className="mt-5 list-disc space-y-3 pl-7 text-xl leading-relaxed text-muted">
              {c.caveats.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p className="mt-5 text-lg text-muted">Method: {c.method}</p>
          </details>

          {/* Records */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Record label="Before" side={data.before} />
            <Record label="After" side={data.after} />
          </div>
        </>
      )}
    </div>
  )
}

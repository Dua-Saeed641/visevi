import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssetDetail } from '../components/AssetDetail'
import { StatusBadge } from '../components/StatusBadge'
import { Empty, Loading, Notice, PageHeader } from '../components/ui'
import { api, thumbUrl, type Asset, type ProjectSimple } from '../lib/api'

export function Library() {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [detail, setDetail] = useState<Asset | null>(null)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [project, setProject] = useState('')

  const [selected, setSelected] = useState<string[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {})
  }, [])

  // Debounced so typing a query doesn't fire a request per keystroke.
  useEffect(() => {
    let ignore = false
    const t = setTimeout(() => {
      api
        .listAssets({ q: query, status, project })
        .then((data) => {
          if (ignore) return
          setAssets(data)
          setError(null)
        })
        .catch((err: unknown) => !ignore && setError(err instanceof Error ? err.message : 'Failed to load assets'))
    }, 250)
    return () => {
      ignore = true
      clearTimeout(t)
    }
  }, [query, status, project])

  // Open at once with what the list has, then swap in the full record.
  const openDetail = (a: Asset) => {
    setDetail(a)
    api.getAsset(a.id).then((full) => setDetail((cur) => (cur?.id === full.id ? full : cur))).catch(() => {})
  }

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]))

  const filtered = query || status || project
  const understood = query.trim() && assets?.[0]?.match?.expandedVia.length ? assets[0].match.expandedVia : []

  return (
    <div className={selected.length > 0 ? 'pb-40' : ''}>
      <PageHeader eyebrow="Evidence library" title="Every photo, searchable by meaning">
        Search in plain language.
      </PageHeader>

      <div className="card mb-10 grid gap-5 p-6 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-lg font-bold">Search</span>
          <input
            className="input"
            placeholder='Try "people installing rooftop power" or "glacier"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-lg font-bold">Project</span>
          <select className="input" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>{p.name} ({p.assetCount})</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-lg font-bold">Verification</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="UNVERIFIED">Unverified</option>
            <option value="FLAGGED">Flagged</option>
          </select>
        </label>
        <div className="flex items-end">
          {filtered && (
            <button className="btn btn-outline w-full" onClick={() => { setQuery(''); setStatus(''); setProject('') }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {error && <Notice>Could not reach the API: {error}</Notice>}
      {!assets && !error && <Loading>Loading the evidence library...</Loading>}
      {assets && assets.length === 0 && (
        <Empty title="No matching evidence">Adjust the search or filters, or upload new evidence.</Empty>
      )}

      {assets && assets.length > 0 && (
        <>
          <p className="mb-6 text-xl text-muted">
            {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
            {query.trim() ? ', best match first' : ''}
            {understood.length > 0 && <> &middot; understood as <strong className="text-brand">{understood.join(', ')}</strong></>}
          </p>

          <ul className="grid gap-8 md:grid-cols-2 2xl:grid-cols-3">
            {assets.map((a) => {
              const isSel = selected.includes(a.id)
              const date = new Date(a.capturedAt ?? a.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              return (
                <li key={a.id} className={`card card-hover flex flex-col overflow-hidden ${isSel ? 'ring-4 ring-brand' : ''}`}>
                  <button
                    type="button"
                    onClick={() => openDetail(a)}
                    className="block cursor-pointer overflow-hidden bg-tint"
                    aria-label={`Open record for ${a.projectName}`}
                  >
                    <img src={thumbUrl(a, 640)} alt={a.observation?.caption ?? a.projectName} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
                  </button>

                  <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-2xl font-bold leading-snug">{a.projectName}</h3>
                  </div>
                  <p className="mt-1 text-lg text-muted">
                    {a.location}{a.stage ? ` · ${a.stage}` : ''}
                  </p>
                  <p className="text-lg text-muted">{date}</p>
                  <div className="mt-3"><StatusBadge status={a.verificationStatus ?? 'UNVERIFIED'} /></div>

                  {a.verificationStatus === 'FLAGGED' && a.verificationNote && (
                    <p className="mt-4 border-l-4 border-brand-dark bg-tint px-4 py-3 text-lg leading-snug text-brand-dark">{a.verificationNote}</p>
                  )}
                  {a.observation?.caption && (
                    <p className="mt-4 line-clamp-3 text-xl leading-snug">{a.observation.caption}</p>
                  )}
                  {a.observation && a.observation.tags.length > 0 && (
                    <p className="mt-3 text-lg text-muted">{a.observation.tags.slice(0, 4).join(' / ')}</p>
                  )}

                  <div className="mt-auto flex items-center gap-5 pt-5">
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      aria-pressed={isSel}
                      className={`border-2 px-4 py-2.5 text-lg font-bold ${isSel ? 'border-brand bg-brand text-white' : 'border-brand text-brand hover:bg-tint-2'} cursor-pointer`}
                    >
                      {isSel ? 'Selected for comparison' : 'Select to compare'}
                    </button>
                    <button type="button" onClick={() => openDetail(a)} className="cursor-pointer text-lg font-bold text-ink underline underline-offset-4 hover:text-brand">
                      Details
                    </button>
                  </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Compare bar: appears at bottom centre once something is selected */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 lg:pl-64">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-2 border-ink bg-white px-6 py-4 shadow-2xl">
            <p className="text-xl">
              <strong className="text-brand">{selected.length}</strong> of 2 selected
              {selected.length < 2 && <span className="text-muted"> &middot; choose one more</span>}
            </p>
            <button
              className="btn text-lg"
              disabled={selected.length !== 2}
              onClick={() => navigate(`/compare?beforeId=${selected[0]}&afterId=${selected[1]}`)}
            >
              Compare these two
            </button>
            <button className="text-base font-bold text-ink underline underline-offset-4 hover:text-brand" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        </div>
      )}

      {detail && (
        <AssetDetail
          asset={detail}
          onClose={() => setDetail(null)}
          onChanged={(u) => {
            setDetail(u)
            setAssets((prev) => prev?.map((a) => (a.id === u.id ? { ...a, ...u, match: a.match } : a)) ?? prev)
          }}
        />
      )}
    </div>
  )
}

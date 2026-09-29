import { useEffect, useMemo, useState } from 'react'
import { AssetDetail } from '../components/AssetDetail'
import { StatusBadge } from '../components/StatusBadge'
import { Empty, Notice, PageHeader } from '../components/ui'
import { api, thumbUrl, type Asset, type ProjectReport, type ProjectSimple } from '../lib/api'

/** Chronological evidence for one project, filterable by location. */
export function Timeline() {
  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [projectId, setProjectId] = useState('')
  const [location, setLocation] = useState('')
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Asset | null>(null)

  useEffect(() => {
    api.listProjects()
      .then((list) => {
        setProjects(list)
        const best = [...list].sort((a, b) => b.assetCount - a.assetCount)[0]
        if (best) setProjectId(best.id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
  }, [])

  useEffect(() => {
    if (!projectId) return
    let ignore = false
    api.getProjectReport(projectId)
      .then((r) => { if (!ignore) { setReport(r); setLocation(''); setError(null) } })
      .catch((e: unknown) => !ignore && setError(e instanceof Error ? e.message : 'Failed to load timeline'))
    return () => { ignore = true }
  }, [projectId])

  // Oldest first: a timeline reads top to bottom, past to present.
  const items = useMemo(
    () => (report?.timeline ?? []).filter((t) => !location || t.location === location),
    [report, location],
  )

  return (
    <div>
      <PageHeader eyebrow="Timeline" title="A project's evidence, in order">
        Every photo in a project, from first capture to latest.
      </PageHeader>

      <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        <label className="block">
          <span className="mb-2 block text-base font-bold">Project</span>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-base font-bold">Location</span>
          <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">All locations</option>
            {report?.locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
        </label>
      </div>

      {error && <Notice>{error}</Notice>}
      {!error && projects.length === 0 && <Empty title="No projects yet">Upload evidence to start a timeline.</Empty>}
      {report && items.length === 0 && <Empty title="No evidence for this selection" />}

      <ol className="relative ml-3 border-l-4 border-ink">
        {items.map((it) => (
          <li key={it.id} className="relative pb-10 pl-8">
            <span className="absolute -left-[13px] top-2 h-5 w-5 border-4 border-ink bg-brand" aria-hidden="true" />
            <p className="text-2xl font-bold text-brand">
              {new Date(it.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <button
              onClick={() => api.getAsset(it.id).then(setDetail).catch(() => {})}
              className="card card-hover mt-3 grid w-full cursor-pointer gap-6 p-5 text-left sm:grid-cols-[14rem_1fr]"
            >
              <img src={thumbUrl({ cloudinaryUrl: it.cloudinaryUrl }, 480)} alt={it.observation?.caption ?? 'Evidence photo'} loading="lazy" className="aspect-[4/3] w-full bg-tint object-cover" />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <StatusBadge status={it.status} />
                  <span className="text-lg text-muted">{it.location}{it.stage ? ` · ${it.stage}` : ''}</span>
                </div>
                {it.observation?.activity && <p className="text-xl font-bold">{it.observation.activity}</p>}
                {it.observation?.caption && <p className="text-lg leading-relaxed text-muted">{it.observation.caption}</p>}
              </div>
            </button>
          </li>
        ))}
      </ol>

      {detail && <AssetDetail asset={detail} onClose={() => setDetail(null)} onChanged={setDetail} />}
    </div>
  )
}

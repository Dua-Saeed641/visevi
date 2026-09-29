import { useEffect, useMemo, useState } from 'react'
import { AssetDetail } from '../components/AssetDetail'
import { StatusBadge } from '../components/StatusBadge'
import { api, type Asset, type ProjectReport, type ProjectSimple } from '../lib/api'

/** Chronological evidence for one project, filterable by location. */
export function Timeline() {
  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [projectId, setProjectId] = useState('')
  const [location, setLocation] = useState('')
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Asset | null>(null)

  useEffect(() => {
    api
      .listProjects()
      .then((list) => {
        setProjects(list)
        if (list.length > 0) setProjectId(list[0].id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
  }, [])

  useEffect(() => {
    if (!projectId) return
    let ignore = false
    api
      .getProjectReport(projectId)
      .then((r) => {
        if (!ignore) {
          setReport(r)
          setLocation('')
          setError(null)
        }
      })
      .catch((e: unknown) => !ignore && setError(e instanceof Error ? e.message : 'Failed to load timeline'))
    return () => {
      ignore = true
    }
  }, [projectId])

  // Group by month, newest month first, oldest item first within a month.
  const groups = useMemo(() => {
    const items = (report?.timeline ?? []).filter((t) => !location || t.location === location)
    const map = new Map<string, typeof items>()
    for (const it of items) {
      const key = new Date(it.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      map.set(key, [...(map.get(key) ?? []), it])
    }
    return [...map].reverse()
  }, [report, location])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-[var(--color-accent-cyan)]">Timeline</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Project evidence over time</h1>
        </div>
        <div className="flex gap-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="">All locations</option>
            {report?.locations.map((l) => (
              <option key={l.id} value={l.name}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-5 text-sm text-[var(--color-accent-red)]">
          {error}
        </div>
      )}
      {!error && projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center text-sm text-[var(--color-text-muted)]">
          No projects yet — upload evidence to start a timeline.
        </div>
      )}

      <div className="space-y-8">
        {groups.map(([month, items]) => (
          <section key={month}>
            <h2 className="mb-3 border-b border-[var(--color-border)] pb-1 text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {month}
            </h2>
            <ol className="space-y-3 border-l border-[var(--color-border)] pl-5">
              {items.map((it) => (
                <li key={it.id} className="relative">
                  <span className="absolute -left-[26px] top-4 h-2.5 w-2.5 rounded-full bg-[var(--color-accent-cyan)]" />
                  <button
                    onClick={() => api.getAsset(it.id).then(setDetail).catch(() => {})}
                    className="flex w-full cursor-pointer gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left hover:border-[var(--color-accent-cyan)]"
                  >
                    <img src={it.cloudinaryUrl} alt="" className="h-20 w-28 flex-none rounded object-cover" loading="lazy" />
                    <div className="min-w-0 space-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--color-text)]">
                          {new Date(it.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-[var(--color-text-muted)]">📍 {it.location}{it.stage ? ` • ${it.stage}` : ''}</span>
                        <StatusBadge status={it.status} />
                      </div>
                      {it.observation?.activity && (
                        <p className="font-medium text-[var(--color-accent-yellow)]">{it.observation.activity}</p>
                      )}
                      {it.observation?.caption && (
                        <p className="line-clamp-2 italic text-[var(--color-text-muted)]">"{it.observation.caption}"</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {report && groups.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">No evidence for this selection.</p>
        )}
      </div>

      {detail && <AssetDetail asset={detail} onClose={() => setDetail(null)} onChanged={setDetail} />}
    </div>
  )
}

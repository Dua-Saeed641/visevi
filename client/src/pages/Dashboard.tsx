import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssetDetail } from '../components/AssetDetail'
import { NeuralBackdrop } from '../components/NeuralBackdrop'
import { OverviewCharts } from '../components/OverviewCharts'
import { StatusBadge } from '../components/StatusBadge'
import { api, thumbUrl, type Asset, type ProjectSimple } from '../lib/api'

export function Dashboard() {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')

  // Selection for comparison
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const navigate = useNavigate()

  const [projects, setProjects] = useState<ProjectSimple[]>([])
  const [detail, setDetail] = useState<Asset | null>(null)

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    let ignore = false
    api
      .listAssets({
        q: searchQuery,
        status: selectedStatus,
        project: selectedProject,
      })
      .then((data) => {
        if (!ignore) {
          setAssets(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load assets')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [selectedStatus, selectedProject, searchQuery])

  const fetchAssets = () => {
    setLoading(true)
    api
      .listAssets({
        q: searchQuery,
        status: selectedStatus,
        project: selectedProject,
      })
      .then((data) => {
        setAssets(data)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load assets'))
      .finally(() => setLoading(false))
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchAssets()
  }

  const toggleSelectForCompare = (id: string) => {
    if (compareSelection.includes(id)) {
      setCompareSelection(compareSelection.filter((item) => item !== id))
    } else {
      if (compareSelection.length >= 2) {
        setCompareSelection([compareSelection[1], id])
      } else {
        setCompareSelection([...compareSelection, id])
      }
    }
  }

  const launchComparison = () => {
    if (compareSelection.length === 2) {
      navigate(`/compare?beforeId=${compareSelection[0]}&afterId=${compareSelection[1]}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-7 py-8 sm:flex-row sm:items-center sm:justify-between">
        <NeuralBackdrop className="absolute inset-y-0 right-0 h-full w-3/4 opacity-40 [mask-image:linear-gradient(to_left,black_35%,transparent)]" />
        <div className="relative">
          <div className="spectrum-bar mb-4 w-24" />
          <h1 className="text-3xl font-semibold tracking-tight">Evidence Library</h1>
          <p className="mt-1 max-w-md text-sm text-[var(--color-text-muted)]">
            Browse, search, and verify field evidence aggregated across sustainability projects.
          </p>
          <div className="mt-5 flex gap-8">
            <div>
              <p className="numeral text-4xl">{String(projects.length).padStart(2, '0')}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">Projects</p>
            </div>
            <div>
              <p className="numeral text-4xl">{String(projects.reduce((n, p) => n + p.assetCount, 0)).padStart(2, '0')}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">Evidence assets</p>
            </div>
          </div>
        </div>

        {compareSelection.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-accent-blue)]/40 bg-[var(--color-accent-blue)]/10 px-4 py-2 text-xs">
            <span>
              <strong className="text-[var(--color-accent-blue)]">{compareSelection.length}</strong> selected for comparison
            </span>
            {compareSelection.length === 2 && (
              <button
                onClick={launchComparison}
                className="rounded bg-[var(--color-accent-blue)] px-3 py-1 font-semibold text-white hover:opacity-90 transition-all cursor-pointer"
              >
                Compare Pair →
              </button>
            )}
            <button
              onClick={() => setCompareSelection([])}
              className="text-[var(--color-text-muted)] hover:text-white underline ml-1 cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <OverviewCharts />

      {/* Search & Filter Bar */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder='Search by meaning, e.g. "people installing rooftop power"'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            />
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent-cyan)] focus:outline-none"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name} ({p.assetCount})
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent-cyan)] focus:outline-none"
          >
            <option value="">All Verification Statuses</option>
            <option value="UNVERIFIED">Unverified</option>
            <option value="VERIFIED">Verified</option>
            <option value="FLAGGED">Flagged</option>
          </select>

          <button
            type="submit"
            className="rounded-lg bg-[var(--color-accent-cyan)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-all cursor-pointer"
          >
            Search
          </button>

          {(searchQuery || selectedStatus || selectedProject) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedStatus('')
                setSelectedProject('')
                setTimeout(fetchAssets, 50)
              }}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-white transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </form>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-4 text-sm text-[var(--color-accent-red)]">
          Could not reach the API: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
          Loading evidence library...
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && assets?.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center">
          <p className="text-lg font-medium text-[var(--color-text)]">No matching evidence found</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Try adjusting your search terms or upload new project evidence.
          </p>
        </div>
      )}

      {searchQuery.trim() && !loading && assets && assets.length > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {assets.length} result{assets.length === 1 ? '' : 's'}, best match first
          {assets[0].match?.expandedVia.length ? (
            <> • understood as: <span className="text-[var(--color-accent-cyan)]">{assets[0].match.expandedVia.join(', ')}</span></>
          ) : null}
        </p>
      )}

      {/* Asset Grid */}
      {!loading && assets && assets.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => {
            const isSelected = compareSelection.includes(asset.id)
            const status = asset.verificationStatus ?? 'UNVERIFIED'

            return (
              <div
                key={asset.id}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-[var(--color-surface)] transition-all hover:border-[var(--color-accent-cyan)]/50 ${
                  isSelected ? 'border-[var(--color-accent-blue)] ring-2 ring-[var(--color-accent-blue)]/50' : 'border-[var(--color-border)]'
                }`}
              >
                <div>
                  {/* Image container */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                    <img
                      src={thumbUrl(asset)}
                      alt={asset.projectName}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Status Pill */}
                    <StatusBadge status={status} className="absolute top-3 right-3 backdrop-blur-md" />

                    {/* Selection Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleSelectForCompare(asset.id)}
                      className={`absolute top-3 left-3 flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)] text-white'
                          : 'border-white/40 bg-black/50 text-transparent hover:border-white'
                      }`}
                      title="Select for comparison"
                    >
                      ✓
                    </button>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-2.5">
                    <div>
                      <h3 className="font-semibold text-[var(--color-text)] line-clamp-1">{asset.projectName}</h3>
                      <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mt-0.5">
                        📍 {asset.location}{asset.stage ? ` • ${asset.stage}` : ''}
                      </p>
                    </div>

                    {status === 'FLAGGED' && asset.verificationNote && (
                      <p className="rounded border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-2 text-[11px] text-[var(--color-accent-red)] line-clamp-3">
                        ⚠ {asset.verificationNote}
                      </p>
                    )}

                    {/* AI Observations */}
                    {asset.observation ? (
                      <div className="space-y-1.5 pt-1">
                        {asset.observation.activity && (
                          <p className="text-xs font-medium text-[var(--color-accent-yellow)] line-clamp-1">
                            ⚡ {asset.observation.activity}
                          </p>
                        )}

                        {asset.observation.caption && (
                          <p className="text-xs text-[var(--color-text-muted)] italic line-clamp-2">
                            "{asset.observation.caption}"
                          </p>
                        )}

                        {asset.observation.tags && asset.observation.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {asset.observation.tags.slice(0, 4).map((tag, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                              >
                                #{tag}
                              </span>
                            ))}
                            {asset.observation.tags.length > 4 && (
                              <span className="text-[10px] text-[var(--color-text-muted)] pt-0.5">
                                +{asset.observation.tags.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--color-text-muted)] italic pt-1">
                        {asset.observationError ? `Analysis note: ${asset.observationError}` : 'No AI observation available'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer metadata */}
                <div className="border-t border-[var(--color-border)] px-4 py-2.5 text-[11px] text-[var(--color-text-muted)] flex items-center justify-between">
                  <span>Captured: {new Date(asset.capturedAt ?? asset.createdAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => setDetail(asset)}
                    className="cursor-pointer hover:text-[var(--color-accent-cyan)] transition-colors"
                  >
                    Details &amp; provenance →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detail && (
        <AssetDetail
          asset={detail}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setDetail(updated)
            setAssets((prev) => prev?.map((a) => (a.id === updated.id ? { ...a, ...updated, match: a.match } : a)) ?? prev)
          }}
        />
      )}
    </div>
  )
}

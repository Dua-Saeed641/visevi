import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { api, type CompareResult } from '../lib/api'

export function Compare() {
  const [searchParams] = useSearchParams()
  const beforeId = searchParams.get('beforeId') ?? undefined
  const afterId = searchParams.get('afterId') ?? undefined

  const [compareData, setCompareData] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    api
      .getCompareReport(beforeId, afterId)
      .then((data) => {
        if (!ignore) {
          setCompareData(data)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to generate comparison')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [beforeId, afterId])

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-accent-cyan)] uppercase tracking-wider">
          <span>Visual Verification</span> • <span>Change Tracking</span>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Before / After Comparison</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Compare evidence pairs across time intervals to track site progress, activity shifts, and visual transformations.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-5 text-sm text-[var(--color-accent-red)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
          Analyzing evidence pair and computing visual diff...
        </div>
      )}

      {!loading && compareData && (
        <div className="space-y-8">
          {(!compareData.sameProject ||
            compareData.before.verificationStatus === 'FLAGGED' ||
            compareData.after.verificationStatus === 'FLAGGED') && (
            <div className="rounded-xl border border-[var(--color-accent-orange)]/40 bg-[var(--color-accent-orange)]/10 p-4 text-sm text-[var(--color-accent-orange)]">
              ⚠ Treat this comparison with caution:
              {!compareData.sameProject && ' these two assets belong to different projects.'}
              {(compareData.before.verificationStatus === 'FLAGGED' || compareData.after.verificationStatus === 'FLAGGED') &&
                ' at least one asset is flagged by verification and may not show what it claims.'}
            </div>
          )}

          {/* AI-Described Change Summary Card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
              <div>
                <span className="text-xs uppercase text-[var(--color-text-muted)] tracking-wider">Project Scope</span>
                <h2 className="text-xl font-bold text-[var(--color-text)]">
                  {compareData.before.projectName}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)]">📍 {compareData.before.location}</p>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-[var(--color-accent-yellow)]/30 bg-[var(--color-accent-yellow)]/10 px-3.5 py-1.5 text-xs font-semibold text-[var(--color-accent-yellow)]">
                ⏱️ {compareData.comparison.timeSpanLabel}
              </div>
            </div>

            {/* AI Change Narrative */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-cyan)]">
                👁️ What changed
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text)]">{compareData.comparison.narrative}</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Method: {compareData.comparison.method}</p>
            </div>

            {(compareData.comparison.emergedThemes.length > 0 || compareData.comparison.fadedThemes.length > 0) && (
              <div className="flex flex-wrap gap-4 border-t border-[var(--color-border)] pt-4 text-xs">
                {compareData.comparison.emergedThemes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--color-accent-green)]">New themes:</span>
                    {compareData.comparison.emergedThemes.map((t) => (
                      <span key={t} className="rounded border border-[var(--color-accent-green)]/30 bg-[var(--color-accent-green)]/15 px-2 py-0.5 font-medium text-[var(--color-accent-green)]">{t}</span>
                    ))}
                  </div>
                )}
                {compareData.comparison.fadedThemes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--color-accent-orange)]">No longer shown:</span>
                    {compareData.comparison.fadedThemes.map((t) => (
                      <span key={t} className="rounded border border-[var(--color-accent-orange)]/30 bg-[var(--color-accent-orange)]/15 px-2 py-0.5 font-medium text-[var(--color-accent-orange)]">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tag Diff Chips */}
            {(compareData.comparison.newTags.length > 0 || compareData.comparison.removedTags.length > 0) && (
              <div className="border-t border-[var(--color-border)] pt-4 flex flex-wrap gap-4 text-xs">
                {compareData.comparison.newTags.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--color-accent-green)]">+ New Visual Elements:</span>
                    <div className="flex flex-wrap gap-1">
                      {compareData.comparison.newTags.map((tag, i) => (
                        <span key={i} className="rounded bg-[var(--color-accent-green)]/15 text-[var(--color-accent-green)] border border-[var(--color-accent-green)]/30 px-2 py-0.5 font-medium">
                          +{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {compareData.comparison.removedTags.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--color-accent-orange)]">- Prior Elements:</span>
                    <div className="flex flex-wrap gap-1">
                      {compareData.comparison.removedTags.map((tag, i) => (
                        <span key={i} className="rounded bg-[var(--color-accent-orange)]/15 text-[var(--color-accent-orange)] border border-[var(--color-accent-orange)]/30 px-2 py-0.5 font-medium">
                          -{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Visual Pair Grid (Before vs After) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Before Asset Card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex flex-col justify-between">
              <div>
                <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-orange)]">
                    ⏪ Baseline (Before)
                  </span>
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <StatusBadge status={compareData.before.verificationStatus} />
                    {new Date(compareData.before.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="aspect-video w-full overflow-hidden bg-black/40">
                  <img
                    src={compareData.before.cloudinaryUrl}
                    alt="Baseline Evidence"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-xs font-medium text-[var(--color-text)]">
                    Activity: <span className="text-[var(--color-text-muted)]">{compareData.before.observation?.activity ?? 'Unclassified'}</span>
                  </p>
                  {compareData.before.observation?.caption && (
                    <p className="text-xs text-[var(--color-text-muted)] italic">
                      "{compareData.before.observation.caption}"
                    </p>
                  )}
                  {compareData.before.observation?.tags && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {compareData.before.observation.tags.map((t, i) => (
                        <span key={i} className="rounded bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[var(--color-border)] px-4 py-2 text-right">
                <a href={compareData.before.cloudinaryUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-accent-cyan)] hover:underline">
                  View Source Asset ↗
                </a>
                <p className="mt-1 break-all text-right font-mono text-[10px] text-[var(--color-text-muted)]">
                  {compareData.before.cloudinaryPublicId} • v{compareData.before.cloudinaryVersion}
                </p>
              </div>
            </div>

            {/* After Asset Card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex flex-col justify-between">
              <div>
                <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-green)]">
                    ⏩ Follow-Up (After)
                  </span>
                  <span className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <StatusBadge status={compareData.after.verificationStatus} />
                    {new Date(compareData.after.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="aspect-video w-full overflow-hidden bg-black/40">
                  <img
                    src={compareData.after.cloudinaryUrl}
                    alt="Follow-Up Evidence"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-xs font-medium text-[var(--color-text)]">
                    Activity: <span className="text-[var(--color-accent-green)]">{compareData.after.observation?.activity ?? 'Unclassified'}</span>
                  </p>
                  {compareData.after.observation?.caption && (
                    <p className="text-xs text-[var(--color-text-muted)] italic">
                      "{compareData.after.observation.caption}"
                    </p>
                  )}
                  {compareData.after.observation?.tags && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {compareData.after.observation.tags.map((t, i) => (
                        <span key={i} className="rounded bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[var(--color-border)] px-4 py-2 text-right">
                <a href={compareData.after.cloudinaryUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-accent-cyan)] hover:underline">
                  View Source Asset ↗
                </a>
                <p className="mt-1 break-all text-right font-mono text-[10px] text-[var(--color-text-muted)]">
                  {compareData.after.cloudinaryPublicId} • v{compareData.after.cloudinaryVersion}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

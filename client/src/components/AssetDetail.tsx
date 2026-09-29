import { useEffect, useState } from 'react'
import { api, type Asset } from '../lib/api'
import { StatusBadge } from './StatusBadge'

const resultStyle = {
  pass: { icon: '✓', color: 'text-[var(--color-accent-green)]' },
  fail: { icon: '✕', color: 'text-[var(--color-accent-red)]' },
  skipped: { icon: '–', color: 'text-[var(--color-text-muted)]' },
} as const

/**
 * Full record for one asset: why it has its verification status (every
 * check, with the reason) and its Cloudinary provenance (public ID, version,
 * transformation history) — the traceability requirement made visible.
 */
export function AssetDetail({
  asset,
  onClose,
  onChanged,
}: {
  asset: Asset
  onClose: () => void
  onChanged: (updated: Asset) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function reverify() {
    setBusy(true)
    setError(null)
    try {
      onChanged(await api.reverifyAsset(asset.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-verification failed')
    } finally {
      setBusy(false)
    }
  }

  const status = asset.verificationStatus ?? 'UNVERIFIED'
  const obs = asset.observation

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Asset details"
    >
      <div
        className="my-8 w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] p-5">
          <div>
            <h2 className="text-lg font-bold">{asset.projectName}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              📍 {asset.location}
              {asset.stage ? ` • Stage: ${asset.stage}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <button
              onClick={onClose}
              className="cursor-pointer text-[var(--color-text-muted)] hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-2">
          <div className="space-y-3">
            {asset.resourceType === 'video' ? (
              <video src={asset.cloudinaryUrl} controls className="w-full rounded-lg bg-black/40" />
            ) : (
              <img src={asset.cloudinaryUrl} alt={asset.projectName} className="w-full rounded-lg bg-black/40" />
            )}
            {obs?.caption && <p className="text-xs italic text-[var(--color-text-muted)]">"{obs.caption}"</p>}
            {obs && (
              <div className="space-y-1.5 text-xs">
                {obs.activity && (
                  <p>
                    <span className="text-[var(--color-text-muted)]">Activity: </span>
                    <span className="font-medium text-[var(--color-accent-yellow)]">{obs.activity}</span>
                  </p>
                )}
                {obs.objects.length > 0 && (
                  <p>
                    <span className="text-[var(--color-text-muted)]">Objects: </span>
                    {obs.objects.join(', ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {obs.tags.map((t) => (
                    <span key={t} className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                      #{t}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)]">Source: {obs.source}</p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent-cyan)]">
                  Verification checks
                </h3>
                <button
                  onClick={reverify}
                  disabled={busy}
                  className="cursor-pointer rounded border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-muted)] hover:text-white disabled:opacity-50"
                >
                  {busy ? 'Re-checking…' : 'Re-run checks'}
                </button>
              </div>
              {asset.verification?.checks.length ? (
                <ul className="space-y-2">
                  {asset.verification.checks.map((c) => (
                    <li key={c.id} className="text-xs">
                      <span className={`mr-1.5 font-bold ${resultStyle[c.result].color}`}>{resultStyle[c.result].icon}</span>
                      <span className="font-medium">{c.label}</span>
                      <p className="ml-4 text-[11px] text-[var(--color-text-muted)]">{c.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">No checks recorded yet.</p>
              )}
              {error && <p className="mt-2 text-xs text-[var(--color-accent-red)]">{error}</p>}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-accent-cyan)]">
                Traceability
              </h3>
              <dl className="space-y-1 text-[11px]">
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">Cloudinary public ID: </dt>
                  <dd className="inline break-all font-mono">{asset.cloudinaryPublicId}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">Version: </dt>
                  <dd className="inline font-mono">{asset.cloudinaryVersion ?? '—'}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">Claimed capture date: </dt>
                  <dd className="inline">{asset.capturedAt ? new Date(asset.capturedAt).toLocaleDateString() : 'not provided'}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--color-text-muted)]">Capture date in file (EXIF): </dt>
                  <dd className="inline">{asset.exifCapturedAt ? new Date(asset.exifCapturedAt).toLocaleDateString() : 'none'}</dd>
                </div>
              </dl>
              {asset.transformations && asset.transformations.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] text-[var(--color-text-muted)]">Pre-processing applied on upload:</p>
                  <ul className="mt-1 space-y-1">
                    {asset.transformations.map((t) => (
                      <li key={t.step} className="text-[11px]">
                        <code className="rounded bg-[var(--color-bg)] px-1 py-0.5 text-[var(--color-accent-yellow)]">{t.cloudinary}</code>{' '}
                        <span className="text-[var(--color-text-muted)]">{t.purpose}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <a
                href={asset.cloudinaryUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[11px] text-[var(--color-accent-cyan)] hover:underline"
              >
                Open source asset on Cloudinary ↗
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api, thumbUrl, type Asset } from '../lib/api'
import { StatusBadge } from './StatusBadge'

const resultLabel = { pass: 'Passed', fail: 'Failed', skipped: 'Not enough data' } as const
const resultStyle = {
  pass: 'bg-brand text-white border-brand',
  fail: 'bg-white text-brand-dark border-brand-dark',
  skipped: 'bg-tint-2 text-brand border-brand/40',
} as const

/**
 * Full record for one asset: why it has its verification status (every check
 * with its reason) and its Cloudinary provenance (public ID, version,
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
      className="fixed inset-0 z-[60] overflow-y-auto bg-ink/70 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Asset details"
    >
      <div className="mx-auto max-w-6xl border-2 border-ink bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-6 border-b-2 border-ink px-8 py-6">
          <div>
            <p className="eyebrow">Evidence record</p>
            <h2 className="mt-2 text-3xl font-bold">{asset.projectName}</h2>
            <p className="mt-1 text-lg text-muted">
              {asset.location}
              {asset.stage ? ` · ${asset.stage}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <StatusBadge status={status} className="text-base" />
            <button onClick={onClose} className="btn btn-outline">Close</button>
          </div>
        </div>

        <div className="grid gap-10 p-8 lg:grid-cols-2">
          <div className="space-y-5">
            {asset.resourceType === 'video' ? (
              <video src={asset.cloudinaryUrl} controls className="w-full bg-tint" />
            ) : (
              <img src={thumbUrl(asset, 1200)} alt={asset.projectName} className="w-full bg-tint" />
            )}
            {obs?.caption && <p className="text-xl leading-relaxed">{obs.caption}</p>}
            {obs && (
              <dl className="space-y-3 text-lg">
                {obs.activity && (
                  <div>
                    <dt className="text-sm font-bold uppercase tracking-wider text-muted">Activity</dt>
                    <dd className="font-bold text-brand">{obs.activity}</dd>
                  </div>
                )}
                {obs.objects.length > 0 && (
                  <div>
                    <dt className="text-sm font-bold uppercase tracking-wider text-muted">Objects</dt>
                    <dd>{obs.objects.join(', ')}</dd>
                  </div>
                )}
                {obs.tags.length > 0 && (
                  <div>
                    <dt className="text-sm font-bold uppercase tracking-wider text-muted">Tags</dt>
                    <dd className="text-muted">{obs.tags.join(' / ')}</dd>
                  </div>
                )}
                <p className="text-sm text-muted">Analysis source: {obs.source}</p>
              </dl>
            )}
          </div>

          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-2xl font-bold">Verification checks</h3>
                <button onClick={reverify} disabled={busy} className="btn btn-outline">
                  {busy ? 'Re-checking...' : 'Re-run checks'}
                </button>
              </div>
              {asset.verification?.checks.length ? (
                <ul className="space-y-5">
                  {asset.verification.checks.map((c) => (
                    <li key={c.id}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`border-2 px-2 py-0.5 text-sm font-bold ${resultStyle[c.result]}`}>{resultLabel[c.result]}</span>
                        <span className="text-lg font-bold">{c.label}</span>
                      </div>
                      <p className="mt-1 text-base leading-relaxed text-muted">{c.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-lg text-muted">No checks recorded yet.</p>
              )}
              {error && <p className="mt-3 text-lg text-brand-dark">{error}</p>}
            </section>

            <section>
              <h3 className="mb-4 border-b border-line pb-3 text-2xl font-bold">Traceability</h3>
              <dl className="space-y-2 text-base">
                <div><dt className="inline text-muted">Cloudinary public ID: </dt><dd className="inline break-all font-mono">{asset.cloudinaryPublicId}</dd></div>
                <div><dt className="inline text-muted">Version: </dt><dd className="inline font-mono">{asset.cloudinaryVersion ?? 'n/a'}</dd></div>
                <div><dt className="inline text-muted">Claimed capture date: </dt><dd className="inline">{asset.capturedAt ? new Date(asset.capturedAt).toLocaleDateString() : 'not provided'}</dd></div>
                <div><dt className="inline text-muted">Date embedded in file (EXIF): </dt><dd className="inline">{asset.exifCapturedAt ? new Date(asset.exifCapturedAt).toLocaleDateString() : 'none'}</dd></div>
              </dl>
              {asset.transformations && asset.transformations.length > 0 && (
                <div className="mt-5">
                  <p className="text-base font-bold">Pre-processing applied on upload</p>
                  <ul className="mt-2 space-y-2">
                    {asset.transformations.map((t) => (
                      <li key={t.step} className="text-base">
                        <code className="bg-tint-2 px-1.5 py-0.5 font-mono text-brand-dark">{t.cloudinary}</code>{' '}
                        <span className="text-muted">{t.purpose}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <a href={asset.cloudinaryUrl} target="_blank" rel="noreferrer" className="mt-5 inline-block text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark">
                Open source asset on Cloudinary
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

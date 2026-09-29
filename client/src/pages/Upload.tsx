import { useState, type FormEvent } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { api, type Asset } from '../lib/api'

interface FileResult {
  name: string
  asset?: Asset
  error?: string
}

const inputClass =
  'rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent-blue)]'

export function Upload() {
  const [files, setFiles] = useState<File[]>([])
  const [project, setProject] = useState('')
  const [location, setLocation] = useState('')
  const [stage, setStage] = useState('')
  const [capturedAt, setCapturedAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<FileResult[]>([])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (files.length === 0) return

    setSubmitting(true)
    setResults([])
    setProgress(0)
    const out: FileResult[] = []

    // Sequential on purpose: each asset is verified against the library,
    // including the ones uploaded just before it (duplicate detection).
    for (const file of files) {
      try {
        const asset = await api.uploadAsset(file, { project, location, stage, capturedAt })
        out.push({ name: file.name, asset })
      } catch (err) {
        out.push({ name: file.name, error: err instanceof Error ? err.message : 'Upload failed' })
      }
      setProgress(out.length)
      setResults([...out])
    }

    setSubmitting(false)
    setFiles([])
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Upload evidence</h1>
      <p className="mt-1 text-[var(--color-text-muted)]">
        Media is sent to Cloudinary, pre-processed, analyzed, and then verified against the project
        it is filed under. Select several files to upload a batch.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Project
          <input required value={project} onChange={(e) => setProject(e.target.value)} className={inputClass} placeholder="Solar Village" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Location
          <input required value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Village A" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Stage <span className="text-xs text-[var(--color-text-muted)]">(optional)</span>
            <input value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass} placeholder="Installation" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Captured on <span className="text-xs text-[var(--color-text-muted)]">(optional)</span>
            <input type="date" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Files
          <input
            required
            multiple
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-sm text-[var(--color-text-muted)]"
          />
          {files.length > 1 && <span className="text-xs text-[var(--color-text-muted)]">{files.length} files selected</span>}
        </label>

        <button
          type="submit"
          disabled={submitting || files.length === 0}
          className="mt-2 cursor-pointer rounded bg-[var(--color-accent-blue)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? `Uploading ${progress + 1} of ${files.length}…` : 'Upload'}
        </button>
      </form>

      {results.length > 0 && (
        <ul className="mt-8 max-w-2xl space-y-3">
          {results.map((r, i) => (
            <li key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{r.name}</span>
                {r.asset && <StatusBadge status={r.asset.verificationStatus ?? 'UNVERIFIED'} />}
              </div>
              {r.error && <p className="mt-1 text-xs text-[var(--color-accent-red)]">{r.error}</p>}
              {r.asset && (
                <>
                  {r.asset.observation?.caption && (
                    <p className="mt-1 text-xs italic text-[var(--color-text-muted)]">"{r.asset.observation.caption}"</p>
                  )}
                  {r.asset.verificationNote && (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{r.asset.verificationNote}</p>
                  )}
                  {r.asset.observationError && (
                    <p className="mt-1 text-xs text-[var(--color-accent-orange)]">Analysis note: {r.asset.observationError}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

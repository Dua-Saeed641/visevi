import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'

export function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [project, setProject] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) return

    setStatus('submitting')
    try {
      await api.uploadAsset(file, { project, location })
      setStatus('success')
      setFile(null)
      setProject('')
      setLocation('')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Upload evidence</h1>
      <p className="mt-1 text-[var(--color-text-muted)]">
        Media is sent to Cloudinary and analyzed; the resulting observation is
        stored against the project and location below.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Project
          <input
            required
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent-blue)]"
            placeholder="Solar Village"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent-blue)]"
            placeholder="Village A"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          File
          <input
            required
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-[var(--color-text-muted)]"
          />
        </label>

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="mt-2 rounded bg-[var(--color-accent-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'submitting' ? 'Uploading…' : 'Upload'}
        </button>

        {status === 'success' && (
          <p className="text-sm text-[var(--color-accent-green)]">Uploaded.</p>
        )}
        {status === 'error' && (
          <p className="text-sm text-[var(--color-accent-red)]">{errorMessage}</p>
        )}
      </form>
    </div>
  )
}

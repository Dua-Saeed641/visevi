import { useEffect, useState } from 'react'
import { api, type Asset } from '../lib/api'

export function Dashboard() {
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listAssets()
      .then(setAssets)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load assets'))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold">Evidence</h1>
      <p className="mt-1 text-[var(--color-text-muted)]">
        Uploaded field media, organized by project and location.
      </p>

      {error && (
        <p className="mt-6 text-sm text-[var(--color-accent-red)]">
          Could not reach the API: {error}
        </p>
      )}

      {!error && assets === null && (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">Loading…</p>
      )}

      {assets?.length === 0 && (
        <p className="mt-6 text-sm text-[var(--color-text-muted)]">
          No evidence uploaded yet. Head to Upload to add the first asset.
        </p>
      )}

      {assets && assets.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <img
                src={asset.cloudinaryUrl}
                alt={asset.projectName}
                className="aspect-square w-full rounded object-cover"
              />
              <p className="mt-2 text-sm font-medium">{asset.projectName}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{asset.location}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

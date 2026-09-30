import { useState, type FormEvent } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { PageHeader } from '../components/ui'
import { api, signalsApi, type Asset } from '../lib/api'

interface FileResult {
  name: string
  asset?: Asset
  error?: string
}

export function Upload() {
  const [files, setFiles] = useState<File[]>([])
  const [project, setProject] = useState('')
  const [location, setLocation] = useState('')
  const [stage, setStage] = useState('')
  const [capturedAt, setCapturedAt] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [finding, setFinding] = useState(false)
  const [findNote, setFindNote] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<FileResult[]>([])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (files.length === 0) return

    setSubmitting(true)
    setResults([])
    setProgress(0)
    const out: FileResult[] = new Array(files.length)
    let done = 0
    let next = 0

    // A few uploads in parallel: the slow part (Cloudinary upload + AI analysis)
    // is waiting on the network. Parallel uploads can't see each other when
    // verifying, so the library is re-verified once at the end.
    const CONCURRENCY = 3
    async function worker() {
      while (next < files.length) {
        const i = next++
        const file = files[i]
        try {
          out[i] = { name: file.name, asset: await api.uploadAsset(file, { project, location, stage, capturedAt, lat, lng }) }
        } catch (err) {
          out[i] = { name: file.name, error: err instanceof Error ? err.message : 'Upload failed' }
        }
        done++
        setProgress(done)
        setResults(out.filter(Boolean))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker))

    if (files.length > 1) {
      try {
        await api.reverifyAll()
        const refreshed = await Promise.all(
          out.map(async (r) => (r.asset ? { ...r, asset: await api.getAsset(r.asset.id).catch(() => r.asset) } : r)),
        )
        setResults(refreshed)
      } catch {
        /* results already shown; re-verification is best-effort here */
      }
    }

    setSubmitting(false)
    setFiles([])
  }

  return (
    <div>
      <PageHeader eyebrow="Add evidence" title="Upload photos and video">
        Files are pre-processed, analysed and verified on upload. Select several to upload a batch.
      </PageHeader>

      <div className="grid gap-16 xl:grid-cols-[minmax(0,34rem)_1fr]">
        <form onSubmit={handleSubmit} className="card card-accent space-y-6 p-8">
          <label className="block">
            <span className="mb-2 block text-lg font-bold">Project</span>
            <input required className="input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Solar Village" />
          </label>
          <label className="block">
            <span className="mb-2 block text-lg font-bold">Location</span>
            <input required className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Village A" />
          </label>
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-lg font-bold">Stage <span className="font-normal text-muted">(optional)</span></span>
              <input className="input" value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Installation" />
            </label>
            <label className="block">
              <span className="mb-2 block text-lg font-bold">Captured on <span className="font-normal text-muted">(optional)</span></span>
              <input type="date" className="input" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
            </label>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-lg font-bold">Latitude <span className="font-normal text-muted">(optional)</span></span>
              <input type="number" step="any" min={-90} max={90} className="input" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="25.75" />
            </label>
            <label className="block">
              <span className="mb-2 block text-lg font-bold">Longitude <span className="font-normal text-muted">(optional)</span></span>
              <input type="number" step="any" min={-180} max={180} className="input" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="71.39" />
            </label>
            <div className="sm:col-span-2">
              <button
                type="button" className="btn btn-outline" disabled={location.trim().length < 3 || finding}
                onClick={async () => {
                  setFinding(true); setFindNote(null)
                  try {
                    const r = await signalsApi.geocode(location)
                    setLat(String(Math.round(r.lat * 1e4) / 1e4)); setLng(String(Math.round(r.lng * 1e4) / 1e4))
                    setFindNote(`Found: ${r.displayName}`)
                  } catch (e) {
                    setFindNote(e instanceof Error ? 'No match. Enter coordinates by hand.' : 'Lookup failed.')
                  } finally { setFinding(false) }
                }}
              >
                {finding ? 'Looking up...' : 'Find coordinates from the location name'}
              </button>
              {findNote && <p className="mt-2 text-base text-muted">{findNote} (OpenStreetMap Nominatim)</p>}
            </div>
            <p className="text-base text-muted sm:col-span-2">
              Coordinates make this location a monitored site: live temperature is watched there, and heat or cold alerts are matched to this evidence.
            </p>
          </div>
          <label className="block">
            <span className="mb-2 block text-lg font-bold">Files</span>
            <input
              required multiple type="file" accept="image/*,video/*"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="input file:mr-4 file:cursor-pointer file:border-0 file:bg-brand file:px-4 file:py-2 file:font-bold file:text-white"
            />
            {files.length > 1 && <span className="mt-2 block text-base text-muted">{files.length} files selected</span>}
          </label>
          <button type="submit" disabled={submitting || files.length === 0} className="btn w-full text-lg">
            {submitting ? `Uploading: ${progress} of ${files.length} done` : 'Upload'}
          </button>
        </form>

        <div>
          {results.length > 0 && <h2 className="mb-5 border-b-4 border-ink pb-2 text-2xl font-bold">Results</h2>}
          <ul className="space-y-5">
            {results.map((r, i) => (
              <li key={i} className="card p-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="truncate text-lg font-bold">{r.name}</span>
                  {r.asset && <StatusBadge status={r.asset.verificationStatus ?? 'UNVERIFIED'} />}
                </div>
                {r.error && <p className="mt-2 text-lg text-brand-dark">{r.error}</p>}
                {r.asset?.observation?.caption && <p className="mt-2 text-lg">{r.asset.observation.caption}</p>}
                {r.asset?.verificationNote && <p className="mt-2 text-base leading-relaxed text-muted">{r.asset.verificationNote}</p>}
                {r.asset?.observationError && <p className="mt-2 text-base text-brand-dark">Analysis note: {r.asset.observationError}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

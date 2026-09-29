import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NeuralBackdrop } from '../components/NeuralBackdrop'
import { api, type Overview } from '../lib/api'

const steps = [
  { n: '01', title: 'Ingest', text: 'Photos and video go to Cloudinary. Field shots are straightened, enhanced and sharpened on the way in, so blurry phone pictures survive analysis.' },
  { n: '02', title: 'Understand', text: 'Cloudinary AI Vision reads each image and returns what is happening, which objects are visible and a plain-language caption. Nothing is typed in by hand.' },
  { n: '03', title: 'Verify', text: 'Every photo is checked against the project it is filed under. Mismatches and recycled photos are flagged, with the reason stated.' },
  { n: '04', title: 'Report', text: 'Verified evidence becomes before and after comparisons, a project timeline, UN SDG indicator mapping and a printable impact report.' },
]

const checks = [
  { title: 'Content matches the claim', text: 'A photo filed under a solar project should show solar equipment. If the AI sees a flower, it is flagged.' },
  { title: 'Consistent with the project', text: 'The photo is compared with the rest of the evidence in the same project, not judged in isolation.' },
  { title: 'Not a reused photo', text: 'A perceptual fingerprint catches the same picture recycled across projects or reporting periods, even after resizing or recompression.' },
  { title: 'Date matches the file', text: 'The capture date claimed at upload is compared with the date embedded in the image itself.' },
]

const cloudinary = [
  'Upload with incoming transformations: auto-orient, enhance, sharpen',
  'AI Vision analysis for activity, objects, tags and captions',
  'Public ID, version and transformation history kept on every asset',
  'On-the-fly resized delivery for fast previews',
  'Rendered still frames so video can be analysed',
]

export function Home() {
  const [data, setData] = useState<Overview | null>(null)
  useEffect(() => {
    api.getOverview().then(setData).catch(() => {})
  }, [])

  const k = data?.kpis
  const figures = [
    { value: k ? k.totalAssets : '-', label: 'Evidence assets' },
    { value: k ? k.projects : '-', label: 'Projects' },
    { value: k ? `${k.verifiedRate}%` : '-', label: 'Verified' },
    { value: k ? k.flagged : '-', label: 'Flagged for review' },
  ]

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand text-white">
        <NeuralBackdrop className="absolute inset-y-0 right-0 h-full w-full opacity-70 lg:w-3/4" seed={11} />
        <div className="relative mx-auto max-w-[96rem] px-6 sm:px-10 lg:px-14">
          <div className="flex items-center justify-between py-8">
            <Link to="/" aria-label="VisEvi home" className="flex items-center gap-3 text-3xl font-bold tracking-tight">
              <img src="/logo.png" alt="" className="h-9 w-auto" />
              <span className="wordmark">VisEvi.</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-7 text-lg font-bold">
              <Link to="/dashboard" className="hover:underline">Analytics</Link>
              <Link to="/library" className="hover:underline">Library</Link>
              <Link to="/upload" className="hover:underline">Upload</Link>
            </nav>
          </div>

          <div className="max-w-4xl pb-20 pt-16 lg:pb-28 lg:pt-24">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/80">
              Geek Room hackathon &middot; Cloudinary problem statement
            </p>
            <h1 className="mt-6 text-6xl font-bold leading-[1.02] sm:text-7xl lg:text-8xl">
              Evidence you can verify.
            </h1>
            <p className="mt-8 max-w-2xl text-2xl leading-relaxed text-white/90">
              VisEvi turns raw project photos and video into traceable, searchable proof of what happened, where and when,
              and checks every claim against what the image actually shows.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/library" className="btn btn-white text-lg">Open the evidence library</Link>
              <Link to="/dashboard" className="btn btn-ghost-white text-lg">View analytics</Link>
            </div>
          </div>

          <dl className="grid grid-cols-2 border-t border-white/40 lg:grid-cols-4">
            {figures.map((f, i) => (
              <div key={f.label} className={`py-8 lg:px-8 ${i === 0 ? 'lg:pl-0' : ''} ${i > 0 ? 'lg:border-l lg:border-white/40' : ''}`}>
                <dd className="numeral text-6xl">{f.value}</dd>
                <dt className="mt-2 text-lg text-white/85">{f.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-[96rem] px-6 sm:px-10 lg:px-14">
        {/* Problem */}
        <section className="grid gap-10 border-b-2 border-ink py-20 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 className="mt-3 text-4xl font-bold">A photo is only evidence if it can be trusted.</h2>
          </div>
          <div className="space-y-5 text-xl leading-relaxed">
            <p>
              NGOs, governments and sustainability teams produce huge volumes of field photos and video. Organising them,
              analysing them and proving they are genuine does not scale by hand.
            </p>
            <p className="text-muted">
              A picture with no context, no place and no link back to its source is just a file. VisEvi ties each one to a
              project, a location and a date, traces it to the exact Cloudinary asset, and tests whether it really shows
              what it is filed as.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-bold">From raw media to a report you can defend.</h2>
          <ol className="mt-14 grid gap-x-12 gap-y-14 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="border-t-4 border-brand pt-6">
                <span className="numeral text-6xl text-brand">{s.n}</span>
                <h3 className="mt-5 text-2xl font-bold">{s.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Verification */}
        <section className="grid gap-12 border-t-2 border-ink py-20 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="eyebrow">The difference</p>
            <h2 className="mt-3 text-4xl font-bold">Four checks on every photo.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Most tools stop at organising media. VisEvi also asks whether it can be believed, and shows its working.
            </p>
          </div>
          <ul className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {checks.map((c, i) => (
              <li key={c.title}>
                <p className="numeral text-3xl text-brand">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="mt-3 text-xl font-bold">{c.title}</h3>
                <p className="mt-2 text-lg leading-relaxed text-muted">{c.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Cloudinary + limits */}
        <section className="grid gap-12 border-t-2 border-ink py-20 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Built on Cloudinary</p>
            <h2 className="mt-3 text-4xl font-bold">Cloudinary is the engine, not the storage.</h2>
            <ul className="mt-8 divide-y divide-line border-y border-line text-lg">
              {cloudinary.map((c) => (
                <li key={c} className="py-3">{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Honest limits</p>
            <h2 className="mt-3 text-4xl font-bold">What it does not claim.</h2>
            <ul className="mt-8 space-y-4 text-lg leading-relaxed text-muted">
              <li>Observations describe what is visible. It does not measure quantities such as the share of a roof covered.</li>
              <li>Search and indicator mapping recognise the concepts in a curated, auditable lexicon, not an opaque model.</li>
              <li>The indicator score counts supporting assets. It is not a probability.</li>
              <li>Duplicate detection catches resized and recompressed copies, not crops.</li>
            </ul>
          </div>
        </section>
      </div>

      {/* Closing call to action */}
      <section className="bg-brand text-white">
        <div className="mx-auto flex max-w-[96rem] flex-col items-start justify-between gap-8 px-6 py-16 sm:px-10 lg:flex-row lg:items-center lg:px-14">
          <h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">See the seeded evidence and try the checks yourself.</h2>
          <div className="flex flex-wrap gap-4">
            <Link to="/library" className="btn btn-white text-lg">Open the library</Link>
            <Link to="/upload" className="btn btn-ghost-white text-lg">Upload a photo</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

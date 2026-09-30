import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SignalArt } from '../components/SignalArt'
import { api, signalsApi, type AlertSummary, type Overview, type RiskResponse, type SitesResponse } from '../lib/api'

const steps = [
  { n: '01', title: 'Signal', text: 'Live readings are judged against what is normal for each place and season.' },
  { n: '02', title: 'Capture', text: 'A breach pulls a fresh NASA satellite view of the site through Cloudinary.' },
  { n: '03', title: 'Verify', text: 'It is compared with the same season a year earlier. Confirmed, or not.' },
  { n: '04', title: 'Notify', text: 'The people responsible are told, with the evidence attached.' },
]

const factors = [
  { w: 25, label: 'Long-run exposure', src: 'NASA hazard maps' },
  { w: 20, label: 'Live conditions', src: 'Current reading' },
  { w: 20, label: '7-day outlook', src: 'Forecast' },
  { w: 15, label: 'Recent incidents', src: 'Alert history' },
  { w: 10, label: 'Nearby events', src: 'NASA EONET' },
  { w: 10, label: 'Hazard signs in imagery', src: 'Cloudinary AI' },
]

const cloudinary = [
  'Pre-processing on upload: auto-orient, enhance, sharpen',
  'AI Vision reads every capture: activity, objects, tags, caption',
  'Provenance: satellite snapshots are re-requested from NASA and matched',
  'One delivery URL composes before, after and the reading',
  'Public ID, version and transformations kept on every asset',
]

const limits = [
  'Satellite views are about 250 m per pixel: they show drying, snow and gross water change, not waves or street-level damage.',
  'The risk index is a transparent weighted formula, not a trained model. Its weights are judgement.',
  'Live layers are one to five days behind. Hazard-zone maps are historical, not forecasts.',
  '"Not confirmed" and "inconclusive" are real answers. Heat is often invisible from orbit.',
]

function useLive() {
  const [sites, setSites] = useState<SitesResponse | null>(null)
  const [alerts, setAlerts] = useState<AlertSummary[] | null>(null)
  const [risk, setRisk] = useState<RiskResponse | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  useEffect(() => {
    signalsApi.sites().then(setSites).catch(() => {})
    signalsApi.alerts().then(setAlerts).catch(() => {})
    signalsApi.risk().then(setRisk).catch(() => {})
    api.getOverview().then(setOverview).catch(() => {})
  }, [])
  return { sites, alerts, risk, overview }
}

export function Home() {
  const { sites, alerts, risk, overview } = useLive()
  const open = alerts ? alerts.filter((a) => a.status !== 'resolved').length : null
  const top = risk?.sites[0]

  const figures = [
    { value: open ?? '-', label: 'Active alerts' },
    { value: sites ? sites.sites.length : '-', label: 'Sites monitored' },
    { value: top ? top.score : '-', label: top ? `Highest risk, ${top.name.split(',')[0]}` : 'Highest risk score' },
    { value: overview ? `${overview.kpis.verifiedRate}%` : '-', label: 'Evidence verified' },
  ]

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Hero */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-[96rem] px-6 sm:px-10 lg:px-14">
          <div className="flex items-center justify-between py-7">
            <Link to="/" aria-label="VisEvi home" className="flex items-center gap-3 text-3xl font-bold tracking-tight">
              <img src="/logo.png" alt="" className="h-9 w-auto" />
              <span className="wordmark">VisEvi.</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-4 text-base font-bold sm:gap-8 sm:text-lg">
              <Link to="/dashboard" className="hover:underline">Dashboard</Link>
              <Link to="/watch" className="hover:underline">Disaster watch</Link>
              <Link to="/library" className="hidden hover:underline sm:inline">Evidence</Link>
              <Link to="/upload" className="hidden hover:underline sm:inline">Upload</Link>
            </nav>
          </div>

          <div className="grid items-center gap-10 pb-14 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-10">
            <div>
              <h1 className="text-6xl font-bold leading-[1.02] sm:text-7xl xl:text-8xl">
                Disaster signals, verified from orbit.
              </h1>
              <p className="mt-7 max-w-xl text-xl leading-relaxed text-white/90 sm:text-2xl">
                A sensor raises the alarm. A satellite check confirms it. The right people are told.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <Link to="/watch" className="btn btn-white text-lg">Open disaster watch</Link>
                <Link to="/dashboard" className="btn btn-ghost-white text-lg">View dashboard</Link>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[34rem] lg:max-w-none">
              <SignalArt className="h-auto w-full" />
            </div>
          </div>

          <dl className="grid grid-cols-2 border-t border-white/40 lg:grid-cols-4">
            {figures.map((f, i) => (
              <div key={f.label} className={`py-7 sm:py-8 ${i % 2 === 1 ? 'pl-5' : ''} lg:px-8 ${i === 0 ? 'lg:pl-0' : ''} ${i > 0 ? 'lg:border-l lg:border-white/40' : ''} ${i === 2 ? 'border-t border-white/40 lg:border-t-0' : ''} ${i === 3 ? 'border-t border-white/40 lg:border-t-0' : ''}`}>
                <dd className="numeral text-5xl sm:text-6xl">{f.value}</dd>
                <dt className="mt-2 text-base text-white/85 sm:text-lg">{f.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-[96rem] px-6 sm:px-10 lg:px-14">
        {/* How it works */}
        <section className="py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-bold">From a reading to a confirmed alert.</h2>
          <ol className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="border-t-4 border-brand pt-5">
                <span className="numeral text-5xl text-brand">{s.n}</span>
                <h3 className="mt-4 text-2xl font-bold">{s.title}</h3>
                <p className="mt-2 text-lg leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Risk index */}
        <section className="grid gap-12 border-t-2 border-ink py-20 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow">Risk index</p>
            <h2 className="mt-3 text-4xl font-bold">One number for how prone a place is.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Zero to a hundred, with a separate confidence score showing how much of it rests on fresh, sourced data.
            </p>
            <Link to="/report" className="btn btn-outline mt-7 text-lg">See a site report</Link>
          </div>
          <ul className="grid gap-x-10 gap-y-2 sm:grid-cols-2">
            {factors.map((f) => (
              <li key={f.label} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                <span>
                  <span className="block text-lg font-bold">{f.label}</span>
                  <span className="text-base text-muted">{f.src}</span>
                </span>
                <span className="numeral text-3xl text-brand">{f.w}</span>
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
              {cloudinary.map((c) => <li key={c} className="py-3">{c}</li>)}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Honest limits</p>
            <h2 className="mt-3 text-4xl font-bold">What it does not claim.</h2>
            <ul className="mt-8 space-y-4 text-lg leading-relaxed text-muted">
              {limits.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        </section>
      </div>

      <section className="bg-brand text-white">
        <div className="mx-auto flex max-w-[96rem] flex-col items-start justify-between gap-8 px-6 py-16 sm:px-10 lg:flex-row lg:items-center lg:px-14">
          <h2 className="max-w-2xl text-4xl font-bold sm:text-5xl">See it work on real sites.</h2>
          <div className="flex flex-wrap gap-4">
            <Link to="/watch" className="btn btn-white text-lg">Open disaster watch</Link>
            <Link to="/dashboard" className="btn btn-ghost-white text-lg">View dashboard</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

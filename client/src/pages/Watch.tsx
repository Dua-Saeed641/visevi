import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Meter, Panel, Pill } from '../components/dash'
import { levelTone } from '../components/dashTheme'
import { SitesMap } from '../components/SitesMap'
import { Empty, Loading, Notice, PageHeader } from '../components/ui'
import {
  signalsApi,
  type AlertDetail,
  type AlertStatus,
  type AlertSummary,
  type Contact,
  type HazardSeverity,
  type NaturalEvent,
  type RiskResponse,
  type SitesResponse,
} from '../lib/api'

const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const kind = (t: string) => (t === 'heatwave' ? 'Heat wave' : t === 'coldwave' ? 'Cold wave' : 'High waves')
const val = (n: number, unit: string) => `${n.toFixed(1)} ${unit}`
const sevLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const PRIORITY = {
  escalate: 'Escalate to the authority now',
  respond: 'Respond: dispatch a field team',
  monitor: 'Monitor and gather evidence',
} as const

export function Watch() {
  const [params, setParams] = useSearchParams()
  const [sites, setSites] = useState<SitesResponse | null>(null)
  const [alerts, setAlerts] = useState<AlertSummary[] | null>(null)
  const [risk, setRisk] = useState<RiskResponse | null>(null)
  const [contacts, setContacts] = useState<{ contacts: Contact[]; channels: { email: boolean; ntfy: boolean } } | null>(null)
  const [selected, setSelected] = useState<string | null>(params.get('alert'))
  const [loaded, setLoaded] = useState<{ id: string; data: AlertDetail } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [events, setEvents] = useState<NaturalEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [simSite, setSimSite] = useState('')
  const [simTemp, setSimTemp] = useState('43')
  const [simWave, setSimWave] = useState('')

  const load = useCallback(() => Promise.all([signalsApi.sites(), signalsApi.alerts()]), [])

  const apply = useCallback(([s, a]: [SitesResponse, AlertSummary[]]) => {
    setSites(s)
    setAlerts(a)
    setSimSite((cur) => cur || s.sites[0]?.locationId || '')
    setSelected((cur) => cur ?? a.find((x) => x.status !== 'resolved')?.id ?? a[0]?.id ?? null)
    setError(null)
  }, [])

  const refresh = useCallback(
    () => load().then(apply).catch((e: unknown) => setError(msg(e, 'Failed to load disaster watch'))),
    [load, apply],
  )

  useEffect(() => {
    load().then(apply).catch((e: unknown) => setError(msg(e, 'Failed to load disaster watch')))
    signalsApi.events().then(setEvents).catch(() => {})
    signalsApi.risk().then(setRisk).catch(() => {})
    signalsApi.contacts().then(setContacts).catch(() => {})
  }, [load, apply])

  // Detail is keyed by alert id, so switching alerts shows the loading state
  // without resetting state inside the effect.
  useEffect(() => {
    if (!selected) return
    let ignore = false
    signalsApi.alert(selected)
      .then((data) => { if (!ignore) setLoaded({ id: selected, data }) })
      .catch((e: unknown) => { if (!ignore) setError(msg(e, 'Failed to load alert')) })
    return () => { ignore = true }
  }, [selected, alerts])

  const detail = loaded && loaded.id === selected ? loaded.data : null

  // While the automatic loop is running for an alert, keep the page up to date. It polls while
  // a capture is pending, and for two minutes after this page starts one (a fresh alert has a
  // moment before its capture is recorded).
  const [watchUntil, setWatchUntil] = useState(0)
  const detailRef = useRef<AlertDetail | null>(null)
  useEffect(() => {
    detailRef.current = detail
  }, [detail])
  useEffect(() => {
    if (!selected) return
    const t = setInterval(() => {
      if (detailRef.current?.alert.capture?.status === 'pending' || Date.now() < watchUntil) {
        signalsApi.alert(selected).then((data) => setLoaded({ id: selected, data })).catch(() => {})
      }
    }, 4000)
    return () => clearInterval(t)
  }, [selected, watchUntil])

  const pick = (id: string) => {
    setSelected(id)
    setParams({ alert: id }, { replace: true })
  }

  async function poll() {
    setBusy(true)
    setNote(null)
    try {
      const r = await signalsApi.poll()
      const failed = r.results.filter((x) => x.error).length
      const raised = r.results.filter((x) => x.alert?.created).length
      setNote(`Read ${r.polled - failed} of ${r.polled} sites. ${raised} new alert${raised === 1 ? '' : 's'} raised${failed ? `, ${failed} site${failed === 1 ? '' : 's'} could not be read` : ''}.`)
      await refresh()
    } catch (e) {
      setError(msg(e, 'Polling failed'))
    } finally {
      setBusy(false)
    }
  }

  async function simulate() {
    const t = Number(simTemp)
    if (!simSite || !Number.isFinite(t)) return
    setBusy(true)
    setNote(null)
    try {
      const r = await signalsApi.simulate(simSite, t, simWave === '' ? undefined : Number(simWave))
      setNote(
        r.alert
          ? `${r.created ? 'Alert raised' : r.escalated ? 'Alert escalated' : 'Existing alert updated'}: ${kind(r.alert.type)}, ${r.alert.severity}.${r.created || r.escalated ? ' The system is now capturing a satellite view; watch the steps update below.' : ''}`
          : 'Reading recorded. It is inside normal range, so no alert was raised.',
      )
      if (r.alert) pick(r.alert.id)
      if (r.created || r.escalated) setWatchUntil(Date.now() + 120_000)
      await refresh()
    } catch (e) {
      setError(msg(e, 'Signal failed'))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(id: string, status: AlertStatus) {
    try {
      await signalsApi.setStatus(id, status)
      await refresh()
    } catch (e) {
      setError(msg(e, 'Could not update the alert'))
    }
  }

  async function runCapture(id: string) {
    try {
      await signalsApi.runCapture(id)
      setNote('Capture started. The steps below update on their own.')
      setWatchUntil(Date.now() + 120_000)
      setLoaded(null)
      await refresh()
    } catch (e) {
      setError(msg(e, 'Could not start the capture'))
    }
  }

  const open = useMemo(() => (alerts ?? []).filter((a) => a.status !== 'resolved').length, [alerts])
  const riskBySite = useMemo(() => new Map((risk?.sites ?? []).map((r) => [r.locationId, r])), [risk])

  return (
    <div>
      <PageHeader
        eyebrow="Disaster watch"
        title="Signal in, confirmed response out"
        actions={<button className="btn" onClick={poll} disabled={busy || !sites || sites.sites.length === 0}>{busy ? 'Working...' : 'Check sensors now'}</button>}
      >
        Each site is watched live. A breach captures a fresh satellite view, checks it against last year, and tells the right people.
      </PageHeader>

      {error && <Notice>{error}</Notice>}
      {note && <Notice tone="info">{note}</Notice>}
      {!sites && !error && <Loading>Loading monitored sites...</Loading>}

      {sites && (
        <div className="space-y-6">
          <Panel
            title="Map"
            description={`${sites.sites.length} monitored site${sites.sites.length === 1 ? '' : 's'}${sites.unmonitored ? `, ${sites.unmonitored} without coordinates` : ''}. Temperature from ${sites.provider === 'google-maps-weather' ? 'Google Maps Platform Weather' : 'Open-Meteo'}${sites.pollMinutes > 0 ? `, every ${sites.pollMinutes} minutes` : ', on demand'}.`}
          >
            {sites.sites.length === 0 ? (
              <Empty title="No monitored sites yet">Add a place name or coordinates when uploading evidence, or run <code>npm run seed:sites</code> in server/.</Empty>
            ) : (
              <SitesMap sites={sites.sites} events={events} />
            )}
          </Panel>

          {sites.sites.length > 0 && (
            <Panel title="Sites" description="Live reading, and how prone each place is (Risk index, 0 to 100).">
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sites.sites.map((s) => {
                  const r = riskBySite.get(s.locationId)
                  return (
                    <li key={s.locationId} className="rounded-lg border border-line p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold" title={s.name}>{s.name}</p>
                          <p className="truncate text-sm text-muted" title={s.projectName}>{s.projectName}</p>
                        </div>
                        {s.worstSeverity ? <Pill tone={levelTone(s.worstSeverity)}>{sevLabel(s.worstSeverity)}</Pill> : <Pill tone="outline">Normal</Pill>}
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <p className="numeral text-4xl">{s.latest ? `${s.latest.tempC.toFixed(1)}°` : 'n/a'}</p>
                          <p className="mt-1 text-sm text-muted">
                            {s.latest?.anomalyC != null && s.latest.normalC != null ? `${s.latest.anomalyC > 0 ? '+' : ''}${s.latest.anomalyC.toFixed(1)} vs normal ${s.latest.normalC.toFixed(1)}. ` : ''}
                            {s.latest?.waveHeightM != null ? `Waves ${s.latest.waveHeightM.toFixed(1)} m.` : ''}
                          </p>
                        </div>
                        <div className="w-28 text-right">
                          {r ? (
                            <>
                              <p className="text-sm font-bold text-muted">Risk {r.score}</p>
                              <div className="mt-1"><Meter value={r.score / 100} label={`Risk index ${r.score}`} /></div>
                              <p className="mt-1 text-sm"><Pill tone={levelTone(r.level)}>{r.level}</Pill></p>
                            </>
                          ) : (
                            <p className="text-sm text-muted">Risk computing</p>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 border-t border-line pt-2 text-sm text-muted">{s.assetCount} capture{s.assetCount === 1 ? '' : 's'}{s.latest ? `, ${s.latest.sourceLabel}, ${when(s.latest.observedAt)}` : ', no reading yet'}</p>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}

          {sites.sites.length > 0 && (
            <Panel title="Simulate a sensor signal" description="Sends a reading through the same intake a physical sensor uses. It starts the full loop for real, including a fresh NASA satellite capture.">
              <div className="flex flex-wrap items-end gap-5">
                <label className="block min-w-[14rem] flex-1">
                  <span className="mb-2 block text-base font-bold">Site</span>
                  <select className="input" value={simSite} onChange={(e) => setSimSite(e.target.value)}>
                    {sites.sites.map((s) => <option key={s.locationId} value={s.locationId}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block w-40">
                  <span className="mb-2 block text-base font-bold">Temperature (°C)</span>
                  <input type="number" step="0.1" className="input" value={simTemp} onChange={(e) => setSimTemp(e.target.value)} />
                </label>
                <label className="block w-44">
                  <span className="mb-2 block text-base font-bold">Wave height (m)</span>
                  <input type="number" step="0.1" min={0} className="input" value={simWave} onChange={(e) => setSimWave(e.target.value)} placeholder="optional" />
                </label>
                <button className="btn" onClick={simulate} disabled={busy || !simSite}>Send signal</button>
              </div>
            </Panel>
          )}

          <Panel title="Alerts" description={`${open} open, ${(alerts?.length ?? 0) - open} closed.`}>
            {alerts && alerts.length === 0 ? (
              <Empty title="No alerts">No site has crossed a threshold. Use "Check sensors now", or simulate a signal above.</Empty>
            ) : (
              <div className="grid gap-8 xl:grid-cols-[minmax(0,21rem)_1fr]">
                <ul className="max-h-[70rem] space-y-2.5 overflow-y-auto pr-1">
                  {(alerts ?? []).map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => pick(a.id)}
                        aria-pressed={selected === a.id}
                        className={`w-full cursor-pointer rounded-lg border p-3.5 text-left transition-colors ${selected === a.id ? 'border-2 border-brand bg-tint' : 'border-line hover:bg-tint'} ${a.status === 'resolved' ? 'opacity-65' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Pill tone={levelTone(a.severity)}>{sevLabel(a.severity)}</Pill>
                          <span className="text-sm font-bold capitalize text-muted">{a.status}</span>
                        </div>
                        <p className="mt-2 text-lg font-bold leading-snug">{a.location}</p>
                        <p className="text-sm text-muted">{kind(a.type)}, {val(a.latestValue, a.unit)}, {when(a.createdAt)}</p>
                        <p className="mt-1 flex flex-wrap gap-1.5">
                          {a.trigger.source === 'historical-replay' && <Pill tone="outline">History</Pill>}
                          {a.confirmation?.status === 'confirmed' && <Pill tone="solid">Confirmed</Pill>}
                          {a.notifiedAt && <Pill tone="pale">Notified</Pill>}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="min-w-0">
                  {!detail && selected && <Loading>Comparing this site's evidence...</Loading>}
                  {detail && <AlertPanel d={detail} risk={riskBySite.get(detail.alert.locationId)} onStatus={setStatus} onCapture={runCapture} />}
                </div>
              </div>
            )}
          </Panel>

          <ContactsPanel data={contacts} sites={sites} onChange={() => signalsApi.contacts().then(setContacts).catch(() => {})} />
        </div>
      )}
    </div>
  )
}

/* ── One alert, with the loop it triggered ───────────────────────────────── */

function Step({ n, title, state, children }: { n: number; title: string; state: 'done' | 'active' | 'todo' | 'warn'; children: React.ReactNode }) {
  const dot =
    state === 'done' ? 'border-brand bg-brand text-white' : state === 'active' ? 'border-brand bg-white text-brand' : state === 'warn' ? 'border-brand-dark bg-tint-2 text-brand-dark' : 'border-line bg-white text-muted'
  return (
    <li className="flex gap-3 sm:block sm:flex-1">
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${dot}`}>{state === 'done' ? '✓' : n}</span>
      <div className="min-w-0 sm:mt-2">
        <p className="text-base font-bold leading-tight">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{children}</p>
      </div>
    </li>
  )
}

const CONFIRM_LABEL = { confirmed: 'Confirmed', 'not-confirmed': 'Not confirmed', inconclusive: 'Inconclusive' } as const

function AlertPanel({
  d, risk, onStatus, onCapture,
}: {
  d: AlertDetail
  risk?: RiskResponse['sites'][number]
  onStatus: (id: string, s: AlertStatus) => void
  onCapture: (id: string) => void
}) {
  const a = d.alert
  const hasCoords = a.lat !== null && a.lng !== null
  const cap = a.capture
  const conf = a.confirmation
  const history = a.trigger.source === 'historical-replay'
  return (
    <article className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={levelTone(a.severity)}>{sevLabel(a.severity)}</Pill>
            {history && <Pill tone="outline">History (replayed)</Pill>}
            {conf && <Pill tone={conf.status === 'confirmed' ? 'solid' : 'pale'}>{CONFIRM_LABEL[conf.status]}</Pill>}
          </div>
          <h3 className="mt-2 text-3xl font-bold leading-tight">{kind(a.type)} at {a.location}</h3>
          <p className="mt-1 text-base text-muted">{a.projectName}, first signal {when(a.trigger.observedAt)} via {a.trigger.sourceLabel}</p>
        </div>
        <div className="text-right">
          <p className="numeral text-5xl text-brand">{val(a.latestValue, a.unit)}</p>
          <p className="mt-1 text-sm text-muted">peak {val(a.peakValue, a.unit)} over {a.readingCount} reading{a.readingCount === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className="mt-5 rounded-md border-l-4 border-brand bg-tint px-5 py-4">
        <p className="text-xl font-bold">{PRIORITY[d.priority]}</p>
        <p className="text-base text-muted">{d.priorityReason}{risk ? ` Site risk index ${risk.score} (${risk.level}, ${risk.confidence}% confidence).` : ''}</p>
      </div>

      {/* The automatic loop */}
      {!history && (
        <>
          <h4 className="mt-8 text-xl font-bold">Response loop</h4>
          <ol className="mt-4 grid gap-4 sm:flex sm:gap-3">
            <Step n={1} title="Signal" state="done">{val(a.trigger.value, a.trigger.unit)} {a.trigger.basis === 'anomaly' ? 'unusual for this place and month' : 'past a fixed limit'}.</Step>
            <Step n={2} title="Satellite capture" state={!cap ? 'todo' : cap.status === 'pending' ? 'active' : cap.status === 'captured' ? 'done' : 'warn'}>
              {!cap ? 'Not started.' : cap.status === 'pending' ? 'Requesting a fresh NASA view...' : cap.status === 'captured' ? `NASA view from ${cap.date}, through Cloudinary.` : cap.status === 'cloudy' ? 'No clear view in the last 10 days.' : 'Capture failed.'}
            </Step>
            <Step n={3} title="Compare" state={conf?.baselineDate ? 'done' : cap?.status === 'pending' ? 'active' : conf ? 'warn' : 'todo'}>
              {conf?.baselineDate ? `Against ${conf.baselineDate}.` : conf ? 'No baseline to compare with.' : 'Waiting for the capture.'}
            </Step>
            <Step n={4} title="Confirm" state={!conf ? 'todo' : conf.status === 'confirmed' ? 'done' : 'warn'}>
              {conf ? CONFIRM_LABEL[conf.status] : 'Waiting.'}
            </Step>
            <Step n={5} title="Notify" state={a.notifiedAt ? 'done' : conf ? 'todo' : 'todo'}>
              {a.notifiedAt ? `Sent ${when(a.notifiedAt)}.` : conf && conf.status !== 'confirmed' && a.severity !== 'emergency' ? 'Held: sent once confirmed, or at emergency.' : 'Waiting.'}
            </Step>
          </ol>
          {conf && (
            <ul className="mt-4 list-disc space-y-1.5 pl-6 text-base leading-relaxed">
              {conf.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {cap && cap.status !== 'captured' && cap.status !== 'pending' && <p className="mt-2 text-sm text-muted">{cap.note}</p>}
          {a.status !== 'resolved' && (
            <button className="btn btn-outline no-print mt-4" onClick={() => onCapture(a.id)} disabled={cap?.status === 'pending'}>
              {cap ? 'Run the check again' : 'Run the satellite check now'}
            </button>
          )}
        </>
      )}

      <h4 className="mt-10 text-xl font-bold">What the evidence shows</h4>
      {d.evidence.boardUrl ? (
        <figure className="mt-4">
          <img src={d.evidence.boardUrl} alt={`Before and after evidence for ${a.location} with the ${val(a.latestValue, a.unit)} reading`} className="w-full rounded-md bg-tint" />
          <figcaption className="mt-2 text-sm text-muted">
            One Cloudinary URL composes the before and after captures with the reading stamped on, from the original assets.
          </figcaption>
        </figure>
      ) : (
        <p className="mt-4 text-base text-muted">
          {d.evidence.assetCount === 0 ? 'No evidence has been uploaded for this site yet.' : 'A side-by-side board needs two image captures at this site.'}
        </p>
      )}

      <ul className="mt-5 list-disc space-y-2.5 pl-6 text-base leading-relaxed">
        {d.insights.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
      {d.nearbyEvents.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-md border border-line text-base">
          {d.nearbyEvents.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
              <a href={e.link} target="_blank" rel="noreferrer" className="font-bold text-brand hover:underline">{e.title}</a>
              <span className="text-muted">{e.category}, {e.km} km away, NASA EONET</span>
            </li>
          ))}
        </ul>
      )}
      {d.evidence.comparison?.caveats.length ? (
        <p className="mt-4 text-sm text-muted">Keep in mind: {d.evidence.comparison.caveats.join(' ')}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {d.evidence.compareLink && <Link to={d.evidence.compareLink} className="btn btn-outline">Open full before / after</Link>}
        <Link to="/report" className="btn btn-outline">Site report</Link>
        <Link to="/upload" className="btn btn-outline">Upload fresh evidence</Link>
      </div>

      {d.notifications.length > 0 && (
        <>
          <h4 className="mt-10 text-xl font-bold">Who was told</h4>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {d.notifications.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-3">
                  <Pill tone={n.status === 'sent' ? 'solid' : n.status === 'failed' ? 'mid' : 'outline'}>{n.status}</Pill>
                  <span className="text-base font-bold">{n.contactName}</span>
                  <span className="text-sm uppercase tracking-wider text-muted">{n.channel}</span>
                </span>
                <span className="text-sm text-muted">{n.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="mt-10 text-xl font-bold">Suggested response</h4>
      <ol className="mt-3 space-y-2.5 text-base">
        {d.actions.map((t, i) => (
          <li key={i} className="flex gap-4"><span className="numeral w-7 shrink-0 text-2xl text-brand">{i + 1}</span><span>{t}</span></li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">A starting checklist. Replace it with your own SOP before relying on it.</p>

      {hasCoords && (
        <>
          <h4 className="mt-10 text-xl font-bold">Where</h4>
          {/* OpenStreetMap embed: free, no API key. bbox is a small box around the site. */}
          <iframe
            title={`Map of ${a.location}`}
            className="mt-3 h-64 w-full rounded-md border border-line"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${a.lng! - 0.6},${a.lat! - 0.4},${a.lng! + 0.6},${a.lat! + 0.4}&layer=mapnik&marker=${a.lat},${a.lng}`}
          />
          <p className="mt-2 text-sm text-muted">Map data &copy; OpenStreetMap contributors.</p>
        </>
      )}

      <div className="no-print mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
        {a.status === 'open' && <button className="btn" onClick={() => onStatus(a.id, 'acknowledged')}>Acknowledge</button>}
        {a.status !== 'resolved' && <button className="btn btn-outline" onClick={() => onStatus(a.id, 'resolved')}>Mark resolved</button>}
        {a.status === 'resolved' && <button className="btn btn-outline" onClick={() => onStatus(a.id, 'open')}>Re-open</button>}
      </div>
    </article>
  )
}

/* ── Who is told ─────────────────────────────────────────────────────────── */

function ContactsPanel({
  data, sites, onChange,
}: {
  data: { contacts: Contact[]; channels: { email: boolean; ntfy: boolean } } | null
  sites: SitesResponse
  onChange: () => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState('')
  const [minSeverity, setMinSeverity] = useState<HazardSeverity>('warning')
  const [siteId, setSiteId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await signalsApi.addContact({ name, role, email, ntfyTopic: topic, minSeverity, locationIds: siteId ? [siteId] : [] })
      setName(''); setRole(''); setEmail(''); setTopic('')
      onChange()
    } catch (e2) {
      const text = e2 instanceof Error ? e2.message : 'Could not save'
      try { setErr((JSON.parse(text) as { error?: string }).error ?? text) } catch { setErr(text) }
    } finally {
      setSaving(false)
    }
  }

  const siteName = (id: string) => sites.sites.find((s) => s.locationId === id)?.name ?? 'a site'

  return (
    <Panel
      title="Who gets told"
      description="Responsible people are notified when an alert is confirmed by imagery, or reaches emergency (which should not wait for a satellite pass)."
    >
      <div className="grid gap-8 xl:grid-cols-2">
        <div>
          {data && data.contacts.length === 0 && <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-base text-muted">No one is set up yet. Add a contact so alerts reach a person.</p>}
          <ul className="divide-y divide-line rounded-md border border-line empty:hidden">
            {data?.contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-base font-bold">{c.name} <span className="font-normal text-muted">, {c.role}</span></p>
                  <p className="truncate text-sm text-muted">
                    {[c.email, c.ntfyTopic ? `ntfy: ${c.ntfyTopic}` : null].filter(Boolean).join('  ') || 'In-app record only'}
                    {'  '}From {c.minSeverity} up, {c.locationIds.length === 0 ? 'all sites' : c.locationIds.map(siteName).join(', ')}.
                  </p>
                </div>
                <button className="shrink-0 text-sm font-bold text-brand hover:underline" onClick={() => signalsApi.deleteContact(c.id).then(onChange).catch(() => {})}>Remove</button>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            <li><strong className="text-ink">Email:</strong> {data?.channels.email ? 'delivery is configured on the server.' : 'not configured, so messages are recorded but not sent. Set SMTP_HOST, SMTP_USER and SMTP_PASS on the server to send them.'}</li>
            <li><strong className="text-ink">Push (ntfy):</strong> free and needs no account. Install the ntfy app, subscribe to a topic name, and enter the same name here. Anyone who knows the topic can read it, so make it hard to guess.</li>
          </ul>
        </div>

        <form onSubmit={add} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-base font-bold">Name</span><input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Verma" /></label>
            <label className="block"><span className="mb-1.5 block text-base font-bold">Role</span><input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="District officer" /></label>
            <label className="block"><span className="mb-1.5 block text-base font-bold">Email <span className="font-normal text-muted">(optional)</span></span><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@agency.gov" /></label>
            <label className="block"><span className="mb-1.5 block text-base font-bold">ntfy topic <span className="font-normal text-muted">(optional)</span></span><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="visevi-kutch-7f3a9" /></label>
            <label className="block">
              <span className="mb-1.5 block text-base font-bold">Notify from</span>
              <select className="input" value={minSeverity} onChange={(e) => setMinSeverity(e.target.value as HazardSeverity)}>
                <option value="watch">Watch and above</option>
                <option value="warning">Warning and above</option>
                <option value="emergency">Emergency only</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-base font-bold">Site</span>
              <select className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">All sites</option>
                {sites.sites.map((s) => <option key={s.locationId} value={s.locationId}>{s.name}</option>)}
              </select>
            </label>
          </div>
          {err && <p className="text-base font-bold text-brand-dark" role="alert">{err}</p>}
          <button type="submit" className="btn" disabled={saving || !name.trim()}>{saving ? 'Saving...' : 'Add contact'}</button>
        </form>
      </div>
    </Panel>
  )
}

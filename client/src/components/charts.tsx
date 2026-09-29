import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Overview } from '../lib/api'

import { C, type Tip } from './chartTheme'

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const TXT = 16 // px, axis / label text
const TXT_LG = 17

type Status = 'VERIFIED' | 'UNVERIFIED' | 'FLAGGED'
const fillOf = (s: Status) => (s === 'VERIFIED' ? C.brand : s === 'UNVERIFIED' ? C.light : 'url(#hatch)')
const strokeOf = (s: Status) => (s === 'VERIFIED' ? C.brand : s === 'UNVERIFIED' ? C.brand : C.dark)
const statusName: Record<Status, string> = { VERIFIED: 'Verified', UNVERIFIED: 'Unverified', FLAGGED: 'Flagged' }

/* ── shared pieces ─────────────────────────────────────────────────────── */

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Only update on a real change (>1px): the SVG we render inside this element
    // must never be able to feed back into its own measurement.
    const apply = (px: number) => setW((cur) => (Math.abs(cur - px) > 1 ? px : cur))
    const ro = new ResizeObserver(([e]) => apply(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    apply(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function Defs() {
  return (
    <defs>
      <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="#fff" />
        <line x1="0" y1="0" x2="0" y2="7" stroke={C.dark} strokeWidth="3" />
      </pattern>
    </defs>
  )
}

export function Legend({ items }: { items: { label: string; kind: 'solid' | 'light' | 'hatch' }[] }) {
  return (
    <ul className="mb-4 flex flex-wrap gap-x-7 gap-y-2 text-base text-ink">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <svg width="20" height="20" aria-hidden="true">
            <Defs />
            <rect
              x="1" y="1" width="18" height="18"
              fill={i.kind === 'solid' ? C.brand : i.kind === 'light' ? C.light : 'url(#hatch)'}
              stroke={i.kind === 'hatch' ? C.dark : C.brand}
              strokeWidth="2"
            />
          </svg>
          {i.label}
        </li>
      ))}
    </ul>
  )
}

export function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none fixed z-[80] max-w-sm border-2 border-ink bg-white px-4 py-3 text-base shadow-lg"
      style={{ left: Math.min(tip.x + 16, window.innerWidth - 340), top: tip.y + 16 }}
    >
      <p className="font-bold text-ink">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l} className="text-muted">{l}</p>
      ))}
    </div>
  )
}

/** Round tick values. Counts of things are whole numbers, so those axes never step below 1. */
function niceTicks(max: number, target = 5, integer = true): number[] {
  if (max <= 0) return [0, 1]
  const raw = Math.max(max / target, integer ? 1 : 0)
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = 0; v <= Math.ceil(max / step) * step + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)
const charsFor = (px: number, size = TXT_LG) => Math.floor(px / (size * 0.56))

function BottomAxis({
  ticks, x, y, x0, x1, plotTop, format, title,
}: {
  ticks: number[]; x: (v: number) => number; y: number; x0: number; x1: number; plotTop: number
  format: (v: number) => string; title: string
}) {
  return (
    <g fontFamily={FONT}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={plotTop} y2={y} stroke={C.grid} />
          <text x={x(t)} y={y + 20} textAnchor="middle" fontSize={TXT} fill={C.muted}>{format(t)}</text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y} y2={y} stroke={C.ink} strokeWidth="1.5" />
      <text x={(x0 + x1) / 2} y={y + 46} textAnchor="middle" fontSize={TXT} fontWeight="700" fill={C.ink}>{title}</text>
    </g>
  )
}

/* ── 1. Capture timeline: one lane per project ────────────────────────── */

export function CaptureTimeline({ points, onTip }: { points: Overview['points']; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth()
  if (points.length === 0) return <div ref={ref} />

  const byProject = new Map<string, Overview['points']>()
  for (const p of points) byProject.set(p.project, [...(byProject.get(p.project) ?? []), p])
  const lanes = [...byProject.entries()]
    .map(([name, pts]) => ({ name, pts: [...pts].sort((a, b) => +new Date(a.date) - +new Date(b.date)) }))
    .sort((a, b) => +new Date(a.pts[0].date) - +new Date(b.pts[0].date))

  const times = points.map((p) => +new Date(p.date))
  let lo = Math.min(...times)
  let hi = Math.max(...times)
  const yearMs = 365.25 * 86_400_000
  if (hi - lo < yearMs) { lo -= yearMs / 2; hi += yearMs / 2 }
  const pad = (hi - lo) * 0.04
  lo -= pad; hi += pad

  const L = Math.min(300, W * 0.3)
  const R = 28
  const T = 12
  const laneH = 64
  const plotH = lanes.length * laneH
  const H = T + plotH + 64
  const x = (t: number) => L + ((t - lo) / (hi - lo)) * (W - L - R)

  const y0 = new Date(lo).getUTCFullYear()
  const y1 = new Date(hi).getUTCFullYear()
  const stepYears = [1, 2, 5, 10, 20, 25, 50].find((s) => (y1 - y0) / s <= Math.max(4, Math.floor((W - L) / 90))) ?? 50
  const yearTicks: number[] = []
  for (let yr = Math.ceil(y0 / stepYears) * stepYears; yr <= y1; yr += stepYears) yearTicks.push(yr)
  const yx = (yr: number) => x(Date.UTC(yr, 0, 1))

  return (
    <div ref={ref}>
      <svg width={W} height={H} className="block max-w-full" role="img" aria-label="Capture dates of evidence, one row per project" fontFamily={FONT}>
        <Defs />
        {lanes.map((lane, i) => {
          const cy = T + i * laneH + laneH / 2
          const first = +new Date(lane.pts[0].date)
          const last = +new Date(lane.pts[lane.pts.length - 1].date)
          return (
            <g key={lane.name}>
              {i % 2 === 0 && <rect x={0} y={T + i * laneH} width={W} height={laneH} fill="#fff5f5" />}
              <text x={L - 14} y={cy + 5} textAnchor="end" fontSize={TXT_LG} fontWeight="700" fill={C.ink}>
                {clip(lane.name, charsFor(L - 24))}
              </text>
              <line x1={x(first)} x2={x(last)} y1={cy} y2={cy} stroke={C.light} strokeWidth="4" />
            </g>
          )
        })}
        <BottomAxis
          ticks={yearTicks.map((yr) => yr)} x={(yr) => yx(yr)} y={T + plotH} x0={L} x1={W - R} plotTop={T}
          format={(v) => String(v)} title="Capture date (year)"
        />
        {lanes.map((lane, i) => {
          const cy = T + i * laneH + laneH / 2
          const placed: number[] = []
          return lane.pts.map((p) => {
            const px = x(+new Date(p.date))
            const near = placed.filter((q) => Math.abs(q - px) < 18).length
            placed.push(px)
            const dy = near === 0 ? 0 : (near % 2 ? -1 : 1) * Math.ceil(near / 2) * 11
            const s = p.status as Status
            return (
              <circle
                key={p.id} cx={px} cy={cy + dy} r={9}
                fill={fillOf(s)} stroke={strokeOf(s)} strokeWidth="2.5"
                onPointerMove={(e) =>
                  onTip({
                    x: e.clientX, y: e.clientY, title: lane.name,
                    lines: [
                      new Date(p.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
                      statusName[s],
                      ...(p.label ? [clip(p.label, 110)] : []),
                    ],
                  })
                }
                onPointerLeave={() => onTip(null)}
                style={{ cursor: 'default' }}
              />
            )
          })
        })}
      </svg>
    </div>
  )
}

/* ── 2. Assets by capture year, stacked by status ─────────────────────── */

export function AssetsByYear({ points, onTip }: { points: Overview['points']; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth()
  const byYear = new Map<number, Record<Status, number>>()
  for (const p of points) {
    const yr = new Date(p.date).getUTCFullYear()
    const row = byYear.get(yr) ?? { VERIFIED: 0, UNVERIFIED: 0, FLAGGED: 0 }
    row[p.status as Status]++
    byYear.set(yr, row)
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  if (years.length === 0) return <div ref={ref} />

  const totals = years.map((yr) => Object.values(byYear.get(yr)!).reduce((s, v) => s + v, 0))
  const ticks = niceTicks(Math.max(...totals), 5)
  const top = ticks[ticks.length - 1]
  const L = 72, R = 20, T = 30, B = 78
  const H = 400
  const plotW = W - L - R
  const plotH = H - T - B
  const slot = plotW / years.length
  const bw = Math.min(84, slot * 0.6)
  const y = (v: number) => T + plotH - (v / top) * plotH
  const every = slot < 52 ? Math.ceil(52 / slot) : 1

  return (
    <div ref={ref}>
      <svg width={W} height={H} className="block max-w-full" role="img" aria-label="Assets per capture year, stacked by verification status" fontFamily={FONT}>
        <Defs />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={L - 12} y={y(t) + 5} textAnchor="end" fontSize={TXT} fill={C.muted}>{t}</text>
          </g>
        ))}
        <text transform={`translate(18 ${T + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={TXT} fontWeight="700" fill={C.ink}>
          Assets (count)
        </text>
        {years.map((yr, i) => {
          const row = byYear.get(yr)!
          const cx = L + i * slot + slot / 2
          let acc = 0
          const total = totals[i]
          return (
            <g key={yr}>
              {(['VERIFIED', 'UNVERIFIED', 'FLAGGED'] as Status[]).map((s) => {
                const n = row[s]
                if (!n) return null
                const y1 = y(acc + n)
                const h = y(acc) - y1
                acc += n
                return (
                  <rect
                    key={s} x={cx - bw / 2} y={y1} width={bw} height={h}
                    fill={fillOf(s)} stroke={s === 'FLAGGED' ? C.dark : '#fff'} strokeWidth={s === 'FLAGGED' ? 2 : 2}
                  />
                )
              })}
              <text x={cx} y={y(total) - 9} textAnchor="middle" fontSize={TXT_LG} fontWeight="700" fill={C.ink}>{total}</text>
              {i % every === 0 && (
                <text x={cx} y={T + plotH + 24} textAnchor="middle" fontSize={TXT} fill={C.muted}>{yr}</text>
              )}
              <rect
                x={cx - slot / 2} y={T} width={slot} height={plotH + 30} fill="transparent"
                onPointerMove={(e) =>
                  onTip({
                    x: e.clientX, y: e.clientY, title: String(yr),
                    lines: [`${total} asset${total === 1 ? '' : 's'}`, `Verified ${row.VERIFIED}, unverified ${row.UNVERIFIED}, flagged ${row.FLAGGED}`],
                  })
                }
                onPointerLeave={() => onTip(null)}
              />
            </g>
          )
        })}
        <line x1={L} x2={W - R} y1={T + plotH} y2={T + plotH} stroke={C.ink} strokeWidth="1.5" />
        <text x={L + plotW / 2} y={H - 14} textAnchor="middle" fontSize={TXT} fontWeight="700" fill={C.ink}>
          Capture year (years with no evidence are not shown)
        </text>
      </svg>
    </div>
  )
}

/* ── shared horizontal-bar frame ──────────────────────────────────────── */

function hbarGeometry(W: number, rows: number, opts: { rowH?: number; leftFrac?: number; leftMax?: number; right?: number }) {
  const rowH = opts.rowH ?? 52
  const L = Math.min(opts.leftMax ?? 300, W * (opts.leftFrac ?? 0.32))
  const R = opts.right ?? 24
  const T = 8
  const plotH = rows * rowH
  return { rowH, L, R, T, plotH, H: T + plotH + 66, plotW: W - L - R }
}

/* ── 3. Verification status by project ────────────────────────────────── */

export function ProjectStatusBars({ data, onTip }: { data: Overview['perProject']; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth()
  const rows = [...data]
    .map((d) => ({ ...d, total: d.verified + d.unverified + d.flagged }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
  if (rows.length === 0) return <div ref={ref} />
  const right = W > 640 ? 170 : 70
  const g = hbarGeometry(W, rows.length, { right })
  const ticks = niceTicks(Math.max(...rows.map((r) => r.total)), 5)
  const x = (v: number) => g.L + (v / ticks[ticks.length - 1]) * g.plotW

  return (
    <div ref={ref}>
      <svg width={W} height={g.H} className="block max-w-full" role="img" aria-label="Verification status per project" fontFamily={FONT}>
        <Defs />
        <BottomAxis ticks={ticks} x={x} y={g.T + g.plotH} x0={g.L} x1={W - g.R} plotTop={g.T} format={String} title="Assets (count)" />
        {rows.map((r, i) => {
          const cy = g.T + i * g.rowH
          let acc = 0
          return (
            <g key={r.name}>
              <text x={g.L - 14} y={cy + g.rowH / 2 + 5} textAnchor="end" fontSize={TXT_LG} fontWeight="700" fill={C.ink}>
                {clip(r.name, charsFor(g.L - 24))}
              </text>
              {(['verified', 'unverified', 'flagged'] as const).map((k) => {
                const n = r[k]
                if (!n) return null
                const s = k.toUpperCase() as Status
                const x0 = x(acc)
                const w = x(acc + n) - x0
                acc += n
                return (
                  <rect
                    key={k} x={x0} y={cy + 9} width={Math.max(2, w)} height={g.rowH - 18}
                    fill={fillOf(s)} stroke={s === 'FLAGGED' ? C.dark : '#fff'} strokeWidth="2"
                    onPointerMove={(e) => onTip({ x: e.clientX, y: e.clientY, title: r.name, lines: [`${statusName[s]}: ${n}`, `Total: ${r.total}`] })}
                    onPointerLeave={() => onTip(null)}
                  />
                )
              })}
              <text x={x(r.total) + 10} y={cy + g.rowH / 2 + 5} fontSize={TXT_LG} fill={C.ink}>
                <tspan fontWeight="700">{r.total}</tspan>
                {W > 640 && <tspan fill={C.muted}> · {Math.round((r.verified / r.total) * 100)}% verified</tspan>}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── 4. Check outcomes ────────────────────────────────────────────────── */

export function CheckOutcomes({ data, onTip }: { data: Overview['checks']; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth()
  if (data.length === 0) return <div ref={ref} />
  const right = W > 640 ? 150 : 24
  const g = hbarGeometry(W, data.length, { rowH: 54, leftFrac: 0.34, leftMax: 320, right })
  const x = (pct: number) => g.L + (pct / 100) * g.plotW
  const seg = [
    { key: 'pass' as const, label: 'Passed', fill: C.brand, stroke: '#fff' },
    { key: 'fail' as const, label: 'Failed', fill: 'url(#hatch)', stroke: C.dark },
    { key: 'skipped' as const, label: 'Not enough data', fill: C.light, stroke: '#fff' },
  ]
  return (
    <div ref={ref}>
      <Legend items={[{ label: 'Passed', kind: 'solid' }, { label: 'Failed', kind: 'hatch' }, { label: 'Not enough data to judge', kind: 'light' }]} />
      <svg width={W} height={g.H} className="block max-w-full" role="img" aria-label="Outcome of each verification check" fontFamily={FONT}>
        <Defs />
        <BottomAxis ticks={[0, 25, 50, 75, 100]} x={x} y={g.T + g.plotH} x0={g.L} x1={W - g.R} plotTop={g.T} format={(v) => v + '%'} title="Share of assets" />
        {data.map((c, i) => {
          const cy = g.T + i * g.rowH
          const total = c.pass + c.fail + c.skipped || 1
          let acc = 0
          return (
            <g key={c.id}>
              <text x={g.L - 14} y={cy + g.rowH / 2 + 5} textAnchor="end" fontSize={TXT_LG} fontWeight="700" fill={C.ink}>
                {clip(c.label, charsFor(g.L - 24))}
              </text>
              {seg.map((s) => {
                const n = c[s.key]
                if (!n) return null
                const x0 = x((acc / total) * 100)
                const w = x(((acc + n) / total) * 100) - x0
                acc += n
                return (
                  <rect
                    key={s.key} x={x0} y={cy + 10} width={w} height={g.rowH - 20} fill={s.fill} stroke={s.stroke} strokeWidth="2"
                    onPointerMove={(e) => onTip({ x: e.clientX, y: e.clientY, title: c.label, lines: [`${s.label}: ${n} of ${total} (${Math.round((n / total) * 100)}%)`] })}
                    onPointerLeave={() => onTip(null)}
                  />
                )
              })}
              {W > 640 && (
                <text x={W - g.R + 12} y={cy + g.rowH / 2 + 5} fontSize={TXT} fill={C.muted}>
                  {c.pass} / {c.fail} / {c.skipped}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {W > 640 && <p className="mt-1 text-sm text-muted">Right-hand figures: passed / failed / not enough data.</p>}
    </div>
  )
}

/* ── 5. Themes ────────────────────────────────────────────────────────── */

export function ThemeBars({ data, onTip }: { data: Overview['themes']; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth()
  if (data.length === 0) return <div ref={ref} />
  const g = hbarGeometry(W, data.length, { rowH: 42, leftFrac: 0.4, leftMax: 300, right: 48 })
  const ticks = niceTicks(Math.max(...data.map((d) => d.count)), 5)
  const x = (v: number) => g.L + (v / ticks[ticks.length - 1]) * g.plotW
  return (
    <div ref={ref}>
      <svg width={W} height={g.H} className="block max-w-full" role="img" aria-label="Most frequent themes detected in the evidence" fontFamily={FONT}>
        <BottomAxis ticks={ticks} x={x} y={g.T + g.plotH} x0={g.L} x1={W - g.R} plotTop={g.T} format={String} title="Assets showing the theme" />
        {data.map((d, i) => {
          const cy = g.T + i * g.rowH
          return (
            <g key={d.name}>
              <text x={g.L - 14} y={cy + g.rowH / 2 + 5} textAnchor="end" fontSize={TXT_LG} fontWeight="700" fill={C.ink}>
                {clip(d.name, charsFor(g.L - 24))}
              </text>
              <rect
                x={g.L} y={cy + 8} width={x(d.count) - g.L} height={g.rowH - 16} fill={C.brand}
                onPointerMove={(e) => onTip({ x: e.clientX, y: e.clientY, title: d.name, lines: [`${d.count} asset${d.count === 1 ? '' : 's'} show this theme`] })}
                onPointerLeave={() => onTip(null)}
              />
              <text x={x(d.count) + 10} y={cy + g.rowH / 2 + 5} fontSize={TXT_LG} fontWeight="700" fill={C.ink}>{d.count}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ── 6. Indicator evidence scores ─────────────────────────────────────── */

export function IndicatorScores({ data, onTip }: { data: Overview['indicators']; onTip: (t: Tip) => void }) {
  const [ref, W] = useWidth()
  if (data.length === 0) return <div ref={ref} />
  const g = hbarGeometry(W, data.length, { rowH: 46, leftFrac: 0.42, leftMax: 400, right: 56 })
  const x = (pct: number) => g.L + (pct / 100) * g.plotW
  return (
    <div ref={ref}>
      <Legend items={[{ label: 'Asserted (score 50% or more)', kind: 'solid' }, { label: 'Needs review (below 50%)', kind: 'light' }]} />
      <svg width={W} height={g.H} className="block max-w-full" role="img" aria-label="SDG indicator evidence scores per project" fontFamily={FONT}>
        <BottomAxis ticks={[0, 25, 50, 75, 100]} x={x} y={g.T + g.plotH} x0={g.L} x1={W - g.R} plotTop={g.T} format={(v) => v + '%'} title="Evidence score" />
        <line x1={x(50)} x2={x(50)} y1={g.T} y2={g.T + g.plotH} stroke={C.dark} strokeWidth="2" strokeDasharray="6 5" />
        {data.map((d, i) => {
          const cy = g.T + i * g.rowH
          const pct = Math.round(d.confidence * 100)
          const asserted = d.status === 'asserted'
          return (
            <g key={d.project + d.code}>
              <text x={g.L - 14} y={cy + g.rowH / 2 + 5} textAnchor="end" fontSize={TXT_LG} fill={C.ink}>
                <tspan fontWeight="700">SDG {d.code}</tspan>
                <tspan fill={C.muted}> {clip(d.project, Math.max(6, charsFor(g.L - 24) - 9))}</tspan>
              </text>
              <rect
                x={g.L} y={cy + 9} width={Math.max(2, x(pct) - g.L)} height={g.rowH - 18}
                fill={asserted ? C.brand : C.light} stroke={C.brand} strokeWidth="2"
                onPointerMove={(e) =>
                  onTip({ x: e.clientX, y: e.clientY, title: `SDG ${d.code} · ${d.project}`, lines: [d.title, `Evidence score ${pct}%, ${d.backing} supporting asset${d.backing === 1 ? '' : 's'}`, asserted ? 'Asserted' : 'Needs review, not asserted'] })
                }
                onPointerLeave={() => onTip(null)}
              />
              <text x={x(pct) + 10} y={cy + g.rowH / 2 + 5} fontSize={TXT_LG} fontWeight="700" fill={C.ink}>{pct}%</text>
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-sm text-muted">Dashed line: the 50% threshold below which an indicator is shown for review, never asserted.</p>
    </div>
  )
}

/* ── small helper used by the analytics page ─────────────────────────── */

export function ChartPanel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="card card-accent min-w-0 p-7">
      <h3 className="text-2xl font-bold">{title}</h3>
      <p className="mb-6 mt-2 max-w-3xl text-lg leading-relaxed text-muted">{note}</p>
      {children}
    </section>
  )
}

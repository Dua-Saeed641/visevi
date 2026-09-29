import { useEffect, useState, type ReactNode } from 'react'
import { api, type Overview } from '../lib/api'

/*
 * Chart colours follow the dataviz palette rules: one categorical hue for
 * "count of things" (slot 1, dark-surface step), and the reserved status
 * colours only for verification state — each always paired with a text label.
 */
const C = {
  series: '#3987e5',
  good: '#0ca30c',
  neutral: '#6b6f80',
  critical: '#d03b3b',
  grid: 'rgba(255,255,255,0.07)',
  ink: '#e6e8ef',
  muted: '#8b8fa3',
}

type Tip = { x: number; y: number; title: string; lines: string[] } | null

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="mb-4 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
      {children}
    </section>
  )
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/** Rounded data-end on the right/top only, anchored square to the baseline. */
function roundedEnd(x: number, y: number, w: number, h: number, r: number, dir: 'right' | 'up') {
  r = Math.min(r, w / 2, h / 2)
  if (dir === 'right') return `M${x} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x}Z`
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`
}

function StatusBars({ data, tip }: { data: Overview['perProject']; tip: (t: Tip) => void }) {
  const rows = [...data].sort((a, b) => b.verified + b.unverified + b.flagged - (a.verified + a.unverified + a.flagged)).slice(0, 8)
  const max = Math.max(1, ...rows.map((r) => r.verified + r.unverified + r.flagged))
  const labelW = 150
  const barX = labelW + 8
  const barW = 430
  const rowH = 30
  const H = rows.length * rowH + 4
  const segs = [
    { key: 'verified', label: 'Verified', color: C.good },
    { key: 'unverified', label: 'Unverified', color: C.neutral },
    { key: 'flagged', label: 'Flagged', color: C.critical },
  ] as const

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[11px] text-[var(--color-text-muted)]">
        {segs.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.key === 'verified' ? '✓ ' : s.key === 'flagged' ? '⚠ ' : ''}
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${barX + barW + 40} ${H}`} className="w-full" role="img" aria-label="Verification status by project">
        {rows.map((r, i) => {
          const y = i * rowH + 4
          const total = r.verified + r.unverified + r.flagged
          let x = barX
          return (
            <g key={r.name}>
              <text x={labelW} y={y + 13} textAnchor="end" fontSize="12" fill={C.ink}>
                {r.name.length > 20 ? r.name.slice(0, 19) + '…' : r.name}
              </text>
              {segs.map((s, si) => {
                const n = r[s.key]
                if (!n) return null
                const w = Math.max(3, (n / max) * barW - 2) // 2px surface gap between segments
                const isLast = segs.slice(si + 1).every((t) => !r[t.key])
                const d = isLast
                  ? roundedEnd(x, y, w, 18, 4, 'right')
                  : `M${x} ${y}h${w}v18h${-w}Z`
                const seg = (
                  <path
                    key={s.key}
                    d={d}
                    fill={s.color}
                    onPointerMove={(e) => tip({ x: e.clientX, y: e.clientY, title: r.name, lines: [`${s.label}: ${n}`, `Total: ${total}`] })}
                    onPointerLeave={() => tip(null)}
                  />
                )
                x += w + 2
                return seg
              })}
              <text x={x + 6} y={y + 13} fontSize="12" fill={C.muted}>
                {total}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ThemeBars({ data, tip }: { data: Overview['themes']; tip: (t: Tip) => void }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const labelW = 190
  const barX = labelW + 8
  const barW = 380
  const rowH = 28
  return (
    <svg viewBox={`0 0 ${barX + barW + 40} ${data.length * rowH + 4}`} className="w-full" role="img" aria-label="Most frequent detected themes">
      {data.map((d, i) => {
        const y = i * rowH + 4
        const w = Math.max(4, (d.count / max) * barW)
        return (
          <g key={d.name}>
            <text x={labelW} y={y + 13} textAnchor="end" fontSize="12" fill={C.ink}>
              {d.name.length > 26 ? d.name.slice(0, 25) + '…' : d.name}
            </text>
            <path
              d={roundedEnd(barX, y, w, 16, 4, 'right')}
              fill={C.series}
              onPointerMove={(e) => tip({ x: e.clientX, y: e.clientY, title: d.name, lines: [`${d.count} asset${d.count === 1 ? '' : 's'} show this`] })}
              onPointerLeave={() => tip(null)}
            />
            <text x={barX + w + 6} y={y + 12} fontSize="12" fill={C.muted}>
              {d.count}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function MonthColumns({ data, tip }: { data: Overview['months']; tip: (t: Tip) => void }) {
  const W = 640
  const H = 210
  const padL = 30
  const padB = 26
  const padT = 10
  const max = Math.max(1, ...data.map((d) => d.count))
  const top = Math.max(2, Math.ceil(max / 2) * 2) // even axis top so ticks are whole numbers
  const plotW = W - padL - 8
  const plotH = H - padB - padT
  const slot = plotW / data.length
  const barW = Math.min(36, slot * 0.6)
  const ticks = [0, top / 2, top]
  const every = data.length > 12 ? 2 : 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evidence added per month">
      {ticks.map((t) => {
        const y = padT + plotH - (t / top) * plotH
        return (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y} y2={y} stroke={C.grid} />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill={C.muted}>{t}</text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const h = (d.count / top) * plotH
        const x = padL + i * slot + (slot - barW) / 2
        const y = padT + plotH - h
        return (
          <g key={d.month}>
            {/* generous invisible hit target, wider/taller than the mark */}
            <rect
              x={padL + i * slot} y={padT} width={slot} height={plotH + padB} fill="transparent"
              onPointerMove={(e) => tip({ x: e.clientX, y: e.clientY, title: monthLabel(d.month), lines: [`${d.count} asset${d.count === 1 ? '' : 's'} added`] })}
              onPointerLeave={() => tip(null)}
            />
            {d.count > 0 && <path d={roundedEnd(x, y, barW, h, 4, 'up')} fill={C.series} pointerEvents="none" />}
            {i % every === 0 && (
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={C.muted}>
                {monthLabel(d.month)}
              </text>
            )}
          </g>
        )
      })}
      <line x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} stroke={C.muted} opacity="0.5" />
    </svg>
  )
}

function DataTable({ o }: { o: Overview }) {
  const th = 'px-2 py-1 text-left font-medium text-[var(--color-text-muted)]'
  const td = 'px-2 py-1'
  return (
    <div className="grid gap-6 text-xs md:grid-cols-3">
      <table>
        <caption className="mb-1 text-left font-semibold">Verification by project</caption>
        <thead><tr><th className={th}>Project</th><th className={th}>✓</th><th className={th}>–</th><th className={th}>⚠</th></tr></thead>
        <tbody>{o.perProject.map((p) => (
          <tr key={p.name}><td className={td}>{p.name}</td><td className={td}>{p.verified}</td><td className={td}>{p.unverified}</td><td className={td}>{p.flagged}</td></tr>
        ))}</tbody>
      </table>
      <table>
        <caption className="mb-1 text-left font-semibold">Detected themes</caption>
        <thead><tr><th className={th}>Theme</th><th className={th}>Assets</th></tr></thead>
        <tbody>{o.themes.map((t) => <tr key={t.name}><td className={td}>{t.name}</td><td className={td}>{t.count}</td></tr>)}</tbody>
      </table>
      <table>
        <caption className="mb-1 text-left font-semibold">Added per month</caption>
        <thead><tr><th className={th}>Month</th><th className={th}>Assets</th></tr></thead>
        <tbody>{o.months.map((m) => <tr key={m.month}><td className={td}>{monthLabel(m.month)}</td><td className={td}>{m.count}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export function OverviewCharts() {
  const [data, setData] = useState<Overview | null>(null)
  const [failed, setFailed] = useState(false)
  const [tip, setTip] = useState<Tip>(null)
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    api.getOverview().then(setData).catch(() => setFailed(true))
  }, [])

  // Analytics are supplementary: if they can't load, the library below still works.
  if (failed || !data || data.totalAssets === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Library overview</h2>
        <button
          onClick={() => setAsTable((v) => !v)}
          className="cursor-pointer rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)] hover:text-white"
        >
          {asTable ? 'Show charts' : 'View as table'}
        </button>
      </div>

      {asTable ? (
        <Card title="Library overview" subtitle="Same data as the charts, as tables.">
          <DataTable o={data} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Verification status by project" subtitle="How much of each project's evidence has passed the checks.">
            <StatusBars data={data.perProject} tip={setTip} />
          </Card>
          <Card title="What the evidence shows" subtitle="Detected themes, by number of assets showing them.">
            <ThemeBars data={data.themes} tip={setTip} />
          </Card>
          <div className="lg:col-span-2">
            <Card title="Evidence added over time" subtitle="Assets per month, by capture date (upload date if none was given).">
              <MonthColumns data={data.months} tip={setTip} />
            </Card>
          </div>
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none fixed z-[70] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <p className="font-semibold text-[var(--color-text)]">{tip.title}</p>
          {tip.lines.map((l) => (
            <p key={l} className="text-[var(--color-text-muted)]">{l}</p>
          ))}
        </div>
      )}
    </div>
  )
}

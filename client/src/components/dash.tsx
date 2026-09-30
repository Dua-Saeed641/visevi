import type { ReactNode } from 'react'

/**
 * Dashboard building blocks, in the manner of shadcn/ui: quiet bordered cards,
 * small muted labels, large tabular numerals, restrained charts. Kept inside
 * the app's two-tone palette (red and white), so every chart tells its
 * categories apart by lightness AND by label or pattern, never by hue alone.
 */

import { TONE, type Tone } from './dashTheme'

const HATCH = `repeating-linear-gradient(45deg, #fff 0 3px, ${TONE.dark} 3px 5px)`
const fillStyle = (t: Tone | 'hatch') => (t === 'hatch' ? { backgroundImage: HATCH, boxShadow: `inset 0 0 0 1px ${TONE.dark}` } : { backgroundColor: TONE[t] })

/* ── Panel (Card) ─────────────────────────────────────────────────────────── */

export function Panel({
  title, description, action, children, className = '',
}: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(42,11,14,0.05)] ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-6 pt-5">
          <div className="min-w-0">
            {title && <h3 className="text-xl font-bold leading-tight">{title}</h3>}
            {description && <p className="mt-1 text-base leading-snug text-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-6 pb-6 pt-4">{children}</div>
    </section>
  )
}

/* ── KPI card ─────────────────────────────────────────────────────────────── */

export function Kpi({
  label, value, note, spark, badge,
}: { label: string; value: string | number; note?: string; spark?: number[]; badge?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-lg border border-line bg-white p-5 shadow-[0_1px_2px_rgba(42,11,14,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
        {badge}
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="numeral truncate text-5xl text-ink">{value}</p>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {note && <p className="mt-3 text-base leading-snug text-muted">{note}</p>}
    </div>
  )
}

export function Sparkline({ values, w = 96, h = 36 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...values)
  const step = w / (values.length - 1)
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <path d={`${line}L${w} ${h}L0 ${h}Z`} fill={TONE.pale} />
      <path d={line} fill="none" stroke={TONE.solid} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Pills ────────────────────────────────────────────────────────────────── */

export function Pill({ children, tone = 'pale' }: { children: ReactNode; tone?: 'solid' | 'mid' | 'pale' | 'outline' }) {
  const cls = {
    solid: 'bg-brand text-white border-brand',
    mid: 'bg-[#e8646c] text-white border-[#e8646c]',
    pale: 'bg-tint-2 text-brand-dark border-tint-2',
    outline: 'bg-white text-ink border-line',
  }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-bold ${cls}`}>{children}</span>
}

/* ── Bar list (horizontal bars, HTML so it is responsive and selectable) ─── */

export interface BarRow {
  key: string
  label: string
  value: number
  /** Extra text right of the value. */
  hint?: string
  tone?: Tone | 'hatch'
  /** Additional stacked segments (value, tone) drawn after the main one. */
  stack?: { value: number; tone: Tone | 'hatch'; label: string }[]
  onClick?: () => void
}

export function BarList({ rows, max, format = (v) => String(v), empty = 'Nothing to show yet.' }: { rows: BarRow[]; max?: number; format?: (v: number) => string; empty?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-base text-muted">{empty}</p>
  const top = max ?? Math.max(1, ...rows.map((r) => r.value + (r.stack?.reduce((s, x) => s + x.value, 0) ?? 0)))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const seg = [{ value: r.value, tone: r.tone ?? 'solid', label: r.label }, ...(r.stack ?? [])]
        const total = seg.reduce((s, x) => s + x.value, 0)
        const inner = (
          <>
            <span className="w-40 shrink-0 truncate text-base font-bold sm:w-52" title={r.label}>{r.label}</span>
            <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-sm bg-tint">
              <span className="absolute inset-y-0 left-0 flex" style={{ width: `${Math.min(100, (total / top) * 100)}%` }}>
                {seg.map((s, i) =>
                  s.value > 0 ? (
                    <span key={i} title={`${s.label}: ${format(s.value)}`} style={{ ...fillStyle(s.tone), width: `${(s.value / total) * 100}%` }} className="h-full" />
                  ) : null,
                )}
              </span>
            </span>
            <span className="w-14 shrink-0 text-right text-base font-bold tabular-nums">{format(total)}</span>
            {r.hint && <span className="hidden w-32 shrink-0 truncate text-sm text-muted lg:block" title={r.hint}>{r.hint}</span>}
          </>
        )
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button type="button" onClick={r.onClick} className="flex w-full cursor-pointer items-center gap-3 rounded-sm text-left hover:bg-tint">{inner}</button>
            ) : (
              <div className="flex items-center gap-3">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ── Diverging bars (values above and below a centre line) ────────────────── */

export function DivergingBars({ rows, unit }: { rows: { key: string; label: string; value: number | null }[]; unit: string }) {
  const known = rows.filter((r) => r.value !== null)
  if (known.length === 0) return <p className="py-6 text-center text-base text-muted">No readings yet.</p>
  const span = Math.max(4, ...known.map((r) => Math.abs(r.value as number)))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-base font-bold sm:w-52" title={r.label}>{r.label}</span>
          <span className="relative h-5 flex-1 rounded-sm bg-tint">
            <span className="absolute inset-y-0 left-1/2 w-px bg-ink/40" />
            {r.value !== null && (
              <span
                className="absolute inset-y-0 rounded-sm"
                style={{
                  ...(r.value >= 0 ? { left: '50%', width: `${(r.value / span) * 50}%`, backgroundColor: TONE.solid } : { right: '50%', width: `${(-r.value / span) * 50}%`, ...fillStyle('hatch') }),
                }}
                title={`${r.value > 0 ? '+' : ''}${r.value.toFixed(1)} ${unit}`}
              />
            )}
          </span>
          <span className="w-20 shrink-0 text-right text-base font-bold tabular-nums">{r.value === null ? 'n/a' : `${r.value > 0 ? '+' : ''}${r.value.toFixed(1)}`}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── Stacked columns (e.g. alerts per week) ───────────────────────────────── */

export function StackedColumns({
  columns, series, height = 180,
}: {
  columns: { key: string; label: string; values: number[] }[]
  series: { label: string; tone: Tone | 'hatch' }[]
  height?: number
}) {
  const totals = columns.map((c) => c.values.reduce((s, v) => s + v, 0))
  const top = Math.max(1, ...totals)
  if (totals.every((t) => t === 0)) return <p className="py-10 text-center text-base text-muted">No alerts in this period.</p>
  const ticks = [top, Math.round(top / 2), 0].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <div>
      <div className="flex gap-3" style={{ height }}>
        <div className="flex w-7 flex-col justify-between text-right text-sm tabular-nums text-muted" aria-hidden="true">
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="relative flex flex-1 items-end gap-[3px] border-b border-l border-line">
          {columns.map((c, i) => (
            <div key={c.key} className="flex h-full flex-1 flex-col-reverse" title={`${c.label}: ${totals[i]} alert${totals[i] === 1 ? '' : 's'}`}>
              {c.values.map((v, k) => (v > 0 ? <span key={k} style={{ ...fillStyle(series[k].tone), height: `${(v / top) * 100}%` }} className="w-full" /> : null))}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-10 mt-1 flex justify-between text-sm text-muted">
        <span>{columns[0]?.label}</span>
        <span>{columns[columns.length - 1]?.label}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 rounded-sm" style={fillStyle(s.tone)} />{s.label}</li>
        ))}
      </ul>
    </div>
  )
}

/* ── Donut ────────────────────────────────────────────────────────────────── */

export function Donut({
  slices, centre, sub,
}: { slices: { label: string; value: number; tone: Tone | 'hatch' }[]; centre: string; sub: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const R = 54
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0" role="img" aria-label={`${centre} ${sub}`}>
        <defs>
          <pattern id="donut-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#fff" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={TONE.dark} strokeWidth="2.5" />
          </pattern>
        </defs>
        <circle cx="70" cy="70" r={R} fill="none" stroke={TONE.pale} strokeWidth="18" />
        {total > 0 &&
          slices.map((s) => {
            if (s.value <= 0) return null
            const len = (s.value / total) * C
            const el = (
              <circle
                key={s.label} cx="70" cy="70" r={R} fill="none"
                stroke={s.tone === 'hatch' ? 'url(#donut-hatch)' : TONE[s.tone]} strokeWidth="18"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc}
                transform="rotate(-90 70 70)"
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            )
            acc += len
            return el
          })}
        <text x="70" y="70" textAnchor="middle" fontSize="26" fontWeight="700" fill={TONE.ink} fontFamily="Helvetica, Arial, sans-serif">{centre}</text>
        <text x="70" y="90" textAnchor="middle" fontSize="11" fill="#7a5257" fontFamily="Helvetica, Arial, sans-serif">{sub}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2 text-base">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 rounded-sm" style={fillStyle(s.tone)} />{s.label}</span>
            <span className="font-bold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Gauge (risk index) ───────────────────────────────────────────────────── */

export function Gauge({ score, level, confidence }: { score: number; level: string; confidence?: number }) {
  const R = 78
  const arc = Math.PI * R
  const a = (score / 100) * Math.PI
  const px = 100 - R * Math.cos(a)
  const py = 100 - R * Math.sin(a)
  return (
    <div className="text-center">
      <svg viewBox="0 0 200 118" className="mx-auto w-full max-w-[16rem]" role="img" aria-label={`Risk index ${score} of 100, ${level}`}>
        <path d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`} fill="none" stroke={TONE.pale} strokeWidth="16" strokeLinecap="round" />
        <path d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`} fill="none" stroke={TONE.solid} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(score / 100) * arc} ${arc}`} />
        <circle cx={px} cy={py} r="7" fill="#fff" stroke={TONE.ink} strokeWidth="3" />
        <text x="100" y="92" textAnchor="middle" fontSize="40" fontWeight="700" fill={TONE.ink} fontFamily="Helvetica, Arial, sans-serif">{score}</text>
      </svg>
      <p className="-mt-2 text-xl font-bold">{level} risk</p>
      {confidence !== undefined && <p className="text-base text-muted">Confidence {confidence}%</p>}
    </div>
  )
}

/* ── Small meter ──────────────────────────────────────────────────────────── */

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div role="img" aria-label={`${label} ${Math.round(value * 100)} percent`} className="h-1.5 w-full overflow-hidden rounded-full bg-tint-2">
      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

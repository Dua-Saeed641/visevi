/**
 * Verification status, encoded three ways so it never depends on hue alone:
 * a distinct glyph (tick / dash / cross), a distinct fill (solid / light /
 * hatched) and the word itself.
 */
const config = {
  VERIFIED: { label: 'Verified', box: 'bg-brand border-brand text-white', glyph: 'M4 9l3.5 3.5L14 5.5' },
  UNVERIFIED: { label: 'Unverified', box: 'bg-tint-2 border-brand/40 text-brand', glyph: 'M4.5 9h9' },
  FLAGGED: { label: 'Flagged', box: 'bg-white border-brand-dark text-brand-dark', glyph: 'M5 5l8 8M13 5l-8 8' },
} as const

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const c = config[status as keyof typeof config] ?? config.UNVERIFIED
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-bold text-ink ${className}`}>
      <span className={`inline-flex h-5 w-5 items-center justify-center border-2 ${c.box}`}>
        <svg viewBox="0 0 18 18" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square">
          <path d={c.glyph} />
        </svg>
      </span>
      {c.label}
    </span>
  )
}

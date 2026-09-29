const styles: Record<string, string> = {
  VERIFIED:
    'bg-[var(--color-accent-green)]/15 text-[var(--color-accent-green)] border border-[var(--color-accent-green)]/30',
  FLAGGED:
    'bg-[var(--color-accent-red)]/15 text-[var(--color-accent-red)] border border-[var(--color-accent-red)]/30',
  UNVERIFIED: 'bg-[var(--color-border)] text-[var(--color-text-muted)] border border-transparent',
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${styles[status] ?? styles.UNVERIFIED} ${className}`}
    >
      {status}
    </span>
  )
}

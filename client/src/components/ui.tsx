import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-12 flex flex-col gap-6 border-b-2 border-ink pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-5xl font-bold">{title}</h1>
        {children && <p className="mt-4 text-xl leading-relaxed text-muted">{children}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-14">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        {note && <p className="text-base text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-8 border-l-4 border-brand px-5 py-4 text-lg ${tone === 'error' ? 'bg-tint-2 text-brand-dark' : 'bg-tint text-ink'}`}
    >
      {children}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-2 border-dashed border-line px-8 py-20 text-center">
      <p className="text-2xl font-bold">{title}</p>
      {children && <p className="mt-2 text-lg text-muted">{children}</p>}
    </div>
  )
}

export function Loading({ children }: { children: ReactNode }) {
  return <p className="py-24 text-center text-lg text-muted">{children}</p>
}

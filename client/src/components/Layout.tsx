import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/compare', label: 'Before/After' },
  { to: '/report', label: 'Impact Report' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/graph', label: 'Evidence Graph' },
  { to: '/upload', label: 'Upload' },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-sans antialiased">
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-[var(--color-accent-cyan)] shadow-[0_0_10px_var(--color-accent-cyan)]" />
            <span className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
              VisEvi<span className="text-[var(--color-accent-green)]">.</span>
            </span>
            <span className="rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] font-mono">
              v1.0
            </span>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm font-medium">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive
                    ? 'text-[var(--color-accent-cyan)] border-b-2 border-[var(--color-accent-cyan)] pb-1 transition-all font-semibold'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors pb-1'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="spectrum-bar" />
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">
        VisEvi AI-Powered Impact & Sustainability Media Platform • Cloudinary Integration
      </footer>
    </div>
  )
}

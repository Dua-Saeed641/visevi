import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

const groups = [
  {
    title: 'Respond',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/watch', label: 'Disaster watch' },
    ],
  },
  {
    title: 'Evidence',
    items: [
      { to: '/library', label: 'Evidence library' },
      { to: '/timeline', label: 'Timeline' },
      { to: '/graph', label: 'Evidence graph' },
      { to: '/compare', label: 'Before / after' },
      { to: '/report', label: 'Site report' },
    ],
  },
  { title: 'Add', items: [{ to: '/upload', label: 'Upload evidence' }] },
]

function Brand() {
  return (
    <Link to="/" aria-label="VisEvi home" className="flex items-center gap-3 text-3xl font-bold tracking-tight text-ink">
      <img src="/logo-red.png" alt="" className="h-9 w-auto" />
      <span className="wordmark">VisEvi<span className="text-brand">.</span></span>
    </Link>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main">
      {groups.map((g) => (
        <div key={g.title} className="mb-8">
          <p className="eyebrow mb-3">{g.title}</p>
          <ul>
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `block border-l-4 py-2.5 pl-4 text-lg font-bold transition-colors ${
                      isActive
                        ? 'border-brand bg-tint text-brand'
                        : 'border-transparent text-ink hover:border-line hover:text-brand'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r-2 border-ink bg-paper px-7 py-8 lg:flex">
        <Brand />
        <p className="mb-10 mt-2 text-base text-muted">Disaster signals, verified</p>
        <NavList />
        <div className="mt-auto border-t border-line pt-5 text-base text-muted">
          <Link to="/" className="font-bold text-ink hover:text-brand">
            About the project
          </Link>
          <p className="mt-2">Built on Cloudinary AI Vision.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b-2 border-ink bg-paper px-5 py-4 lg:hidden">
        <Brand />
        <button className="btn btn-outline" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav">
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="border-b-2 border-ink bg-paper px-5 py-6 lg:hidden">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
      )}

      <main className="px-6 py-10 sm:px-10 lg:ml-64 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-[96rem]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

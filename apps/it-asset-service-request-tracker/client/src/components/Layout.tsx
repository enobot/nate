import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useActor } from '../context/actor'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/assets', label: 'Assets' },
  { to: '/network', label: 'Network' },
  { to: '/requests', label: 'Service requests' },
  { to: '/reports', label: 'Reports' },
  { to: '/directory', label: 'People & locations' },
  { to: '/about', label: 'About this demo' },
]

function ActorPicker() {
  const { technicians, actor, setActorId, loading } = useActor()
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="actor-select" className="text-slate-400">
        Working as
      </label>
      <select
        id="actor-select"
        className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 focus:outline-2 focus:outline-sky-400"
        value={actor?.id ?? ''}
        disabled={loading || technicians.length === 0}
        onChange={(e) => setActorId(Number(e.target.value))}
      >
        {technicians.length === 0 && <option value="">No technicians</option>}
        {technicians.map((t) => (
          <option key={t.id} value={t.id}>
            {t.fullName}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-sky-500 focus:px-3 focus:py-2 focus:text-slate-950">
        Skip to main content
      </a>

      <aside className="border-b border-slate-800 bg-slate-900/80 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Alder Creek College</p>
            <p className="text-sm font-semibold text-slate-100">IT Asset &amp; Service Tracker</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
        </div>
        <nav id="main-nav" aria-label="Main" className={`${menuOpen ? 'block' : 'hidden'} px-2 pb-4 lg:block`}>
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-sky-500/15 text-sky-300' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-6 px-3 text-xs leading-relaxed text-slate-500">
            Fictional demo organization. All names, rooms and devices are invented.
          </p>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
          <ActorPicker />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

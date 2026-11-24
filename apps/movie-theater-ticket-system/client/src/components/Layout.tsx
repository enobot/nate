import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useCart } from '../state/cart';
import { HoldTimer } from './HoldTimer';

const NAV = [
  { to: '/', label: 'Now Showing', end: true },
  { to: '/orders', label: 'My Orders', end: false },
  { to: '/about', label: 'About', end: false },
  { to: '/admin', label: 'Admin', end: false },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'
  }`;
}

export function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label="Movie Theater Ticket System, home">
      <svg viewBox="0 0 64 64" className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-6" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#16161f" />
        <path d="M14 22a4 4 0 0 0 4-4h28a4 4 0 0 0 4 4v20a4 4 0 0 0-4 4H18a4 4 0 0 0-4-4z" fill="#fbbf3a" />
        <path d="M38 20v24" stroke="#16161f" strokeWidth="2.5" strokeDasharray="3 3" />
        <circle cx="26" cy="32" r="5" fill="#16161f" />
      </svg>
      <span className="leading-none">
        <span className="block font-display text-lg font-bold tracking-wide text-white uppercase">Movie Theater</span>
        <span className="block text-[0.65rem] font-semibold tracking-[0.3em] text-marquee-400 uppercase">Ticket System</span>
      </span>
    </Link>
  );
}

function CartButton() {
  const cart = useCart();
  const count = cart.holds.length;
  return (
    <Link
      to="/cart"
      className="relative inline-flex items-center gap-2 rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm font-semibold text-white hover:bg-ink-700"
      aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? 'seat' : 'seats'} held` : 'Cart, empty'}
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 5.5a1.5 1.5 0 0 0 1.5-1.5h11A1.5 1.5 0 0 0 17 5.5v9a1.5 1.5 0 0 0-1.5 1.5h-11A1.5 1.5 0 0 0 3 14.5z" />
        <path d="M12.5 4v12" strokeDasharray="1.5 1.8" />
      </svg>
      <span>Cart</span>
      {count > 0 && (
        <span className="rounded-full bg-marquee-400 px-1.5 text-xs font-bold text-ink-950" aria-hidden>
          {count}
        </span>
      )}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const cart = useCart();
  const [lastPath, setLastPath] = useState(location.pathname);

  // Close the mobile menu after navigating (adjusting state during render, as React recommends).
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMenuOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-marquee-400 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {cart.holds.length > 0 && (
              <span className="hidden sm:inline-flex">
                <HoldTimer compact />
              </span>
            )}
            <CartButton />
            <button
              type="button"
              className="btn btn-ghost px-2 md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {menuOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-white/5 px-4 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-2">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 outline-none sm:px-6 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-white/5 bg-ink-950/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-ink-400 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl">
            An expanded portfolio rebuild, as a web application, of Nathanael Haig&apos;s academic C# desktop project. This is not
            the original coursework submission. All movies are fictional and every payment is simulated.
          </p>
          <p className="text-ink-500">© 2026 Nathanael Haig and Tracy Tran · MIT License</p>
        </div>
      </footer>
    </div>
  );
}

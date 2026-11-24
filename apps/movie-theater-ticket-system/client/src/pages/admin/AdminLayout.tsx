import { useCallback, useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ApiError, api } from '../../api/client';
import type { AdminUser } from '../../api/types';
import { Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useNow';
import { useToast } from '../../state/toast';

async function loadUser(): Promise<AdminUser | null> {
  try {
    return await api.admin.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/movies', label: 'Movies', end: false },
  { to: '/admin/screenings', label: 'Screenings', end: false },
  { to: '/admin/reservations', label: 'Reservations', end: false },
];

/**
 * Wraps every admin page. The server is the real gatekeeper (every /api/admin endpoint
 * requires the auth cookie); this component only decides whether to show the sign-in form.
 */
export function AdminLayout() {
  const session = useApi('admin-session', () => loadUser());
  const { notify } = useToast();
  const { setData } = session;

  const signedIn = useCallback((user: AdminUser) => setData(() => user), [setData]);

  const signOut = async () => {
    try {
      await api.admin.logout();
    } finally {
      setData(() => null);
      notify('Signed out of the admin dashboard.', 'info');
    }
  };

  if (session.error) {
    return <p role="alert" className="text-velvet-400">{session.error.message}</p>;
  }
  if (session.data === undefined) return <Spinner label="Checking admin session" />;
  if (session.data === null) return <AdminLogin onSignedIn={signedIn} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <nav aria-label="Admin" className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-marquee-400 text-ink-950' : 'text-ink-300 hover:bg-white/5 hover:text-white'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm text-ink-400">
          <span>
            Signed in as <strong className="text-ink-200">{session.data.username}</strong>
          </span>
          <button type="button" className="btn btn-secondary py-1.5 text-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

export function AdminLogin({ onSignedIn }: { onSignedIn: (user: AdminUser) => void }) {
  useDocumentTitle('Admin sign in');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter the demo admin username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.admin.login(username.trim(), password));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <form noValidate onSubmit={onSubmit} className="card space-y-5 p-6 motion-safe:animate-fade-up" aria-labelledby="admin-login-heading">
        <div>
          <p className="mb-2 text-xs font-bold tracking-[0.25em] text-marquee-400 uppercase">Admin</p>
          <h1 id="admin-login-heading" className="font-display text-3xl font-bold text-white">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            This is a local demo account set in the server&apos;s configuration. See the README for the development credentials and how to change
            them.
          </p>
        </div>
        <div>
          <label htmlFor="admin-username" className="field-label">
            Username
          </label>
          <input id="admin-username" className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label htmlFor="admin-password" className="field-label">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-velvet-400">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

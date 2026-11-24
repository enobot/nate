import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-ink-300">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-600 border-t-marquee-400 motion-reduce:animate-none" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorPanel({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 border-velvet-500/40 p-6">
      <p className="font-semibold text-rose-200">Something went wrong</p>
      <p className="text-sm text-ink-300">{error.message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="font-display text-2xl font-bold text-ink-100">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-300">{children}</div>}
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'gold' | 'green' | 'red' | 'blue';

const TONES: Record<Tone, string> = {
  neutral: 'border-ink-500 bg-ink-800 text-ink-200',
  gold: 'border-marquee-500/50 bg-marquee-500/10 text-marquee-300',
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  red: 'border-velvet-500/50 bg-velvet-500/10 text-velvet-400',
  blue: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 motion-safe:animate-fade-up">
      {eyebrow && <p className="mb-2 text-xs font-bold tracking-[0.25em] text-marquee-400 uppercase">{eyebrow}</p>}
      <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-ink-300">{children}</div>}
    </header>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-6 inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

/** The label shown everywhere money changes hands. */
export function SimulatedPaymentNotice() {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
      <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-none" aria-hidden fill="currentColor">
        <path d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm.9 12.6H9.1V9h1.8v5.1Zm0-6.6H9.1V5.7h1.8v1.8Z" />
      </svg>
      <p>
        <strong>Simulated checkout — no real payment is processed.</strong> This is a portfolio demo. It never asks for card
        details and no money moves.
      </p>
    </div>
  );
}

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { ApiError } from '../api/client'

// ---------- Layout pieces ----------

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatCard({ label, value, sublabel, tone = 'slate' }: { label: string; value: ReactNode; sublabel?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
    </div>
  )
}

// ---------- Buttons and badges ----------

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:bg-sky-500/50',
  secondary: 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-600/50',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50',
}

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed ${sizing} ${VARIANT[variant]} ${className}`}
      {...props}
    />
  )
}

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet'

const TONE_BADGE: Record<Tone, string> = {
  green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  blue: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  red: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  slate: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  violet: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
}

const TONE_TEXT: Record<Tone, string> = {
  green: 'text-emerald-300',
  blue: 'text-sky-300',
  amber: 'text-amber-300',
  red: 'text-rose-300',
  slate: 'text-slate-50',
  violet: 'text-violet-300',
}

const TONE_BAR: Record<Tone, string> = {
  green: 'bg-emerald-400',
  blue: 'bg-sky-400',
  amber: 'bg-amber-400',
  red: 'bg-rose-400',
  slate: 'bg-slate-400',
  violet: 'bg-violet-400',
}

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_BADGE[tone]}`}>{children}</span>
}

// ---------- Feedback ----------

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400 motion-reduce:animate-none" aria-hidden="true" />
      {label}...
    </div>
  )
}

export function ErrorAlert({ error, onRetry }: { error: ApiError | string; onRetry?: () => void }) {
  const message = typeof error === 'string' ? error : error.summary
  const title = typeof error === 'string' ? 'Something went wrong' : error.status === 409 ? 'Conflict' : error.status === 404 ? 'Not found' : error.title
  return (
    <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
      <p className="font-medium">{title}</p>
      <p className="mt-0.5">{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Notice({ message }: { message: string | null }) {
  // Always rendered so screen readers pick up changes to the live region.
  return (
    <div role="status" aria-live="polite" className={message ? 'mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200' : 'sr-only'}>
      {message}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">{children}</p>
}

// ---------- Form fields ----------

interface FieldShell {
  label: string
  error?: string
  hint?: string
  required?: boolean
}

function useFieldIds(error?: string, hint?: string) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return { id, describedBy, hintId: `${id}-hint`, errorId: `${id}-error` }
}

const INPUT =
  'mt-1 block w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-2 focus:outline-offset-0 focus:outline-sky-400 disabled:opacity-60'

function FieldLabel({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-300">
      {label}
      {required && (
        <span className="text-rose-400" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </label>
  )
}

function FieldMessages({ hint, hintId, error, errorId }: { hint?: string; hintId: string; error?: string; errorId: string }) {
  return (
    <>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      )}
    </>
  )
}

export function TextField({ label, error, hint, required, className = '', ...input }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const { id, describedBy, hintId, errorId } = useFieldIds(error, hint)
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={`${INPUT} ${error ? 'border-rose-500' : 'border-slate-700'}`}
        {...input}
      />
      <FieldMessages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  )
}

export function SelectField({ label, error, hint, required, className = '', children, ...select }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const { id, describedBy, hintId, errorId } = useFieldIds(error, hint)
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={`${INPUT} ${error ? 'border-rose-500' : 'border-slate-700'}`}
        {...select}
      >
        {children}
      </select>
      <FieldMessages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  )
}

export function TextAreaField({ label, error, hint, required, className = '', ...area }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { id, describedBy, hintId, errorId } = useFieldIds(error, hint)
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className={`${INPUT} min-h-24 ${error ? 'border-rose-500' : 'border-slate-700'}`}
        {...area}
      />
      <FieldMessages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  )
}

/** Lists every invalid field at the top of a form. role="alert" makes screen readers announce it. */
export function ErrorSummary({ errors, labels }: { errors: Record<string, string>; labels: Record<string, string> }) {
  const entries = Object.entries(errors)
  if (entries.length === 0) return null
  return (
    <div role="alert" className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
      <p className="font-medium">Please fix {entries.length === 1 ? 'this problem' : `these ${entries.length} problems`}:</p>
      <ul className="mt-1 list-inside list-disc">
        {entries.map(([field, message]) => (
          <li key={field}>
            {labels[field] ? `${labels[field]}: ` : ''}
            {message}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Data display ----------

export function BarList({ rows, emptyText = 'No data yet.' }: { rows: { label: string; value: number; tone?: Tone; hint?: string }[]; emptyText?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-slate-300">{row.label}</span>
            <span className="tabular-nums font-medium text-slate-100">
              {row.value.toLocaleString()}
              {row.hint && <span className="ml-1 text-xs font-normal text-slate-500">{row.hint}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-800" aria-hidden="true">
            <div className={`h-2 rounded-full ${TONE_BAR[row.tone ?? 'blue']}`} style={{ width: max === 0 ? '0%' : `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Pagination({ page, totalPages, totalCount, onPage }: { page: number; totalPages: number; totalCount: number; onPage: (page: number) => void }) {
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
      <span>
        {totalCount.toLocaleString()} result{totalCount === 1 ? '' : 's'}
        {totalPages > 1 && ` - page ${page} of ${totalPages}`}
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </nav>
  )
}

export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export const th = 'whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400'
export const td = 'whitespace-nowrap px-3 py-2.5 text-slate-200'

// ---------- Dialog ----------

/**
 * Modal built on the native <dialog> element, which provides focus trapping, Escape to close
 * and an inert background in modern browsers.
 */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/70"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
              Close
            </Button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  pending?: boolean
  error?: ApiError
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className="text-sm text-slate-300">{message}</div>
      {error && (
        <div className="mt-3">
          <ErrorAlert error={error} />
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? 'Working...' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}

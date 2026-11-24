import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../../api/client';
import type { AdminScreening, ScreeningInput } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Badge, ErrorPanel, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useNow';
import { addDays, formatDay, formatTime, todayKey } from '../../lib/format';
import { useToast } from '../../state/toast';

interface FormState {
  movieId: string;
  auditoriumId: string;
  /** Value of a datetime-local input: "2026-12-01T19:30" (theater-local time). */
  startsAtLocal: string;
}

function ScreeningForm({ editing, onSaved, onCancel }: { editing: AdminScreening | null; onSaved: () => void; onCancel: () => void }) {
  const movies = useApi('admin-movies', () => api.admin.movies());
  const auditoriums = useApi('admin-auditoriums', () => api.admin.auditoriums());
  const [form, setForm] = useState<FormState>({
    movieId: editing ? String(editing.movieId) : '',
    auditoriumId: editing ? String(editing.auditoriumId) : '',
    startsAtLocal: editing ? editing.startsAtLocal.slice(0, 16) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.movieId || !form.auditoriumId || !form.startsAtLocal) {
      setError('Choose a movie, an auditorium, and a start time.');
      return;
    }
    const input: ScreeningInput = {
      movieId: Number(form.movieId),
      auditoriumId: Number(form.auditoriumId),
      startsAtLocal: form.startsAtLocal.length === 16 ? `${form.startsAtLocal}:00` : form.startsAtLocal,
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) await api.admin.updateScreening(editing.id, input);
      else await api.admin.createScreening(input);
      onSaved();
    } catch (e) {
      // 409 here usually means the auditorium is already booked at that time.
      setError(e instanceof ApiError ? e.message : 'Could not save the screening.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6" aria-labelledby="screening-form-heading">
      <h2 id="screening-form-heading" className="font-display text-2xl font-bold text-white">
        {editing ? 'Move screening' : 'Schedule a screening'}
      </h2>
      <p className="text-sm text-ink-400">
        Times are theater-local. Screenings in the same auditorium can&apos;t overlap, including a cleaning break after each movie. Matinee
        pricing is applied automatically to early shows.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="screening-movie" className="field-label">Movie</label>
          <select id="screening-movie" className="field" value={form.movieId} onChange={(e) => setForm((f) => ({ ...f, movieId: e.target.value }))}>
            <option value="">Choose…</option>
            {(movies.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.runtimeMinutes} min){m.isActive ? '' : ' [hidden]'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="screening-auditorium" className="field-label">Auditorium</label>
          <select id="screening-auditorium" className="field" value={form.auditoriumId} onChange={(e) => setForm((f) => ({ ...f, auditoriumId: e.target.value }))}>
            <option value="">Choose…</option>
            {(auditoriums.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.capacity} seats)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="screening-start" className="field-label">Starts at</label>
          <input id="screening-start" type="datetime-local" className="field" value={form.startsAtLocal} onChange={(e) => setForm((f) => ({ ...f, startsAtLocal: e.target.value }))} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-velvet-400">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save new time' : 'Add screening'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AdminScreeningsPage() {
  useDocumentTitle('Manage screenings');
  const { notify } = useToast();
  const today = todayKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const valid = from <= to;
  const screenings = useApi(valid ? `admin-screenings:${from}:${to}` : null, () => api.admin.screenings(from, to));
  const [form, setForm] = useState<{ editing: AdminScreening | null; key: number } | null>(null);
  const [toDelete, setToDelete] = useState<AdminScreening | null>(null);
  const [deleting, setDeleting] = useState(false);

  const saved = () => {
    notify(form?.editing ? 'Screening moved.' : 'Screening added.', 'success');
    setForm(null);
    screenings.reload();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.admin.deleteScreening(toDelete.id);
      notify('Screening deleted.', 'success');
      screenings.reload();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not delete the screening.', 'error');
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Screenings">
        Schedule, move, or delete screenings. Screenings that already have orders are locked so customers&apos; tickets stay valid.
      </PageHeader>

      {form ? (
        <ScreeningForm key={form.key} editing={form.editing} onSaved={saved} onCancel={() => setForm(null)} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setForm({ editing: null, key: Date.now() })}>
          Schedule a screening
        </button>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="screenings-from" className="field-label">From</label>
          <input id="screenings-from" type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="screenings-to" className="field-label">To</label>
          <input id="screenings-to" type="date" className="field" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {screenings.error && <ErrorPanel error={screenings.error} onRetry={screenings.reload} />}
      {!screenings.data && !screenings.error && valid && <Spinner label="Loading screenings" />}
      {screenings.data && (
        <div className={`card overflow-x-auto ${screenings.loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">Screenings</caption>
            <thead className="border-b border-white/5 text-left text-xs text-ink-400 uppercase">
              <tr>
                <th scope="col" className="p-4">When</th>
                <th scope="col" className="p-4">Movie</th>
                <th scope="col" className="p-4">Auditorium</th>
                <th scope="col" className="p-4">Sold</th>
                <th scope="col" className="p-4">Status</th>
                <th scope="col" className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {screenings.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-ink-400">No screenings in this date range.</td>
                </tr>
              )}
              {screenings.data.map((s) => {
                const locked = s.hasOrders || s.seatsHeld > 0 || s.hasStarted;
                return (
                  <tr key={s.id}>
                    <td className="p-4 whitespace-nowrap text-ink-100">
                      {formatDay(s.startsAtLocal)} · {formatTime(s.startsAtLocal)}
                      <span className="block text-xs text-ink-500">ends {formatTime(s.endsAtLocal)}</span>
                    </td>
                    <td className="p-4 text-white">{s.movieTitle}</td>
                    <td className="p-4 text-ink-300">{s.auditoriumName}</td>
                    <td className="p-4 text-ink-300 tabular-nums">
                      {s.ticketsSold} / {s.capacity}
                      {s.seatsHeld > 0 && <span className="block text-xs text-marquee-300">{s.seatsHeld} held now</span>}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {s.isMatinee && <Badge tone="green">Matinee</Badge>}
                        {s.hasStarted && <Badge>Started</Badge>}
                        {s.hasOrders && <Badge tone="gold">Has orders</Badge>}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary px-3 py-1.5 text-xs"
                          disabled={locked}
                          title={locked ? 'Screenings with orders, current holds, or that have started cannot be changed.' : undefined}
                          onClick={() => setForm({ editing: s, key: Date.now() })}
                        >
                          Move{' '}<span className="sr-only">{s.movieTitle} at {formatTime(s.startsAtLocal)}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-3 py-1.5 text-xs text-velvet-400"
                          disabled={s.hasOrders}
                          onClick={() => setToDelete(s)}
                        >
                          Delete{' '}<span className="sr-only">{s.movieTitle} at {formatTime(s.startsAtLocal)}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={toDelete !== null} title="Delete this screening?" confirmLabel="Delete screening" busy={deleting} onConfirm={confirmDelete} onCancel={() => setToDelete(null)}>
        {toDelete && (
          <p>
            {toDelete.movieTitle} in {toDelete.auditoriumName} on {formatDay(toDelete.startsAtLocal)} at {formatTime(toDelete.startsAtLocal)} will be removed.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../../api/client';
import type { AdminMovie, MovieInput } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MOTIFS, PALETTES, PosterArt } from '../../components/PosterArt';
import { Badge, ErrorPanel, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useNow';
import { formatRuntime } from '../../lib/format';
import { useToast } from '../../state/toast';

const RATINGS = ['G', 'PG', 'PG-13', 'R'];

const BLANK: MovieInput = {
  title: '',
  tagline: '',
  synopsis: '',
  genre: '',
  rating: 'PG-13',
  runtimeMinutes: 110,
  posterPalette: 'violet',
  posterMotif: 'orbit',
  isActive: true,
};

type Errors = Partial<Record<keyof MovieInput, string>>;

export function validateMovie(input: MovieInput): Errors {
  const errors: Errors = {};
  if (!input.title.trim()) errors.title = 'Enter a title.';
  else if (input.title.trim().length > 120) errors.title = 'Titles can be up to 120 characters.';
  if (input.tagline.length > 160) errors.tagline = 'Taglines can be up to 160 characters.';
  if (input.synopsis.trim().length < 10) errors.synopsis = 'Write a synopsis of at least 10 characters.';
  else if (input.synopsis.length > 1200) errors.synopsis = 'Synopses can be up to 1200 characters.';
  if (input.genre.trim().length < 2) errors.genre = 'Enter a genre.';
  if (!Number.isInteger(input.runtimeMinutes) || input.runtimeMinutes < 30 || input.runtimeMinutes > 240) {
    errors.runtimeMinutes = 'Runtime must be a whole number from 30 to 240 minutes.';
  }
  return errors;
}

/** Server field names are PascalCase ("RuntimeMinutes"); map them onto the form's keys. */
function serverErrors(error: ApiError): Errors {
  const result: Errors = {};
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const field = (key.charAt(0).toLowerCase() + key.slice(1)) as keyof MovieInput;
    result[field] = messages[0];
  }
  return result;
}

function toInput(movie: AdminMovie): MovieInput {
  const { title, tagline, synopsis, genre, rating, runtimeMinutes, posterPalette, posterMotif, isActive } = movie;
  return { title, tagline, synopsis, genre, rating, runtimeMinutes, posterPalette, posterMotif, isActive };
}

function MovieForm({
  initial,
  editingId,
  onSaved,
  onCancel,
}: {
  initial: MovieInput;
  editingId: number | null;
  onSaved: (movie: AdminMovie) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState<MovieInput>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof MovieInput>(key: K, value: MovieInput[K]) => setInput((i) => ({ ...i, [key]: value }));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateMovie(input);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = editingId === null ? await api.admin.createMovie(input) : await api.admin.updateMovie(editingId, input);
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(serverErrors(error));
        setFailure(error.message);
      } else {
        setFailure('Could not save the movie.');
      }
    } finally {
      setSaving(false);
    }
  };

  const describedBy = (key: keyof MovieInput) => (errors[key] ? `movie-${key}-error` : undefined);
  const errorText = (key: keyof MovieInput) =>
    errors[key] && (
      <p id={`movie-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    );

  return (
    <form noValidate onSubmit={onSubmit} className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_12rem]" aria-labelledby="movie-form-heading">
      <div className="space-y-4">
        <h2 id="movie-form-heading" className="font-display text-2xl font-bold text-white">
          {editingId === null ? 'Add a movie' : 'Edit movie'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="movie-title" className="field-label">Title</label>
            <input id="movie-title" className="field" value={input.title} onChange={(e) => set('title', e.target.value)} aria-invalid={!!errors.title || undefined} aria-describedby={describedBy('title')} />
            {errorText('title')}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="movie-tagline" className="field-label">Tagline (optional)</label>
            <input id="movie-tagline" className="field" value={input.tagline} onChange={(e) => set('tagline', e.target.value)} aria-invalid={!!errors.tagline || undefined} aria-describedby={describedBy('tagline')} />
            {errorText('tagline')}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="movie-synopsis" className="field-label">Synopsis</label>
            <textarea id="movie-synopsis" rows={4} className="field" value={input.synopsis} onChange={(e) => set('synopsis', e.target.value)} aria-invalid={!!errors.synopsis || undefined} aria-describedby={describedBy('synopsis')} />
            {errorText('synopsis')}
          </div>
          <div>
            <label htmlFor="movie-genre" className="field-label">Genre</label>
            <input id="movie-genre" className="field" value={input.genre} onChange={(e) => set('genre', e.target.value)} aria-invalid={!!errors.genre || undefined} aria-describedby={describedBy('genre')} />
            {errorText('genre')}
          </div>
          <div>
            <label htmlFor="movie-runtime" className="field-label">Runtime (minutes)</label>
            <input
              id="movie-runtime"
              type="number"
              min={30}
              max={240}
              className="field"
              value={Number.isNaN(input.runtimeMinutes) ? '' : input.runtimeMinutes}
              onChange={(e) => set('runtimeMinutes', e.target.value === '' ? Number.NaN : Number(e.target.value))}
              aria-invalid={!!errors.runtimeMinutes || undefined}
              aria-describedby={describedBy('runtimeMinutes')}
            />
            {errorText('runtimeMinutes')}
          </div>
          <div>
            <label htmlFor="movie-rating" className="field-label">Rating</label>
            <select id="movie-rating" className="field" value={input.rating} onChange={(e) => set('rating', e.target.value)}>
              {RATINGS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-ink-200">
              <input type="checkbox" className="h-4 w-4 accent-marquee-400" checked={input.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              Showing to customers
            </label>
          </div>
          <div>
            <label htmlFor="movie-palette" className="field-label">Poster colors</label>
            <select id="movie-palette" className="field" value={input.posterPalette} onChange={(e) => set('posterPalette', e.target.value)}>
              {Object.keys(PALETTES).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="movie-motif" className="field-label">Poster design</label>
            <select id="movie-motif" className="field" value={input.posterMotif} onChange={(e) => set('posterMotif', e.target.value)}>
              {MOTIFS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        {failure && <p role="alert" className="text-sm text-velvet-400">{failure}</p>}
        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId === null ? 'Add movie' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
      <div>
        <p className="field-label">Preview</p>
        <PosterArt title={input.title || 'Untitled'} palette={input.posterPalette} motif={input.posterMotif} rating={input.rating} />
      </div>
    </form>
  );
}

export function AdminMoviesPage() {
  useDocumentTitle('Manage movies');
  const movies = useApi('admin-movies', () => api.admin.movies());
  const { notify } = useToast();
  const [editing, setEditing] = useState<{ id: number | null; initial: MovieInput; key: number } | null>(null);
  const [toDelete, setToDelete] = useState<AdminMovie | null>(null);
  const [deleting, setDeleting] = useState(false);

  const saved = (movie: AdminMovie) => {
    notify(`Saved "${movie.title}".`, 'success');
    setEditing(null);
    movies.reload();
  };

  const toggleActive = async (movie: AdminMovie) => {
    try {
      await api.admin.updateMovie(movie.id, { ...toInput(movie), isActive: !movie.isActive });
      notify(movie.isActive ? `"${movie.title}" is now hidden from customers.` : `"${movie.title}" is showing again.`, 'success');
      movies.reload();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not update the movie.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.admin.deleteMovie(toDelete.id);
      notify(`Deleted "${toDelete.title}".`, 'success');
      movies.reload();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not delete the movie.', 'error');
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Movies">
        Add, edit, hide, or delete movies. A movie with screenings can be hidden but not deleted.
      </PageHeader>

      {editing ? (
        <MovieForm key={editing.key} initial={editing.initial} editingId={editing.id} onSaved={saved} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: null, initial: BLANK, key: Date.now() })}>
          Add movie
        </button>
      )}

      {movies.error && <ErrorPanel error={movies.error} onRetry={movies.reload} />}
      {!movies.data && !movies.error && <Spinner label="Loading movies" />}
      {movies.data && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Movies</caption>
            <thead className="border-b border-white/5 text-left text-xs text-ink-400 uppercase">
              <tr>
                <th scope="col" className="p-4">Movie</th>
                <th scope="col" className="p-4">Details</th>
                <th scope="col" className="p-4">Screenings</th>
                <th scope="col" className="p-4">Status</th>
                <th scope="col" className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {movies.data.map((m) => (
                <tr key={m.id}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 flex-none">
                        <PosterArt title={m.title} palette={m.posterPalette} motif={m.posterMotif} showTitle={false} />
                      </div>
                      <span className="font-semibold text-white">{m.title}</span>
                    </div>
                  </td>
                  <td className="p-4 text-ink-300">
                    {m.rating} · {m.genre} · {formatRuntime(m.runtimeMinutes)}
                  </td>
                  <td className="p-4 text-ink-300 tabular-nums">
                    {m.upcomingScreenings} upcoming / {m.totalScreenings} total
                  </td>
                  <td className="p-4">{m.isActive ? <Badge tone="green">Showing</Badge> : <Badge>Hidden</Badge>}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing({ id: m.id, initial: toInput(m), key: Date.now() })}>
                        Edit{' '}<span className="sr-only">{m.title}</span>
                      </button>
                      <button type="button" className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => toggleActive(m)}>
                        {m.isActive ? 'Hide' : 'Show'}{' '}<span className="sr-only">{m.title}</span>
                      </button>
                      <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs text-velvet-400" onClick={() => setToDelete(m)}>
                        Delete{' '}<span className="sr-only">{m.title}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={toDelete !== null} title="Delete this movie?" confirmLabel="Delete movie" busy={deleting} onConfirm={confirmDelete} onCancel={() => setToDelete(null)}>
        {toDelete && (
          <p>
            &quot;{toDelete.title}&quot; will be removed permanently. Movies with screenings can&apos;t be deleted; hide them instead.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

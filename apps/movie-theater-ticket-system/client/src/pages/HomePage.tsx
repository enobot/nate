import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client';
import type { MovieShowtimes, Showtime } from '../api/types';
import { PosterArt } from '../components/PosterArt';
import { EmptyState, ErrorPanel } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useDocumentTitle } from '../hooks/useNow';
import { formatMonthDay, formatRuntime, formatTime, formatWeekday } from '../lib/format';

export function ShowtimeChip({ showtime }: { showtime: Showtime }) {
  const soldOut = showtime.seatsAvailable === 0;
  const low = !soldOut && showtime.seatsAvailable <= Math.max(5, Math.round(showtime.capacity * 0.15));
  return (
    <Link
      to={`/screenings/${showtime.id}`}
      className={`group flex flex-col rounded-xl border px-3 py-2 text-left transition-all duration-150 hover:-translate-y-0.5 ${
        soldOut
          ? 'border-ink-700 bg-ink-850 text-ink-400'
          : 'border-white/10 bg-ink-800 hover:border-marquee-400/70 hover:bg-ink-700 hover:shadow-[0_10px_30px_-15px_rgba(251,191,58,0.6)]'
      }`}
      aria-label={`${formatTime(showtime.startsAtLocal)} in ${showtime.auditoriumName}${showtime.isMatinee ? ', matinee' : ''}, ${
        soldOut ? 'sold out' : `${showtime.seatsAvailable} seats left`
      }`}
    >
      <span className="font-display text-lg font-bold text-white tabular-nums">{formatTime(showtime.startsAtLocal)}</span>
      <span className="text-[0.7rem] text-ink-400">
        {showtime.auditoriumName.replace('Auditorium', 'Aud.')}
        {showtime.isMatinee && <span className="ml-1 font-semibold text-emerald-300">· Matinee</span>}
      </span>
      <span className={`text-[0.7rem] ${soldOut ? 'text-velvet-400' : low ? 'text-marquee-300' : 'text-ink-400'}`}>
        {soldOut ? 'Sold out' : `${showtime.seatsAvailable} left`}
      </span>
    </Link>
  );
}

function MovieRow({ entry, index }: { entry: MovieShowtimes; index: number }) {
  const { movie, showtimes } = entry;
  return (
    <li
      className="card grid gap-5 p-4 motion-safe:animate-fade-up sm:grid-cols-[9rem_1fr] sm:p-5"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <Link to={`/movies/${movie.id}`} className="block w-28 sm:w-36" tabIndex={-1} aria-hidden>
        <PosterArt title={movie.title} palette={movie.posterPalette} motif={movie.posterMotif} rating={movie.rating} className="transition-transform duration-300 hover:scale-[1.03]" />
      </Link>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 className="font-display text-2xl font-bold text-white">
            <Link to={`/movies/${movie.id}`} className="hover:text-marquee-300">
              {movie.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-ink-300">
            <span className="rounded border border-ink-500 px-1 text-xs font-bold text-ink-200">{movie.rating}</span>
            <span className="mx-2 text-ink-500">·</span>
            {movie.genre}
            <span className="mx-2 text-ink-500">·</span>
            {formatRuntime(movie.runtimeMinutes)}
          </p>
          {movie.tagline && <p className="mt-2 text-sm text-ink-300 italic">{movie.tagline}</p>}
        </div>
        <ul className="flex flex-wrap gap-2" aria-label={`Showtimes for ${movie.title}`}>
          {showtimes.map((s) => (
            <li key={s.id}>
              <ShowtimeChip showtime={s} />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function HomePage() {
  useDocumentTitle('Now Showing');
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const [genre, setGenre] = useState<string>('All');
  const showtimes = useApi(`showtimes:${date ?? 'today'}`, (signal) => api.showtimes(date, signal));
  const data = showtimes.data;

  const genres = useMemo(() => ['All', ...new Set((data?.movies ?? []).map((m) => m.movie.genre))].sort((a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b))), [data]);
  const visible = (data?.movies ?? []).filter((m) => genre === 'All' || m.movie.genre === genre);
  const featured = data?.movies[0];
  const selectedDate = data?.date;
  // With no date in the URL the server opens on the first day that still has showtimes.
  const skippedToday = !date && data !== undefined && data.date !== data.dates[0];

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-velvet-950 via-ink-900 to-ink-950 p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-marquee-400/10 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div className="motion-safe:animate-fade-up">
            <p className="mb-3 text-xs font-bold tracking-[0.3em] text-marquee-400 uppercase">Now showing</p>
            <h1 className="font-display text-4xl leading-tight font-bold text-white sm:text-6xl">Pick a movie. Pick your seats.</h1>
            <p className="mt-4 max-w-xl text-ink-300">
              Browse a week of showtimes, choose seats on a live seat map, add snacks, and check out with a simulated payment.
              Seats you pick are held for you while you shop.
            </p>
          </div>
          {featured && (
            <Link to={`/movies/${featured.movie.id}`} className="hidden w-40 rotate-2 transition-transform duration-500 hover:rotate-0 md:block" aria-label={`Featured: ${featured.movie.title}`}>
              <PosterArt title={featured.movie.title} palette={featured.movie.posterPalette} motif={featured.movie.posterMotif} rating={featured.movie.rating} />
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="schedule-heading" className="space-y-5">
        <h2 id="schedule-heading" className="sr-only">
          Schedule
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a date">
          {(data?.dates ?? []).map((d, i) => {
            const active = d === selectedDate;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                onClick={() => setParams({ date: d })}
                className={`flex min-w-[4.5rem] flex-col items-center rounded-xl border px-3 py-2 transition-colors ${
                  active ? 'border-marquee-400 bg-marquee-400 text-ink-950' : 'border-white/10 bg-ink-850 text-ink-200 hover:bg-ink-700'
                }`}
              >
                <span className="text-[0.7rem] font-bold tracking-wider uppercase">{i === 0 ? 'Today' : formatWeekday(d)}</span>
                <span className="font-display text-lg font-bold">{formatMonthDay(d)}</span>
              </button>
            );
          })}
        </div>

        {genres.length > 2 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by genre">
            {genres.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={genre === g}
                onClick={() => setGenre(g)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  genre === g ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-ink-300 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {skippedToday && data && (
          <p role="note" className="text-sm text-ink-300">
            Today&apos;s showtimes have all started, so the next day with showtimes ({formatWeekday(data.date)}, {formatMonthDay(data.date)}) is
            shown. Pick Today above to see today&apos;s schedule.
          </p>
        )}

        {showtimes.error && <ErrorPanel error={showtimes.error} onRetry={showtimes.reload} />}

        {!data && !showtimes.error && (
          <div className="space-y-4" role="status" aria-label="Loading showtimes">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-44" />
            ))}
          </div>
        )}

        {data && visible.length === 0 && (
          <EmptyState title="No more showtimes on this day">
            {genre !== 'All' ? 'Try another genre, or pick a different date above.' : 'Pick a different date above to see more showtimes.'}
          </EmptyState>
        )}

        {data && visible.length > 0 && (
          <ul className={`space-y-4 ${showtimes.loading ? 'opacity-60' : ''}`} aria-busy={showtimes.loading || undefined}>
            {visible.map((entry, i) => (
              <MovieRow key={entry.movie.id} entry={entry} index={i} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

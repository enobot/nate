import { useParams } from 'react-router';
import { api } from '../api/client';
import type { Showtime } from '../api/types';
import { PosterArt } from '../components/PosterArt';
import { BackLink, EmptyState, ErrorPanel, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useDocumentTitle } from '../hooks/useNow';
import { formatLongDay, formatRuntime, localDateKey } from '../lib/format';
import { ShowtimeChip } from './HomePage';

export function MovieDetailPage() {
  const id = Number(useParams().movieId);
  const movie = useApi(Number.isFinite(id) ? `movie:${id}` : null, (signal) => api.movie(id, signal));
  useDocumentTitle(movie.data?.movie.title ?? 'Movie');

  if (movie.error) return <ErrorPanel error={movie.error} onRetry={movie.reload} />;
  if (!movie.data) return <Spinner label="Loading movie" />;

  const { movie: m, showtimes } = movie.data;
  const byDay = new Map<string, Showtime[]>();
  for (const s of showtimes) {
    const key = localDateKey(s.startsAtLocal);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  return (
    <div>
      <BackLink to="/">All showtimes</BackLink>
      <div className="grid gap-10 md:grid-cols-[18rem_1fr]">
        <div className="mx-auto w-56 motion-safe:animate-fade-up md:w-full">
          <PosterArt title={m.title} palette={m.posterPalette} motif={m.posterMotif} rating={m.rating} decorative={false} />
        </div>
        <div className="space-y-8">
          <header className="motion-safe:animate-fade-up">
            <p className="mb-2 text-xs font-bold tracking-[0.25em] text-marquee-400 uppercase">{m.genre}</p>
            <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">{m.title}</h1>
            <p className="mt-3 text-sm text-ink-300">
              <span className="rounded border border-ink-500 px-1 text-xs font-bold text-ink-200">{m.rating}</span>
              <span className="mx-2 text-ink-500">·</span>
              {formatRuntime(m.runtimeMinutes)}
            </p>
            {m.tagline && <p className="mt-4 text-lg text-ink-200 italic">{m.tagline}</p>}
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-300">{m.synopsis}</p>
            <p className="mt-3 text-xs text-ink-500">Fictional movie created for this demo.</p>
          </header>

          <section aria-labelledby="times-heading" className="space-y-5">
            <h2 id="times-heading" className="font-display text-2xl font-bold text-white">
              Showtimes this week
            </h2>
            {byDay.size === 0 && <EmptyState title="No upcoming showtimes">Check back later.</EmptyState>}
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-semibold text-ink-200">{formatLongDay(day)}</h3>
                <ul className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <li key={s.id}>
                      <ShowtimeChip showtime={s} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

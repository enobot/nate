import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, api } from '../api/client';
import type { ScreeningDetail, SeatChange } from '../api/types';
import { HoldTimer } from '../components/HoldTimer';
import { PosterArt } from '../components/PosterArt';
import { SeatLegend, SeatMap, type SeatView } from '../components/SeatMap';
import { BackLink, ErrorPanel, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useDocumentTitle } from '../hooks/useNow';
import { useSeatUpdates, type LiveStatus } from '../hooks/useSeatUpdates';
import { formatCents, formatDayTime, formatRuntime, pluralize } from '../lib/format';
import { useCart } from '../state/cart';
import { useToast } from '../state/toast';

const LIVE_TEXT: Record<LiveStatus, { text: string; dot: string }> = {
  connecting: { text: 'Connecting to live updates…', dot: 'bg-ink-400' },
  live: { text: 'Live: seats update as others book', dot: 'bg-emerald-400' },
  reconnecting: { text: 'Reconnecting… refreshing every 15 seconds', dot: 'bg-marquee-400' },
  offline: { text: 'Live updates unavailable, refreshing every 15 seconds', dot: 'bg-velvet-500' },
};

function applyChanges(detail: ScreeningDetail | undefined, changes: SeatChange[]): ScreeningDetail | undefined {
  if (!detail) return detail;
  const byId = new Map(changes.map((c) => [c.seatId, c.status]));
  return { ...detail, seats: detail.seats.map((s) => (byId.has(s.id) ? { ...s, status: byId.get(s.id)! } : s)) };
}

export function SeatSelectionPage() {
  const screeningId = Number(useParams().screeningId);
  const valid = Number.isInteger(screeningId) && screeningId > 0;
  const detail = useApi(valid ? `screening:${screeningId}` : null, (signal) => api.screening(screeningId, signal));
  const pricing = useApi('pricing', (signal) => api.pricing(signal));
  const cart = useCart();
  const { notify } = useToast();
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [switching, setSwitching] = useState(false);

  useDocumentTitle(detail.data ? `Seats for ${detail.data.movie.title}` : 'Choose seats');

  const { setData, reload } = detail;
  const live = useSeatUpdates(
    valid ? screeningId : null,
    useCallback((changes: SeatChange[]) => setData((d) => applyChanges(d, changes)), [setData]),
    reload,
  );

  const inCart = cart.screeningId === screeningId;
  const otherScreeningInCart = cart.holds.length > 0 && cart.screeningId !== null && !inCart;
  const mine = useMemo(() => new Set(inCart ? cart.holds.map((h) => h.seatId) : []), [cart.holds, inCart]);

  const seats: SeatView[] = useMemo(
    () =>
      (detail.data?.seats ?? []).map((s) => ({
        ...s,
        // A seat this cart holds shows as "Selected"; the server reports it as Held for everyone else.
        status: mine.has(s.id) ? 'Selected' : s.status,
      })),
    [detail.data, mine],
  );

  const toggle = async (seat: SeatView) => {
    if (pending.has(seat.id)) return;
    setPending((p) => new Set(p).add(seat.id));
    try {
      if (seat.status === 'Selected') {
        await cart.releaseSeat(seat.id);
        setData((d) => applyChanges(d, [{ seatId: seat.id, status: 'Available' }]));
      } else {
        await cart.holdSeat(screeningId, seat.id);
        setData((d) => applyChanges(d, [{ seatId: seat.id, status: 'Held' }]));
      }
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not update that seat. Please try again.', 'error');
      if (error instanceof ApiError && error.status === 409) {
        reload();
      }
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(seat.id);
        return next;
      });
    }
  };

  const startHere = async () => {
    setSwitching(true);
    try {
      await cart.clear();
      reload();
      notify('Released the seats from your other showtime. Choose seats here.', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not release those seats.', 'error');
    } finally {
      setSwitching(false);
    }
  };

  if (!valid) return <ErrorPanel error={new Error('That showtime link is not valid.')} />;
  if (detail.error && !detail.data) return <ErrorPanel error={detail.error} onRetry={reload} />;
  if (!detail.data) return <Spinner label="Loading seat map" />;

  const { movie, screening, auditorium, salesOpen } = detail.data;
  const selected = cart.holds.filter(() => inCart);
  const available = seats.filter((s) => s.status === 'Available').length;
  const premiumNote = pricing.data ? `+${formatCents(pricing.data.premiumSurchargeCents)}` : undefined;

  return (
    <div>
      <BackLink to={`/movies/${movie.id}`}>{movie.title}</BackLink>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="seat-heading" className="card min-w-0 p-4 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 id="seat-heading" className="font-display text-3xl font-bold text-white">
                Choose your seats
              </h1>
              <p className="mt-1 text-sm text-ink-300">
                {auditorium.name} · {formatDayTime(screening.startsAtLocal)}
                {screening.isMatinee && <span className="ml-2 font-semibold text-emerald-300">Matinee pricing</span>}
              </p>
            </div>
            <p className="flex items-center gap-2 text-xs text-ink-300" role="status">
              <span className={`h-2 w-2 rounded-full ${LIVE_TEXT[live].dot} ${live === 'live' ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
              {LIVE_TEXT[live].text}
            </p>
          </div>

          {!salesOpen && (
            <p role="alert" className="mb-6 rounded-xl border border-velvet-500/40 bg-velvet-500/10 px-4 py-3 text-sm text-rose-100">
              Ticket sales for this showtime are closed.
            </p>
          )}

          {otherScreeningInCart && salesOpen && (
            <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marquee-500/40 bg-marquee-500/10 px-4 py-3 text-sm text-marquee-300">
              <p>Your cart already has seats for a different showtime. One order covers one showtime.</p>
              <div className="flex gap-2">
                <Link to="/cart" className="btn btn-secondary py-1.5">
                  View cart
                </Link>
                <button type="button" className="btn btn-primary py-1.5" onClick={startHere} disabled={switching}>
                  {switching ? 'Releasing…' : 'Release them and pick here'}
                </button>
              </div>
            </div>
          )}

          <SeatMap layout={auditorium} seats={seats} pendingSeatIds={pending} interactive={salesOpen && !otherScreeningInCart} onToggle={toggle} />

          <div className="mt-6 border-t border-white/5 pt-4">
            <SeatLegend premiumNote={premiumNote} />
            <p className="mt-3 text-xs text-ink-400">
              {pluralize(available, 'seat')} available. Use the arrow keys to move between seats and Enter or Space to select.
            </p>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Your selection">
          <div className="card flex gap-4 p-4">
            <div className="w-20 flex-none">
              <PosterArt title={movie.title} palette={movie.posterPalette} motif={movie.posterMotif} showTitle={false} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xl font-bold text-white">{movie.title}</p>
              <p className="text-xs text-ink-400">
                {movie.rating} · {formatRuntime(movie.runtimeMinutes)}
              </p>
              <p className="mt-2 text-sm text-ink-200">{formatDayTime(screening.startsAtLocal)}</p>
            </div>
          </div>

          <div className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">Your seats</h2>
              <HoldTimer compact />
            </div>
            {selected.length === 0 ? (
              <p className="text-sm text-ink-400">No seats selected yet. Tap a seat on the map to hold it.</p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label="Selected seats">
                {selected.map((h) => (
                  <li key={h.seatId} className="rounded-lg border border-marquee-400/50 bg-marquee-400/10 px-2 py-1 text-sm font-semibold text-marquee-300">
                    {h.label}
                    {h.seatType !== 'Standard' && <span className="ml-1 text-xs font-normal text-ink-300">({h.seatType.toLowerCase()})</span>}
                  </li>
                ))}
              </ul>
            )}
            {pricing.data && (
              <p className="text-xs text-ink-400">
                Seats are held for {pricing.data.holdMinutes} minutes. You can choose ticket types and snacks in the cart. Up to{' '}
                {pricing.data.maxSeatsPerOrder} seats per order.
              </p>
            )}
            {selected.length > 0 ? (
              <Link to="/cart" className="btn btn-primary w-full">
                Continue to cart ({pluralize(selected.length, 'seat')})
              </Link>
            ) : (
              <button type="button" className="btn btn-primary w-full" disabled>
                Continue to cart
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

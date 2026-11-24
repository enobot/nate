import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, api } from '../api/client';
import { TICKET_TYPES, type OrderQuote, type PricingInfo, type TicketType } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { HoldTimer } from '../components/HoldTimer';
import { OrderSummary, QuoteLines } from '../components/OrderSummary';
import { PosterArt } from '../components/PosterArt';
import { EmptyState, ErrorPanel, PageHeader, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useDocumentTitle } from '../hooks/useNow';
import { formatCents, formatDayTime } from '../lib/format';
import { useCart, type CartApi } from '../state/cart';
import { useToast } from '../state/toast';

function ticketPriceHint(pricing: PricingInfo, type: TicketType): string {
  const cents = type === 'Adult' ? pricing.adultCents : type === 'Child' ? pricing.childCents : pricing.seniorCents;
  return formatCents(cents);
}

/** Asks the server to price the current selection whenever it changes. */
export function useQuote(cart: CartApi) {
  const { tickets, concessions } = cart.selections();
  const key = cart.screeningId !== null && tickets.length > 0 ? JSON.stringify([cart.screeningId, tickets, concessions]) : null;
  const screeningId = cart.screeningId;
  return useApi<OrderQuote>(key, async (signal) => {
    // A short pause so quick +/- clicks send one request instead of several.
    await new Promise((resolve) => setTimeout(resolve, 200));
    signal.throwIfAborted();
    return api.quote(screeningId!, tickets, concessions);
  });
}

export function CartPage() {
  useDocumentTitle('Cart');
  const cart = useCart();
  const navigate = useNavigate();
  const { notify } = useToast();
  const pricing = useApi('pricing', (signal) => api.pricing(signal));
  const screening = useApi(cart.screeningId !== null ? `screening:${cart.screeningId}` : null, (signal) => api.screening(cart.screeningId!, signal));
  const quote = useQuote(cart);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const items = pricing.data?.concessions ?? [];
    return (['Combo', 'Snack', 'Drink'] as const).map((category) => ({ category, items: items.filter((i) => i.category === category) }));
  }, [pricing.data]);

  // Make sure the seats shown here are still held on the server.
  const { refresh } = cart;
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!cart.synced) return <Spinner label="Loading your cart" />;

  if (cart.holds.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Cart" title="Your cart is empty" />
        <EmptyState title="No seats held" action={<Link to="/" className="btn btn-primary">Browse showtimes</Link>}>
          Pick a showtime and choose seats. They will be held here for a few minutes while you add tickets and snacks.
        </EmptyState>
      </div>
    );
  }

  const max = pricing.data?.maxConcessionQuantity ?? 10;

  const remove = async (seatId: number) => {
    try {
      await cart.releaseSeat(seatId);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not release that seat.', 'error');
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await cart.clear();
      notify('Your seats were released.', 'info');
      navigate('/');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not release the seats.', 'error');
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Cart" title="Tickets and snacks">
        Choose a ticket type for each seat and add concessions. Prices are calculated by the server.
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section aria-labelledby="tickets-heading" className="card p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="tickets-heading" className="font-display text-2xl font-bold text-white">
                Tickets
              </h2>
              <HoldTimer />
            </div>

            {screening.data && (
              <div className="mb-5 flex items-center gap-4 rounded-xl bg-ink-900/70 p-3">
                <div className="w-12 flex-none">
                  <PosterArt title={screening.data.movie.title} palette={screening.data.movie.posterPalette} motif={screening.data.movie.posterMotif} showTitle={false} />
                </div>
                <div>
                  <p className="font-semibold text-white">{screening.data.movie.title}</p>
                  <p className="text-sm text-ink-300">
                    {screening.data.auditorium.name} · {formatDayTime(screening.data.screening.startsAtLocal)}
                    {screening.data.screening.isMatinee && <span className="ml-2 text-emerald-300">Matinee</span>}
                  </p>
                </div>
                <Link to={`/screenings/${screening.data.screening.id}`} className="ml-auto text-sm text-marquee-300 hover:underline">
                  Change seats
                </Link>
              </div>
            )}

            <ul className="divide-y divide-white/5">
              {cart.holds.map((hold) => {
                const selectId = `ticket-type-${hold.seatId}`;
                return (
                  <li key={hold.seatId} className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-[7rem]">
                      <p className="font-display text-xl font-bold text-white">Seat {hold.label}</p>
                      <p className="text-xs text-ink-400">{hold.seatType === 'Standard' ? 'Standard seat' : hold.seatType === 'Premium' ? 'Premium seat' : 'Wheelchair accessible'}</p>
                    </div>
                    <div className="flex-1">
                      <label htmlFor={selectId} className="sr-only">
                        Ticket type for seat {hold.label}
                      </label>
                      <select
                        id={selectId}
                        className="field max-w-[14rem]"
                        value={cart.ticketTypes[hold.seatId] ?? 'Adult'}
                        onChange={(e) => cart.setTicketType(hold.seatId, e.target.value as TicketType)}
                      >
                        {TICKET_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                            {pricing.data ? ` (${ticketPriceHint(pricing.data, t)} base)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn btn-ghost text-sm" onClick={() => remove(hold.seatId)} aria-label={`Remove seat ${hold.label}`}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="snacks-heading" className="card p-5 sm:p-6">
            <h2 id="snacks-heading" className="mb-1 font-display text-2xl font-bold text-white">
              Concessions
            </h2>
            <p className="mb-5 text-sm text-ink-400">Picked up at the counter. Sales tax applies to food and drinks.</p>
            {pricing.error && <ErrorPanel error={pricing.error} onRetry={pricing.reload} />}
            {grouped.map(({ category, items }) =>
              items.length === 0 ? null : (
                <div key={category} className="mb-5 last:mb-0">
                  <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-ink-400 uppercase">{category === 'Combo' ? 'Combos' : `${category}s`}</h3>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {items.map((item) => {
                      const qty = cart.concessions[item.id] ?? 0;
                      return (
                        <li key={item.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${qty > 0 ? 'border-marquee-400/50 bg-marquee-400/5' : 'border-white/10 bg-ink-900/60'}`}>
                          <div className="min-w-0">
                            <p className="font-semibold text-white">{item.name}</p>
                            <p className="text-xs text-ink-400">{item.description}</p>
                            <p className="mt-1 text-sm text-marquee-300 tabular-nums">{formatCents(item.priceCents)}</p>
                          </div>
                          <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${item.name}`}>
                            <button
                              type="button"
                              className="h-8 w-8 rounded-lg bg-ink-700 text-lg text-white hover:bg-ink-600 disabled:opacity-40"
                              onClick={() => cart.setConcessionQuantity(item.id, qty - 1)}
                              disabled={qty === 0}
                              aria-label={`Remove one ${item.name}`}
                            >
                              −
                            </button>
                            <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                              {qty}
                            </span>
                            <button
                              type="button"
                              className="h-8 w-8 rounded-lg bg-ink-700 text-lg text-white hover:bg-ink-600 disabled:opacity-40"
                              onClick={() => cart.setConcessionQuantity(item.id, qty + 1)}
                              disabled={qty >= max}
                              aria-label={`Add one ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )}
          </section>
        </div>

        <aside className="card h-fit space-y-5 p-5 sm:p-6 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="font-display text-2xl font-bold text-white">Summary</h2>
          {quote.error && <p role="alert" className="text-sm text-velvet-400">{quote.error.message}</p>}
          {quote.data ? (
            <>
              <QuoteLines quote={quote.data} />
              <div className="border-t border-white/10 pt-4">
                <OrderSummary totals={quote.data} salesTaxRate={quote.data.salesTaxRate} isMatinee={quote.data.isMatinee} updating={quote.loading} />
              </div>
            </>
          ) : (
            !quote.error && <Spinner label="Calculating prices" />
          )}
          <Link to="/checkout" className="btn btn-primary w-full">
            Continue to checkout
          </Link>
          <button type="button" className="btn btn-ghost w-full text-sm" onClick={() => setConfirmClear(true)}>
            Release all seats
          </button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Release all seats?"
        confirmLabel="Release seats"
        busy={busy}
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      >
        <p>Your seats go back on sale right away and your snack choices are cleared.</p>
      </ConfirmDialog>
    </div>
  );
}

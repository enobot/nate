import type { ReactNode } from 'react';
import type { Order } from '../api/types';
import { formatDayTime, formatTimestamp } from '../lib/format';
import { OrderSummary } from './OrderSummary';
import { PosterArt } from './PosterArt';
import { Badge } from './ui';

/** A ticket-stub style view of one order, used on the confirmation and order history pages. */
export function OrderCard({ order, actions }: { order: Order; actions?: ReactNode }) {
  const cancelled = order.status === 'Cancelled';
  return (
    <article className={`card overflow-hidden ${cancelled ? 'opacity-80' : ''}`} aria-labelledby={`order-${order.orderNumber}`}>
      <div className="grid gap-0 sm:grid-cols-[1fr_15rem]">
        <div className="flex gap-4 p-5">
          <div className="w-20 flex-none">
            <PosterArt title={order.movieTitle} palette={order.posterPalette} motif={order.posterMotif} showTitle={false} />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`order-${order.orderNumber}`} className="font-display text-2xl font-bold text-white">
                {order.movieTitle}
              </h3>
              {cancelled ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Paid (simulated)</Badge>}
            </div>
            <p className="text-sm text-ink-300">
              {order.auditoriumName} · {formatDayTime(order.startsAtLocal)}
              {order.isMatinee && <span className="ml-2 text-emerald-300">Matinee</span>}
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Seats">
              {order.tickets.map((t) => (
                <li key={t.seatId} className={`rounded-lg border px-2 py-1 text-xs font-semibold ${cancelled ? 'border-ink-600 text-ink-400 line-through' : 'border-marquee-400/50 text-marquee-300'}`}>
                  {t.seatLabel} · {t.ticketType}
                </li>
              ))}
            </ul>
            {order.concessions.length > 0 && (
              <p className="text-xs text-ink-400">Concessions: {order.concessions.map((c) => `${c.quantity} × ${c.name}`).join(', ')}</p>
            )}
            {cancelled && order.cancelledAtUtc && (
              <p className="text-xs text-ink-400">
                Cancelled {formatTimestamp(order.cancelledAtUtc)}
                {order.cancelledBy === 'Admin' ? ' by the theater' : ''}
                {order.cancellationReason ? `: ${order.cancellationReason}` : ''}
              </p>
            )}
            {actions && <div className="pt-2">{actions}</div>}
          </div>
        </div>
        <div className="relative border-t border-dashed border-white/15 bg-ink-900/60 p-5 sm:border-t-0 sm:border-l">
          <span className="absolute -top-3 -left-3 hidden h-6 w-6 rounded-full bg-ink-950 sm:block" aria-hidden />
          <span className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full bg-ink-950 sm:block" aria-hidden />
          <p className="text-[0.65rem] font-bold tracking-[0.25em] text-ink-400 uppercase">Order number</p>
          <p className="mb-4 font-mono text-lg font-bold tracking-wider text-white">{order.orderNumber}</p>
          <OrderSummary totals={order} isMatinee={order.isMatinee} refundedCents={order.refundedCents} />
          <p className="mt-3 text-[0.7rem] text-ink-500">Payment ref. {order.paymentReference} (simulated)</p>
        </div>
      </div>
    </article>
  );
}

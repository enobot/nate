import type { OrderQuote } from '../api/types';
import { formatCents, formatRate } from '../lib/format';

interface Totals {
  ticketSubtotalCents: number;
  concessionSubtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

interface OrderSummaryProps {
  totals: Totals;
  /** Shown next to the tax line when known (quotes carry it; saved orders do not). */
  salesTaxRate?: number;
  isMatinee?: boolean;
  refundedCents?: number;
  /** True while a new quote is being calculated. */
  updating?: boolean;
}

/** Totals block used by the cart, checkout, confirmation and order history. */
export function OrderSummary({ totals, salesTaxRate, isMatinee, refundedCents, updating }: OrderSummaryProps) {
  return (
    <dl className={`space-y-2 text-sm transition-opacity ${updating ? 'opacity-60' : ''}`} aria-busy={updating || undefined}>
      <Row label="Tickets" value={formatCents(totals.ticketSubtotalCents)} />
      {totals.discountCents > 0 && (
        <Row
          label={isMatinee ? 'Matinee savings included above' : 'Savings included above'}
          value={formatCents(totals.discountCents)}
          tone="text-emerald-300"
        />
      )}
      <Row label="Concessions" value={formatCents(totals.concessionSubtotalCents)} />
      <Row label={salesTaxRate !== undefined ? `Sales tax (${formatRate(salesTaxRate)})` : 'Sales tax'} value={formatCents(totals.taxCents)} />
      <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-3">
        <dt className="font-semibold text-white">Total</dt>
        <dd className="font-display text-2xl font-bold text-marquee-300" data-testid="order-total">
          {formatCents(totals.totalCents)}
        </dd>
      </div>
      {refundedCents !== undefined && refundedCents > 0 && (
        <Row label="Refunded (simulated)" value={formatCents(refundedCents)} tone="text-sky-300" />
      )}
    </dl>
  );
}

function Row({ label, value, tone = 'text-ink-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-300">{label}</dt>
      <dd className={`tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/** Ticket-by-ticket breakdown of a server quote. */
export function QuoteLines({ quote }: { quote: OrderQuote }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {quote.tickets.map((t) => (
        <li key={t.seatId} className="flex justify-between gap-3">
          <span className="text-ink-200">
            Seat {t.seatLabel} · {t.ticketType}
            {t.seatType === 'Premium' && <span className="text-marquee-300"> · premium +{formatCents(t.surchargeCents)}</span>}
          </span>
          <span className="tabular-nums text-ink-100">{formatCents(t.priceCents)}</span>
        </li>
      ))}
      {quote.concessions.map((c) => (
        <li key={c.itemId} className="flex justify-between gap-3">
          <span className="text-ink-200">
            {c.quantity} × {c.name}
          </span>
          <span className="tabular-nums text-ink-100">{formatCents(c.lineTotalCents)}</span>
        </li>
      ))}
    </ul>
  );
}

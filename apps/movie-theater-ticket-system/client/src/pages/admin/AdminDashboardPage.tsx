import { useState } from 'react';
import { api } from '../../api/client';
import { ErrorPanel, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useNow';
import { addDays, formatCents, formatDayTime, todayKey } from '../../lib/format';

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-bold tracking-[0.2em] text-ink-400 uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-white tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-500">{note}</p>}
    </div>
  );
}

export function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard');
  const today = todayKey();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const valid = from <= to;
  const report = useApi(valid ? `report:${from}:${to}` : null, () => api.admin.salesReport(from, to));
  const data = report.data;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Sales dashboard">
        Totals are calculated from the orders in the database for the dates below (by order date).
      </PageHeader>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="report-from" className="field-label">
            From
          </label>
          <input id="report-from" type="date" className="field" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="report-to" className="field-label">
            To
          </label>
          <input id="report-to" type="date" className="field" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn btn-secondary" onClick={report.reload}>
          Refresh
        </button>
        {!valid && <p className="text-sm text-velvet-400">The start date must be on or before the end date.</p>}
      </div>

      {report.error && <ErrorPanel error={report.error} onRetry={report.reload} />}
      {!data && !report.error && valid && <Spinner label="Loading report" />}

      {data && (
        <div className={`space-y-8 ${report.loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Gross sales" value={formatCents(data.grossCents)} note="Paid orders, including tax" />
            <Stat label="Tickets sold" value={String(data.ticketsSold)} note={`${data.paidOrders} paid orders`} />
            <Stat label="Concessions" value={formatCents(data.concessionRevenueCents)} note={`Tax collected ${formatCents(data.taxCents)}`} />
            <Stat label="Refunds" value={formatCents(data.refundedCents)} note={`${data.cancelledOrders} cancelled orders`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5" aria-labelledby="by-movie-heading">
              <h2 id="by-movie-heading" className="mb-4 font-display text-xl font-bold text-white">
                Ticket sales by movie
              </h2>
              {data.byMovie.length === 0 ? (
                <p className="text-sm text-ink-400">No ticket sales in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-400 uppercase">
                    <tr>
                      <th scope="col" className="pb-2">Movie</th>
                      <th scope="col" className="pb-2 text-right">Tickets</th>
                      <th scope="col" className="pb-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.byMovie.map((m) => (
                      <tr key={m.movieId}>
                        <td className="py-2 text-ink-100">{m.title}</td>
                        <td className="py-2 text-right tabular-nums">{m.ticketsSold}</td>
                        <td className="py-2 text-right tabular-nums">{formatCents(m.ticketRevenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card p-5" aria-labelledby="snacks-report-heading">
              <h2 id="snacks-report-heading" className="mb-4 font-display text-xl font-bold text-white">
                Concession sales
              </h2>
              {data.concessions.length === 0 ? (
                <p className="text-sm text-ink-400">No concession sales in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-400 uppercase">
                    <tr>
                      <th scope="col" className="pb-2">Item</th>
                      <th scope="col" className="pb-2 text-right">Qty</th>
                      <th scope="col" className="pb-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.concessions.map((c) => (
                      <tr key={c.itemId}>
                        <td className="py-2 text-ink-100">{c.name}</td>
                        <td className="py-2 text-right tabular-nums">{c.quantity}</td>
                        <td className="py-2 text-right tabular-nums">{formatCents(c.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card p-5" aria-labelledby="occupancy-heading">
            <h2 id="occupancy-heading" className="mb-4 font-display text-xl font-bold text-white">
              Next screenings: seats sold
            </h2>
            <ul className="space-y-3">
              {data.upcomingOccupancy.map((s) => {
                const pct = s.capacity === 0 ? 0 : Math.round((s.ticketsSold / s.capacity) * 100);
                return (
                  <li key={s.screeningId}>
                    <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-ink-100">
                        {s.movieTitle} <span className="text-ink-400">· {s.auditoriumName} · {formatDayTime(s.startsAtLocal)}</span>
                      </span>
                      <span className="tabular-nums text-ink-300">
                        {s.ticketsSold} / {s.capacity} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-700" aria-hidden>
                      <div className="h-full rounded-full bg-gradient-to-r from-marquee-500 to-velvet-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

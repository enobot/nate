import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../../api/client';
import type { AdminOrderSummary, Order, OrderStatus } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { OrderCard } from '../../components/OrderCard';
import { Badge, ErrorPanel, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useDocumentTitle } from '../../hooks/useNow';
import { formatCents, formatDayTime, formatTimestamp } from '../../lib/format';
import { useToast } from '../../state/toast';

const PAGE_SIZE = 15;

export function AdminReservationsPage() {
  useDocumentTitle('Reservations');
  const { notify } = useToast();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const orders = useApi(`admin-orders:${search}:${status}:${page}`, () =>
    api.admin.orders({ search: search || undefined, status: status || undefined, page, pageSize: PAGE_SIZE }),
  );
  const [selected, setSelected] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<AdminOrderSummary | null>(null);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchText.trim());
  };

  const view = async (orderNumber: string) => {
    if (selected?.orderNumber === orderNumber) {
      setSelected(null);
      return;
    }
    setLoadingOrder(orderNumber);
    try {
      setSelected(await api.admin.order(orderNumber));
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not load the order.', 'error');
    } finally {
      setLoadingOrder(null);
    }
  };

  const confirmCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      const updated = await api.admin.cancelOrder(toCancel.orderNumber, reason.trim());
      notify(`Cancelled ${updated.orderNumber}. Simulated refund: ${formatCents(updated.refundedCents)}.`, 'success');
      if (selected?.orderNumber === updated.orderNumber) setSelected(updated);
      orders.reload();
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not cancel the order.', 'error');
    } finally {
      setCancelling(false);
      setToCancel(null);
      setReason('');
    }
  };

  const data = orders.data;
  const pages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Reservations">
        Search orders by order number, customer name, or email. Admins can cancel an order at any time; the refund is simulated.
      </PageHeader>

      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="reservation-search" className="field-label">Search</label>
          <input id="reservation-search" className="field" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="MT-SEED0001, Jordan, example.com…" maxLength={100} />
        </div>
        <div>
          <label htmlFor="reservation-status" className="field-label">Status</label>
          <select
            id="reservation-status"
            className="field"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | '');
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="Paid">Paid</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      {orders.error && <ErrorPanel error={orders.error} onRetry={orders.reload} />}
      {!data && !orders.error && <Spinner label="Loading reservations" />}
      {data && (
        <>
          <div className={`card overflow-x-auto ${orders.loading ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Reservations, page {data.page} of {pages}</caption>
              <thead className="border-b border-white/5 text-left text-xs text-ink-400 uppercase">
                <tr>
                  <th scope="col" className="p-4">Order</th>
                  <th scope="col" className="p-4">Customer</th>
                  <th scope="col" className="p-4">Showtime</th>
                  <th scope="col" className="p-4 text-right">Total</th>
                  <th scope="col" className="p-4">Status</th>
                  <th scope="col" className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-ink-400">No orders match.</td>
                  </tr>
                )}
                {data.items.map((o) => (
                  <tr key={o.orderNumber}>
                    <td className="p-4">
                      <span className="font-mono font-semibold text-white">{o.orderNumber}</span>
                      <span className="block text-xs text-ink-500">{formatTimestamp(o.createdAtUtc)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-ink-100">{o.customerName}</span>
                      <span className="block text-xs text-ink-400">{o.customerEmail}</span>
                    </td>
                    <td className="p-4 text-ink-300">
                      {o.movieTitle}
                      <span className="block text-xs text-ink-500">
                        {o.auditoriumName} · {formatDayTime(o.startsAtLocal)} · {o.ticketCount} {o.ticketCount === 1 ? 'ticket' : 'tickets'}
                      </span>
                    </td>
                    <td className="p-4 text-right tabular-nums">{formatCents(o.totalCents)}</td>
                    <td className="p-4">{o.status === 'Paid' ? <Badge tone="green">Paid</Badge> : <Badge tone="red">Cancelled</Badge>}</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => view(o.orderNumber)} aria-expanded={selected?.orderNumber === o.orderNumber}>
                          {loadingOrder === o.orderNumber ? 'Loading…' : selected?.orderNumber === o.orderNumber ? 'Hide' : 'View'}
                          {' '}<span className="sr-only">order {o.orderNumber}</span>
                        </button>
                        {o.status === 'Paid' && (
                          <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs text-velvet-400" onClick={() => setToCancel(o)}>
                            Cancel{' '}<span className="sr-only">order {o.orderNumber}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-ink-400">
            <span>
              {data.totalCount} {data.totalCount === 1 ? 'order' : 'orders'} · page {data.page} of {pages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </nav>
        </>
      )}

      {selected && (
        <section aria-label={`Order ${selected.orderNumber} details`} className="space-y-2">
          <OrderCard order={selected} />
          <p className="text-xs text-ink-500">Customer email: {selected.customerEmail}</p>
        </section>
      )}

      <ConfirmDialog open={toCancel !== null} title="Cancel this order?" confirmLabel="Cancel order" cancelLabel="Keep order" busy={cancelling} onConfirm={confirmCancel} onCancel={() => setToCancel(null)}>
        {toCancel && (
          <>
            <p>
              {toCancel.orderNumber} for {toCancel.customerName} will be cancelled, its seats released, and a simulated refund of {formatCents(toCancel.totalCents)} recorded.
            </p>
            <div>
              <label htmlFor="cancel-reason" className="field-label">Reason (optional, shown to the customer)</label>
              <textarea id="cancel-reason" className="field" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

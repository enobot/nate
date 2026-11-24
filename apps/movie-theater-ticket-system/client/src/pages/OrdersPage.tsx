import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import type { Order } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { OrderCard } from '../components/OrderCard';
import { PageHeader } from '../components/ui';
import { useDocumentTitle } from '../hooks/useNow';
import { formatCents, formatTimestamp } from '../lib/format';
import { StorageKeys, readJson } from '../lib/storage';
import { useToast } from '../state/toast';

const ORDER_NUMBER = /^MT-[0-9A-HJKMNP-TV-Z]{8}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LookupErrors {
  orderNumber?: string;
  email?: string;
}

export function validateLookup(orderNumber: string, email: string): LookupErrors {
  const errors: LookupErrors = {};
  if (!ORDER_NUMBER.test(orderNumber.trim())) errors.orderNumber = 'Order numbers look like MT-7K3QX9AB.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter the email used for the order.';
  return errors;
}

export function OrdersPage() {
  useDocumentTitle('My orders');
  const { notify } = useToast();
  const last = readJson<Order>(StorageKeys.lastOrder, 'session');
  const [orderNumber, setOrderNumber] = useState(last?.orderNumber ?? '');
  const [email, setEmail] = useState(last?.customerEmail ?? '');
  const [errors, setErrors] = useState<LookupErrors>({});
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [lookupEmail, setLookupEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateLookup(orderNumber, email);
    setErrors(found);
    setLookupError(null);
    if (Object.keys(found).length > 0) return;

    setSearching(true);
    try {
      const result = await api.orderHistory(orderNumber.trim().toUpperCase(), email.trim());
      setOrders(result.orders);
      setLookupEmail(email.trim());
    } catch (error) {
      setOrders(null);
      setLookupError(error instanceof ApiError ? error.message : 'Lookup failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const confirmCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      const updated = await api.cancelOrder(toCancel.orderNumber, lookupEmail);
      setOrders((list) => list?.map((o) => (o.orderNumber === updated.orderNumber ? updated : o)) ?? null);
      notify(`Order ${updated.orderNumber} was cancelled. A simulated refund of ${formatCents(updated.refundedCents)} was recorded.`, 'success');
      setToCancel(null);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not cancel the order.', 'error');
      setToCancel(null);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Order history" title="My orders">
        There are no accounts in this demo. Enter any one order number and the email you used, and you will see every order for that
        email.
      </PageHeader>

      <form noValidate onSubmit={onSubmit} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start sm:p-6" aria-label="Find orders">
        <div>
          <label htmlFor="lookup-order" className="field-label">
            Order number
          </label>
          <input
            id="lookup-order"
            className="field font-mono uppercase"
            placeholder="MT-XXXXXXXX"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            aria-invalid={errors.orderNumber ? true : undefined}
            aria-describedby={errors.orderNumber ? 'lookup-order-error' : undefined}
            autoComplete="off"
            maxLength={11}
          />
          {errors.orderNumber && (
            <p id="lookup-order-error" className="field-error">
              {errors.orderNumber}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="lookup-email" className="field-label">
            Email
          </label>
          <input
            id="lookup-email"
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'lookup-email-error' : undefined}
            autoComplete="email"
          />
          {errors.email && (
            <p id="lookup-email-error" className="field-error">
              {errors.email}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary sm:mt-6" disabled={searching}>
          {searching ? 'Searching…' : 'Find orders'}
        </button>
        <p className="text-xs text-ink-500 sm:col-span-3">
          Sample data to try: order <span className="font-mono">MT-SEED0001</span> with jordan.rivera@example.com.
        </p>
      </form>

      {lookupError && (
        <p role="alert" className="rounded-xl border border-velvet-500/50 bg-velvet-500/10 px-4 py-3 text-sm text-rose-100">
          {lookupError}
        </p>
      )}

      {orders && (
        <section aria-labelledby="results-heading" className="space-y-4">
          <h2 id="results-heading" className="font-display text-2xl font-bold text-white">
            {orders.length === 1 ? '1 order' : `${orders.length} orders`} for {lookupEmail}
          </h2>
          {orders.map((order) => (
            <OrderCard
              key={order.orderNumber}
              order={order}
              actions={
                order.status === 'Paid' &&
                (order.canCancel ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="btn btn-secondary py-1.5 text-sm" onClick={() => setToCancel(order)}>
                      Cancel order
                    </button>
                    <span className="text-xs text-ink-400">Online cancellation closes {formatTimestamp(order.cancelDeadlineUtc)}.</span>
                  </div>
                ) : (
                  <p className="text-xs text-ink-400">Online cancellation has closed for this showtime.</p>
                ))
              }
            />
          ))}
        </section>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title="Cancel this order?"
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setToCancel(null)}
      >
        {toCancel && (
          <p>
            Order {toCancel.orderNumber} for {toCancel.movieTitle} will be cancelled and its seats released. A simulated refund of{' '}
            {formatCents(toCancel.totalCents)} will be recorded. This can&apos;t be undone.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

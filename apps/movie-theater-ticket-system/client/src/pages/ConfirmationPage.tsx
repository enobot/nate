import { Link, useLocation, useParams } from 'react-router';
import type { Order } from '../api/types';
import { OrderCard } from '../components/OrderCard';
import { EmptyState, PageHeader } from '../components/ui';
import { useDocumentTitle } from '../hooks/useNow';
import { formatTimestamp } from '../lib/format';
import { StorageKeys, readJson } from '../lib/storage';

export function ConfirmationPage() {
  useDocumentTitle('Order confirmed');
  const { orderNumber } = useParams();
  const location = useLocation();
  const fromState = (location.state as { order?: Order } | null)?.order;
  const stored = readJson<Order>(StorageKeys.lastOrder, 'session');
  const order = fromState?.orderNumber === orderNumber ? fromState : stored?.orderNumber === orderNumber ? stored : null;

  if (!order) {
    return (
      <div>
        <PageHeader eyebrow="Order" title="Order details" />
        <EmptyState title="Look up your order" action={<Link to="/orders" className="btn btn-primary">Find my order</Link>}>
          For privacy, order details are only shown right after checkout. Use your order number and email to see it again.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="You're all set" title="Order confirmed">
        A simulated payment was recorded on {formatTimestamp(order.createdAtUtc)}. Keep your order number and email to look up or cancel this
        order.
      </PageHeader>
      <div className="motion-safe:animate-fade-up">
        <OrderCard order={order} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/orders" className="btn btn-primary">
          View my orders
        </Link>
        <Link to="/" className="btn btn-secondary">
          Browse more movies
        </Link>
      </div>
    </div>
  );
}

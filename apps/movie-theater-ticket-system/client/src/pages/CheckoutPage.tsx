import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, api } from '../api/client';
import { HoldTimer } from '../components/HoldTimer';
import { OrderSummary, QuoteLines } from '../components/OrderSummary';
import { EmptyState, PageHeader, SimulatedPaymentNotice, Spinner } from '../components/ui';
import { useDocumentTitle } from '../hooks/useNow';
import { StorageKeys, writeJson } from '../lib/storage';
import { useCart } from '../state/cart';
import { useQuote } from './CartPage';

interface FormValues {
  name: string;
  email: string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

// Deliberately simple: the server does the authoritative check with [EmailAddress].
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCheckout(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const name = values.name.trim();
  if (name.length < 2) errors.name = 'Enter the name for the order (at least 2 characters).';
  else if (name.length > 80) errors.name = 'Names can be up to 80 characters.';
  const email = values.email.trim();
  if (!email) errors.email = 'Enter an email address. You will need it to look up or cancel the order.';
  else if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address, like name@example.com.';
  return errors;
}

export function CheckoutPage() {
  useDocumentTitle('Checkout');
  const cart = useCart();
  const navigate = useNavigate();
  const quote = useQuote(cart);
  const [values, setValues] = useState<FormValues>({ name: '', email: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [simulateDecline, setSimulateDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ message: string; recoverable: boolean } | null>(null);

  if (!cart.synced) return <Spinner label="Loading your cart" />;

  if (cart.holds.length === 0 || !cart.token) {
    return (
      <div>
        <PageHeader eyebrow="Checkout" title="Nothing to check out" />
        <EmptyState title="Your cart is empty" action={<Link to="/" className="btn btn-primary">Browse showtimes</Link>}>
          If you were in the middle of checking out, your seat hold may have expired.
        </EmptyState>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const found = validateCheckout(values);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`checkout-${first}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const { tickets, concessions } = cart.selections();
      // Only seat ids, ticket types and quantities are sent. The server prices the order itself.
      const order = await api.checkout({
        cartToken: cart.token!,
        customerName: values.name.trim(),
        customerEmail: values.email.trim(),
        tickets,
        concessions,
        simulateDecline,
      });
      writeJson(StorageKeys.lastOrder, order, 'session');
      cart.reset();
      navigate(`/orders/confirmation/${order.orderNumber}`, { state: { order } });
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors: FormErrors = {};
        if (error.fieldErrors.CustomerName) fieldErrors.name = error.fieldErrors.CustomerName[0];
        if (error.fieldErrors.CustomerEmail) fieldErrors.email = error.fieldErrors.CustomerEmail[0];
        setErrors(fieldErrors);
        // 402 = simulated decline (seats still held). 409 = the hold expired or the cart changed.
        setFailure({ message: error.message, recoverable: error.status === 402 || error.status === 400 });
        if (error.status === 409) {
          void cart.refresh();
        }
      } else {
        setFailure({ message: 'Something went wrong. Please try again.', recoverable: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key: keyof FormValues) => ({
    id: `checkout-${key}`,
    value: values[key],
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `checkout-${key}-error` : undefined,
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <div>
      <PageHeader eyebrow="Checkout" title="Complete your order" />
      <div className="mb-6">
        <SimulatedPaymentNotice />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <form noValidate onSubmit={onSubmit} className="card space-y-5 p-5 sm:p-6" aria-labelledby="contact-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="contact-heading" className="font-display text-2xl font-bold text-white">
              Contact details
            </h2>
            <HoldTimer />
          </div>
          <p className="text-sm text-ink-400">We use these only to find your order later. Use any email for the demo, such as you@example.com.</p>

          <div>
            <label htmlFor="checkout-name" className="field-label">
              Full name
            </label>
            <input {...field('name')} className="field" autoComplete="name" maxLength={80} />
            {errors.name && (
              <p id="checkout-name-error" className="field-error">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="checkout-email" className="field-label">
              Email
            </label>
            <input {...field('email')} className="field" type="email" autoComplete="email" maxLength={254} />
            {errors.email && (
              <p id="checkout-email-error" className="field-error">
                {errors.email}
              </p>
            )}
          </div>

          <fieldset className="rounded-xl border border-white/10 p-4">
            <legend className="px-1 text-sm font-semibold text-ink-200">Payment</legend>
            <p className="text-sm text-ink-300">
              No card is needed. Pressing the button below records the order with a simulated payment reference.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-300">
              <input type="checkbox" checked={simulateDecline} onChange={(e) => setSimulateDecline(e.target.checked)} className="h-4 w-4 accent-marquee-400" />
              Simulate a declined payment (to see how errors are handled)
            </label>
          </fieldset>

          {failure && (
            <div role="alert" className="rounded-xl border border-velvet-500/50 bg-velvet-500/10 px-4 py-3 text-sm text-rose-100">
              <p>{failure.message}</p>
              {!failure.recoverable && (
                <Link to="/cart" className="mt-2 inline-block font-semibold text-marquee-300 underline">
                  Review your cart
                </Link>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={submitting}>
            {submitting ? 'Processing simulated payment…' : 'Complete simulated payment'}
          </button>
        </form>

        <aside className="card h-fit space-y-5 p-5 sm:p-6 lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="font-display text-2xl font-bold text-white">Order summary</h2>
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
          <Link to="/cart" className="block text-center text-sm text-ink-300 hover:text-white">
            Edit tickets and snacks
          </Link>
        </aside>
      </div>
    </div>
  );
}

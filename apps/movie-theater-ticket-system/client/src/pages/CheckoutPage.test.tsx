import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TOKEN, cartWith, mockFetch, quoteFor, renderApp, sampleOrder, seedCart } from '../test/utils';
import { validateCheckout } from './CheckoutPage';

vi.mock('../api/realtime', () => ({ createSeatFeed: vi.fn() }));

function routes(checkout: (body: unknown) => { status?: number; body?: unknown }) {
  return {
    [`GET /api/carts/${TOKEN}`]: () => ({ body: cartWith([2, 3]) }),
    'POST /api/orders/quote': (call: { body: unknown }) => {
      const b = call.body as { tickets: { seatId: number; ticketType: string }[]; concessions: { itemId: number; quantity: number }[] };
      return { body: quoteFor(b.tickets, b.concessions) };
    },
    'POST /api/orders': (call: { body: unknown }) => checkout(call.body),
  };
}

describe('validateCheckout', () => {
  it('requires a name and a valid email', () => {
    expect(validateCheckout({ name: ' ', email: '' })).toEqual({
      name: expect.stringContaining('at least 2'),
      email: expect.stringContaining('Enter an email'),
    });
    expect(validateCheckout({ name: 'Al', email: 'not-an-email' }).email).toContain('valid email');
    expect(validateCheckout({ name: 'Avery Quinn', email: 'avery@example.com' })).toEqual({});
  });
});

describe('CheckoutPage', () => {
  it('says the payment is simulated and never asks for card details', async () => {
    seedCart({ 2: 'Adult', 3: 'Child' });
    mockFetch(routes(() => ({ status: 500 })));
    renderApp('/checkout');

    expect(await screen.findByText(/Simulated checkout — no real payment is processed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete simulated payment' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/card|cvv|expir/i)).not.toBeInTheDocument();
  });

  it('shows field errors and does not submit an invalid form', async () => {
    const user = userEvent.setup();
    seedCart({ 2: 'Adult', 3: 'Child' });
    const { calls } = mockFetch(routes(() => ({ status: 201, body: sampleOrder() })));
    renderApp('/checkout');

    await user.click(await screen.findByRole('button', { name: 'Complete simulated payment' }));

    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription(/at least 2 characters/);
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/Enter an email/);
    expect(screen.getByLabelText('Full name')).toHaveFocus();
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/orders')).toHaveLength(0);
  });

  it('sends only seat ids, ticket types and quantities, then shows the confirmation', async () => {
    const user = userEvent.setup();
    seedCart({ 2: 'Adult', 3: 'Child' }, { 1: 2 });
    const { calls } = mockFetch(routes(() => ({ status: 201, body: sampleOrder({ orderNumber: 'MT-ABCD2345' }) })));
    renderApp('/checkout');

    await screen.findByTestId('order-total');
    await user.type(screen.getByLabelText('Full name'), 'Avery Quinn');
    await user.type(screen.getByLabelText('Email'), 'avery@example.com');
    await user.click(screen.getByRole('button', { name: 'Complete simulated payment' }));

    expect(await screen.findByRole('heading', { name: 'Order confirmed' })).toBeInTheDocument();
    expect(screen.getByText('MT-ABCD2345')).toBeInTheDocument();

    const checkout = calls.find((c) => c.method === 'POST' && c.url === '/api/orders');
    expect(checkout?.body).toEqual({
      cartToken: TOKEN,
      customerName: 'Avery Quinn',
      customerEmail: 'avery@example.com',
      tickets: [
        { seatId: 2, ticketType: 'Adult' },
        { seatId: 3, ticketType: 'Child' },
      ],
      concessions: [{ itemId: 1, quantity: 2 }],
      simulateDecline: false,
    });
    expect(JSON.stringify(checkout?.body)).not.toMatch(/price|cents|total/i);
    // The cart is cleared after a successful order.
    expect(window.localStorage.getItem('mtts.cart')).toBeNull();
  });

  it('keeps the customer on the page when the simulated payment is declined', async () => {
    const user = userEvent.setup();
    seedCart({ 2: 'Adult', 3: 'Adult' });
    mockFetch(
      routes(() => ({
        status: 402,
        body: { status: 402, title: 'Payment declined', code: 'payment-declined', detail: 'The simulated payment was declined. Your seats are still held.' },
      })),
    );
    renderApp('/checkout');

    await screen.findByTestId('order-total');
    await user.type(screen.getByLabelText('Full name'), 'Avery Quinn');
    await user.type(screen.getByLabelText('Email'), 'avery@example.com');
    await user.click(screen.getByLabelText(/Simulate a declined payment/));
    await user.click(screen.getByRole('button', { name: 'Complete simulated payment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The simulated payment was declined');
    expect(screen.getByRole('heading', { name: 'Complete your order' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete simulated payment' })).toBeEnabled());
  });

  it('shows the server message and a way back when the hold expired', async () => {
    const user = userEvent.setup();
    seedCart({ 2: 'Adult', 3: 'Adult' });
    mockFetch(
      routes(() => ({
        status: 409,
        body: { status: 409, code: 'hold-expired', detail: 'Your seat hold expired or your cart is empty. Please choose your seats again.' },
      })),
    );
    renderApp('/checkout');

    await screen.findByTestId('order-total');
    await user.type(screen.getByLabelText('Full name'), 'Avery Quinn');
    await user.type(screen.getByLabelText('Email'), 'avery@example.com');
    await user.click(screen.getByRole('button', { name: 'Complete simulated payment' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your seat hold expired');
    expect(screen.getByRole('link', { name: 'Review your cart' })).toHaveAttribute('href', '/cart');
  });

  it('shows an empty state when there is nothing to check out', async () => {
    mockFetch({});
    renderApp('/checkout');
    expect(await screen.findByRole('heading', { name: 'Nothing to check out' })).toBeInTheDocument();
  });
});

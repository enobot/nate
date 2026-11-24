import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TOKEN, cartWith, mockFetch, pricingInfo, quoteFor, renderApp, screeningDetail, seedCart } from '../test/utils';

vi.mock('../api/realtime', () => ({ createSeatFeed: vi.fn() }));

function routes(held: number[]) {
  return {
    [`GET /api/carts/${TOKEN}`]: () => ({ body: cartWith(held) }),
    'GET /api/pricing': () => ({ body: pricingInfo() }),
    'GET /api/screenings/42': () => ({ body: screeningDetail() }),
    'POST /api/orders/quote': (call: { body: unknown }) => {
      const b = call.body as { tickets: { seatId: number; ticketType: string }[]; concessions: { itemId: number; quantity: number }[] };
      return { body: quoteFor(b.tickets, b.concessions) };
    },
    [`DELETE /api/carts/${TOKEN}/holds/3`]: () => ({ body: cartWith([6]) }),
  };
}

describe('CartPage', () => {
  it('restores held seats from the server and shows server-calculated totals', async () => {
    seedCart();
    mockFetch(routes([6, 3]));
    renderApp('/cart');

    expect(await screen.findByText('Seat B2')).toBeInTheDocument();
    expect(screen.getByText('Seat A3')).toBeInTheDocument();
    // Adult premium 18.00 + adult standard 14.50
    await waitFor(() => expect(screen.getByTestId('order-total')).toHaveTextContent('$32.50'));
  });

  it('re-prices the order when ticket types and snacks change', async () => {
    const user = userEvent.setup();
    seedCart();
    const { calls } = mockFetch(routes([6, 3]));
    renderApp('/cart');

    await screen.findByText('Seat A3');
    await user.selectOptions(screen.getByLabelText('Ticket type for seat A3'), 'Child');
    await user.click(await screen.findByRole('button', { name: 'Add one Popcorn (Small)' }));
    await user.click(screen.getByRole('button', { name: 'Add one Popcorn (Small)' }));

    // 18.00 + 10.50 + 2 x 6.50 + tax on snacks (7.75% of 13.00 = 1.01)
    await waitFor(() => expect(screen.getByTestId('order-total')).toHaveTextContent('$42.51'));
    const lastQuote = calls.filter((c) => c.url === '/api/orders/quote').at(-1);
    expect(lastQuote?.body).toEqual({
      screeningId: 42,
      tickets: [
        { seatId: 6, ticketType: 'Adult' },
        { seatId: 3, ticketType: 'Child' },
      ],
      concessions: [{ itemId: 1, quantity: 2 }],
    });
  });

  it('removes a seat from the cart', async () => {
    const user = userEvent.setup();
    seedCart();
    mockFetch(routes([6, 3]));
    renderApp('/cart');

    await user.click(await screen.findByRole('button', { name: 'Remove seat A3' }));

    await waitFor(() => expect(screen.queryByText('Seat A3')).not.toBeInTheDocument());
    expect(screen.getByText('Seat B2')).toBeInTheDocument();
  });

  it('shows an empty cart when the server has no holds for the token', async () => {
    seedCart();
    mockFetch(routes([]));
    renderApp('/cart');

    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockFetch, renderApp, sampleOrder } from '../test/utils';
import { validateLookup } from './OrdersPage';

vi.mock('../api/realtime', () => ({ createSeatFeed: vi.fn() }));

describe('validateLookup', () => {
  it('checks the order number format and email', () => {
    expect(validateLookup('12345', 'nope')).toEqual({ orderNumber: expect.any(String), email: expect.any(String) });
    expect(validateLookup('mt-seed0001', 'jordan.rivera@example.com')).toEqual({});
  });
});

describe('OrdersPage', () => {
  it('validates the form before calling the server', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({});
    renderApp('/orders');

    await user.click(screen.getByRole('button', { name: 'Find orders' }));

    expect(screen.getByLabelText('Order number')).toHaveAccessibleDescription('Order numbers look like MT-7K3QX9AB.');
    expect(calls).toHaveLength(0);
  });

  it('finds orders and cancels one after confirmation', async () => {
    const user = userEvent.setup();
    const paid = sampleOrder();
    const older = sampleOrder({ orderNumber: 'MT-PRV23456', canCancel: false, movieTitle: 'Saltwind Station' });
    const { calls } = mockFetch({
      'POST /api/orders/history': () => ({ body: { orders: [paid, older] } }),
      'POST /api/orders/MT-7K3QX9AB/cancel': () => ({
        body: { ...paid, status: 'Cancelled', canCancel: false, refundedCents: 1450, cancelledAtUtc: '2030-03-02T10:00:00Z', cancelledBy: 'Customer' },
      }),
    });
    renderApp('/orders');

    await user.type(screen.getByLabelText('Order number'), 'mt-7k3qx9ab');
    await user.type(screen.getByLabelText('Email'), 'avery@example.com');
    await user.click(screen.getByRole('button', { name: 'Find orders' }));

    expect(await screen.findByRole('heading', { name: '2 orders for avery@example.com' })).toBeInTheDocument();
    expect(calls[0].body).toEqual({ orderNumber: 'MT-7K3QX9AB', email: 'avery@example.com' });
    expect(screen.getByText('Online cancellation has closed for this showtime.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this order?' });
    expect(within(dialog).getByRole('button', { name: 'Keep order' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));

    expect(await screen.findByText(/A simulated refund of \$14\.50 was recorded/)).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Orbit of Small Hours' });
    expect(within(card).getByText('Cancelled')).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/api/orders/MT-7K3QX9AB/cancel', body: { email: 'avery@example.com' } });
  });

  it('closes the confirmation dialog with Escape without cancelling', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ 'POST /api/orders/history': () => ({ body: { orders: [sampleOrder()] } }) });
    renderApp('/orders');

    await user.type(screen.getByLabelText('Order number'), 'MT-7K3QX9AB');
    await user.type(screen.getByLabelText('Email'), 'avery@example.com');
    await user.click(screen.getByRole('button', { name: 'Find orders' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel order' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toHaveFocus();
    expect(calls.filter((c) => c.url.endsWith('/cancel'))).toHaveLength(0);
  });

  it('shows the server message when nothing matches', async () => {
    const user = userEvent.setup();
    mockFetch({
      'POST /api/orders/history': () => ({ status: 404, body: { status: 404, detail: "We couldn't find an order with that number and email." } }),
    });
    renderApp('/orders');

    await user.type(screen.getByLabelText('Order number'), 'MT-SEED0001');
    await user.type(screen.getByLabelText('Email'), 'wrong@example.com');
    await user.click(screen.getByRole('button', { name: 'Find orders' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find an order with that number and email.");
  });
});

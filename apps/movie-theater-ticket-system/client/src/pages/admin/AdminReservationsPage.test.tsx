import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminOrderSummary } from '../../api/types';
import { mockFetch, renderApp, sampleOrder } from '../../test/utils';

vi.mock('../../api/realtime', () => ({ createSeatFeed: vi.fn() }));

const summary: AdminOrderSummary = {
  orderNumber: 'MT-SEED0001',
  status: 'Paid',
  customerName: 'Jordan Rivera',
  customerEmail: 'jordan.rivera@example.com',
  screeningId: 42,
  movieTitle: 'Orbit of Small Hours',
  auditoriumName: 'Auditorium 3',
  startsAtLocal: '2030-03-03T19:00:00',
  ticketCount: 2,
  totalCents: 3600,
  createdAtUtc: '2030-03-01T18:00:00Z',
};

describe('AdminReservationsPage', () => {
  it('searches orders and cancels one with a reason', async () => {
    const user = userEvent.setup();
    let cancelled = false;
    const { calls } = mockFetch({
      'GET /api/admin/auth/me': () => ({ body: { username: 'admin' } }),
      'GET /api/admin/orders': () => ({ body: { items: [{ ...summary, status: cancelled ? 'Cancelled' : 'Paid' }], page: 1, pageSize: 15, totalCount: 1 } }),
      'GET /api/admin/orders/MT-SEED0001': () => ({ body: sampleOrder({ orderNumber: 'MT-SEED0001', customerName: 'Jordan Rivera' }) }),
      'POST /api/admin/orders/MT-SEED0001/cancel': () => {
        cancelled = true;
        return { body: sampleOrder({ orderNumber: 'MT-SEED0001', status: 'Cancelled', refundedCents: 3600, cancelledBy: 'Admin' }) };
      },
    });
    renderApp('/admin/reservations');

    await user.type(await screen.findByLabelText('Search'), 'jordan');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('search=jordan'))).toBe(true));

    await user.click(await screen.findByRole('button', { name: 'View order MT-SEED0001' }));
    expect(await screen.findByRole('region', { name: 'Order MT-SEED0001 details' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel order MT-SEED0001' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this order?' });
    await user.type(within(dialog).getByLabelText(/Reason/), 'Projector repair');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));

    expect(await screen.findByText('Cancelled MT-SEED0001. Simulated refund: $36.00.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/cancel'))?.body).toEqual({ reason: 'Projector repair' });
    const table = screen.getByRole('table');
    await waitFor(() => expect(within(table).getByText('Cancelled')).toBeInTheDocument());
  });
});

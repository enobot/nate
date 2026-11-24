import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeatFeed } from '../api/realtime';
import { createSeatFeed } from '../api/realtime';
import type { SeatsChangedMessage } from '../api/types';
import { TOKEN, cartWith, mockFetch, pricingInfo, renderApp, screeningDetail } from '../test/utils';

// Only the SignalR transport is faked. The page, the hook, and the cart run for real.
vi.mock('../api/realtime', () => ({ createSeatFeed: vi.fn() }));

interface FakeFeed extends SeatFeed {
  push: (message: SeatsChangedMessage) => void;
  joined: number[];
}

function fakeFeed(options: { failStart?: boolean } = {}): FakeFeed {
  let onChanged: ((m: SeatsChangedMessage) => void) | undefined;
  const joined: number[] = [];
  return {
    joined,
    start: () => (options.failStart ? Promise.reject(new Error('offline')) : Promise.resolve()),
    stop: () => Promise.resolve(),
    isConnected: () => !options.failStart,
    join: async (id) => {
      joined.push(id);
    },
    leave: async () => undefined,
    onSeatsChanged: (handler) => {
      onChanged = handler;
    },
    onReconnecting: () => undefined,
    onReconnected: () => undefined,
    onClose: () => undefined,
    push: (message) => onChanged?.(message),
  };
}

let feed: FakeFeed;

beforeEach(() => {
  feed = fakeFeed();
  vi.mocked(createSeatFeed).mockImplementation(() => feed);
});

function routes() {
  return {
    'GET /api/screenings/42': () => ({ body: screeningDetail() }),
    'GET /api/pricing': () => ({ body: pricingInfo() }),
    'POST /api/carts': () => ({ status: 201, body: cartWith([]) }),
    [`POST /api/carts/${TOKEN}/holds`]: () => ({ body: cartWith([3]) }),
    [`DELETE /api/carts/${TOKEN}/holds/3`]: () => ({ body: cartWith([]) }),
  };
}

describe('SeatSelectionPage', () => {
  it('joins the live feed for the screening and applies pushed seat changes', async () => {
    mockFetch(routes());
    renderApp('/screenings/42');

    expect(await screen.findByRole('button', { name: 'Row A seat 2, available' })).toBeInTheDocument();
    await waitFor(() => expect(feed.joined).toEqual([42]));
    expect(screen.getByText('Live: seats update as others book')).toBeInTheDocument();

    act(() => feed.push({ screeningId: 42, changes: [{ seatId: 2, status: 'Sold' }] }));
    expect(await screen.findByRole('button', { name: 'Row A seat 2, sold' })).toHaveAttribute('aria-disabled', 'true');

    // Messages for other screenings are ignored.
    act(() => feed.push({ screeningId: 99, changes: [{ seatId: 3, status: 'Sold' }] }));
    expect(screen.getByRole('button', { name: 'Row A seat 3, available' })).toBeInTheDocument();
  });

  it('holds a seat on click and releases it on a second click', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch(routes());
    renderApp('/screenings/42');

    await user.click(await screen.findByRole('button', { name: 'Row A seat 3, available' }));
    expect(await screen.findByRole('button', { name: 'Row A seat 3, selected by you' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Continue to cart (1 seat)' })).toHaveAttribute('href', '/cart');
    expect(calls.find((c) => c.url.endsWith('/holds'))?.body).toEqual({ screeningId: 42, seatId: 3 });

    await user.click(screen.getByRole('button', { name: 'Row A seat 3, selected by you' }));
    expect(await screen.findByRole('button', { name: 'Row A seat 3, available' })).toBeInTheDocument();
  });

  it('explains a conflict when someone else got the seat first', async () => {
    const user = userEvent.setup();
    mockFetch({
      ...routes(),
      [`POST /api/carts/${TOKEN}/holds`]: () => ({
        status: 409,
        body: { status: 409, code: 'seat-unavailable', detail: 'Seat A3 was just taken by another customer.' },
      }),
    });
    renderApp('/screenings/42');

    await user.click(await screen.findByRole('button', { name: 'Row A seat 3, available' }));

    expect(await screen.findByText('Seat A3 was just taken by another customer.')).toBeInTheDocument();
  });

  it('falls back to refreshing the seat map when live updates are unavailable', async () => {
    feed = fakeFeed({ failStart: true });
    vi.mocked(createSeatFeed).mockImplementation(() => feed);
    mockFetch(routes());
    renderApp('/screenings/42');

    expect(await screen.findByText(/Live updates unavailable, refreshing every 15 seconds/)).toBeInTheDocument();
  });

  it('shows when ticket sales are closed', async () => {
    mockFetch({ ...routes(), 'GET /api/screenings/42': () => ({ body: screeningDetail({ salesOpen: false }) }) });
    renderApp('/screenings/42');

    expect(await screen.findByText('Ticket sales for this showtime are closed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Row A seat 3, available' })).toHaveAttribute('aria-disabled', 'true');
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ShowtimesResponse } from '../api/types';
import { mockFetch, renderApp, screeningDetail } from '../test/utils';

vi.mock('../api/realtime', () => ({ createSeatFeed: vi.fn() }));

const dates = ['2030-03-03', '2030-03-04', '2030-03-05', '2030-03-06', '2030-03-07', '2030-03-08', '2030-03-09'];

function listing(date: string): ShowtimesResponse {
  const detail = screeningDetail();
  const base = detail.screening;
  return {
    date,
    dates,
    movies: [
      {
        movie: detail.movie,
        showtimes: [
          { ...base, id: 42, startsAtLocal: `${date}T13:00:00`, isMatinee: true },
          { ...base, id: 43, startsAtLocal: `${date}T19:00:00`, seatsAvailable: 0 },
        ],
      },
      {
        movie: { ...detail.movie, id: 8, title: 'Ferns & Fireworks', genre: 'Comedy', posterPalette: 'moss', posterMotif: 'sun' },
        showtimes: [{ ...base, id: 44, movieId: 8, startsAtLocal: `${date}T20:45:00`, seatsAvailable: 3 }],
      },
    ],
  };
}

describe('HomePage', () => {
  it('lists movies with showtimes, matinee and availability labels', async () => {
    mockFetch({ 'GET /api/showtimes': () => ({ body: listing(dates[0]) }) });
    renderApp('/');

    const times = await screen.findByRole('list', { name: 'Showtimes for Orbit of Small Hours' });
    expect(within(times).getByRole('link', { name: '1:00 PM in Auditorium 3, matinee, 6 seats left' })).toHaveAttribute('href', '/screenings/42');
    expect(within(times).getByRole('link', { name: '7:00 PM in Auditorium 3, sold out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Today/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads another date and filters by genre', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/showtimes': (call) => {
        const date = new URL(call.url, 'http://localhost').searchParams.get('date') ?? dates[0];
        return { body: listing(date) };
      },
    });
    renderApp('/');

    await screen.findByRole('heading', { name: 'Ferns & Fireworks' });
    await user.click(screen.getByRole('button', { name: /Mar 5/ }));
    expect(await screen.findByRole('button', { name: /Mar 5/ })).toHaveAttribute('aria-pressed', 'true');
    expect(calls.at(-1)?.url).toBe('/api/showtimes?date=2030-03-05');

    await user.click(screen.getByRole('button', { name: 'Comedy' }));
    expect(screen.getByRole('heading', { name: 'Ferns & Fireworks' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Orbit of Small Hours' })).not.toBeInTheDocument();
  });

  it('opens on the next day with showtimes when today has none left, and still lets the user pick today', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/showtimes': (call) => {
        const requested = new URL(call.url, 'http://localhost').searchParams.get('date');
        if (requested === null) {
          // The server picked tomorrow because today's last show has started.
          return { body: listing(dates[1]) };
        }
        return { body: requested === dates[0] ? { date: dates[0], dates, movies: [] } : listing(requested) };
      },
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Orbit of Small Hours' })).toBeInTheDocument();
    expect(calls[0].url).toBe('/api/showtimes');
    expect(screen.getByRole('button', { name: /Mar 4/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Today/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('note')).toHaveTextContent("Today's showtimes have all started");

    await user.click(screen.getByRole('button', { name: /Today/ }));

    expect(await screen.findByText('No more showtimes on this day')).toBeInTheDocument();
    expect(calls.at(-1)?.url).toBe('/api/showtimes?date=2030-03-03');
    expect(screen.getByRole('button', { name: /Today/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('does not show the skipped-today note when today still has showtimes', async () => {
    mockFetch({ 'GET /api/showtimes': () => ({ body: listing(dates[0]) }) });
    renderApp('/');

    await screen.findByRole('heading', { name: 'Orbit of Small Hours' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button when the API is down', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockFetch({
      'GET /api/showtimes': () => (fail ? { status: 500, body: { status: 500, title: 'Server error' } } : { body: listing(dates[0]) }),
    });
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Orbit of Small Hours' })).toBeInTheDocument();
  });
});

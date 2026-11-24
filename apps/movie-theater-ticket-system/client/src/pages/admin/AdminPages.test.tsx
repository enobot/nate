import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminMovie } from '../../api/types';
import { mockFetch, renderApp } from '../../test/utils';
import { validateMovie } from './AdminMoviesPage';

vi.mock('../../api/realtime', () => ({ createSeatFeed: vi.fn() }));

const movie: AdminMovie = {
  id: 1,
  title: 'Orbit of Small Hours',
  tagline: '',
  synopsis: 'A fictional synopsis for testing.',
  genre: 'Sci-Fi',
  rating: 'PG-13',
  runtimeMinutes: 128,
  posterPalette: 'violet',
  posterMotif: 'orbit',
  isActive: true,
  upcomingScreenings: 5,
  totalScreenings: 9,
};

describe('admin sign-in', () => {
  it('shows the sign-in form when there is no admin session', async () => {
    mockFetch({ 'GET /api/admin/auth/me': () => ({ status: 401 }) });
    renderApp('/admin');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the server error for a wrong password', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /api/admin/auth/me': () => ({ status: 401 }),
      'POST /api/admin/auth/login': () => ({ status: 401, body: { status: 401, title: 'Sign-in failed', detail: 'The username or password is incorrect.' } }),
    });
    renderApp('/admin');

    await user.type(await screen.findByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The username or password is incorrect.');
  });

  it('opens the dashboard after signing in', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/admin/auth/me': () => ({ status: 401 }),
      'POST /api/admin/auth/login': () => ({ body: { username: 'admin' } }),
      'GET /api/admin/reports/sales': () => ({
        body: {
          from: '2030-02-01', to: '2030-03-02', paidOrders: 6, cancelledOrders: 1, ticketsSold: 14,
          ticketRevenueCents: 20000, concessionRevenueCents: 5000, taxCents: 388, grossCents: 25388, refundedCents: 1600,
          byMovie: [{ movieId: 1, title: 'Orbit of Small Hours', ticketsSold: 4, ticketRevenueCents: 6000 }],
          concessions: [], upcomingOccupancy: [],
        },
      }),
    });
    renderApp('/admin');

    await user.type(await screen.findByLabelText('Password'), 'LocalDemo-2026');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Sales dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('$253.88')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/admin/auth/login')?.body).toEqual({ username: 'admin', password: 'LocalDemo-2026' });
  });
});

describe('admin movies', () => {
  it('validates movie fields', () => {
    const errors = validateMovie({ ...movie, title: '', synopsis: 'short', genre: '', runtimeMinutes: 5 });
    expect(Object.keys(errors).sort()).toEqual(['genre', 'runtimeMinutes', 'synopsis', 'title']);
  });

  it('adds a movie and shows server validation errors next to the fields', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const { calls } = mockFetch({
      'GET /api/admin/auth/me': () => ({ body: { username: 'admin' } }),
      'GET /api/admin/movies': () => ({ body: [movie] }),
      'POST /api/admin/movies': () => {
        attempt++;
        return attempt === 1
          ? { status: 409, body: { status: 409, code: 'duplicate-title', detail: 'A movie called "Orbit of Small Hours" already exists.' } }
          : { status: 201, body: { ...movie, id: 2, title: 'Paper Lantern Parade' } };
      },
    });
    renderApp('/admin/movies');

    await user.click(await screen.findByRole('button', { name: 'Add movie' }));
    const form = screen.getByRole('form', { name: 'Add a movie' });
    await user.type(within(form).getByLabelText('Title'), 'Orbit of Small Hours');
    await user.type(within(form).getByLabelText('Synopsis'), 'A fictional synopsis for testing.');
    await user.type(within(form).getByLabelText('Genre'), 'Drama');
    await user.click(within(form).getByRole('button', { name: 'Add movie' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('already exists');

    await user.clear(within(form).getByLabelText('Title'));
    await user.type(within(form).getByLabelText('Title'), 'Paper Lantern Parade');
    await user.click(within(form).getByRole('button', { name: 'Add movie' }));

    expect(await screen.findByText('Saved "Paper Lantern Parade".')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/admin/movies').at(-1)?.body).toMatchObject({
      title: 'Paper Lantern Parade',
      genre: 'Drama',
      rating: 'PG-13',
      runtimeMinutes: 110,
    });
  });
});

describe('admin screenings', () => {
  it('shows the overlap message from the server', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /api/admin/auth/me': () => ({ body: { username: 'admin' } }),
      'GET /api/admin/screenings': () => ({ body: [] }),
      'GET /api/admin/movies': () => ({ body: [movie] }),
      'GET /api/admin/auditoriums': () => ({ body: [{ id: 1, name: 'Auditorium 1', rowCount: 8, seatsPerRow: 14, capacity: 112 }] }),
      'POST /api/admin/screenings': () => ({
        status: 409,
        body: { status: 409, code: 'screening-overlap', detail: 'Auditorium 1 is booked for "Saltwind Station" from Tue Mar 3, 7:00 PM until 9:07 PM.' },
      }),
    });
    renderApp('/admin/screenings');

    await user.click(await screen.findByRole('button', { name: 'Schedule a screening' }));
    await user.selectOptions(await screen.findByLabelText('Movie'), '1');
    await user.selectOptions(await screen.findByLabelText('Auditorium'), '1');
    await user.type(screen.getByLabelText('Starts at'), '2030-03-03T19:30');
    await user.click(screen.getByRole('button', { name: 'Add screening' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Auditorium 1 is booked for "Saltwind Station"');
  });
});

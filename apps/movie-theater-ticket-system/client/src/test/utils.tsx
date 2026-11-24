import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { AppProviders, AppRoutes } from '../App';
import type { Cart, Order, OrderQuote, PricingInfo, ScreeningDetail, Seat } from '../api/types';

export interface FetchCall {
  method: string;
  url: string;
  body: unknown;
}

type Handler = (call: FetchCall) => { status?: number; body?: unknown } | undefined;

/**
 * Replaces window.fetch with a small router. Only the network is faked: every component,
 * hook, and the cart state run for real.
 */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call = { method, url, body };
    calls.push(call);
    const path = url.split('?')[0];
    const handler = routes[`${method} ${path}`] ?? routes[`${method} ${url}`];
    const result = handler?.(call) ?? { status: 404, body: { title: 'Not found', detail: `No mock for ${method} ${url}` } };
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

export const TOKEN = 'a'.repeat(32);

export function seedCart(ticketTypes: Record<number, string> = {}, concessions: Record<number, number> = {}) {
  window.localStorage.setItem('mtts.cart', JSON.stringify({ token: TOKEN, ticketTypes, concessions }));
}

// ---- Sample data (fictional) ----

export function seats(): Seat[] {
  const list: Seat[] = [];
  for (const row of ['A', 'B']) {
    for (let n = 1; n <= 4; n++) {
      list.push({
        id: (row === 'A' ? 0 : 4) + n,
        row,
        number: n,
        label: `${row}${n}`,
        seatType: row === 'A' && n === 1 ? 'Accessible' : row === 'B' && n >= 2 && n <= 3 ? 'Premium' : 'Standard',
        status: row === 'A' && n === 4 ? 'Sold' : row === 'B' && n === 4 ? 'Held' : 'Available',
      });
    }
  }
  return list;
}

export function screeningDetail(overrides: Partial<ScreeningDetail> = {}): ScreeningDetail {
  return {
    screening: {
      id: 42,
      movieId: 7,
      startsAtUtc: '2030-03-03T19:00:00Z',
      startsAtLocal: '2030-03-03T19:00:00',
      endsAtLocal: '2030-03-03T21:00:00',
      auditoriumId: 3,
      auditoriumName: 'Auditorium 3',
      isMatinee: false,
      seatsAvailable: 6,
      capacity: 8,
    },
    movie: {
      id: 7,
      title: 'Orbit of Small Hours',
      tagline: 'Some signals only arrive after midnight.',
      synopsis: 'A fictional synopsis.',
      genre: 'Sci-Fi',
      rating: 'PG-13',
      runtimeMinutes: 120,
      posterPalette: 'violet',
      posterMotif: 'orbit',
    },
    auditorium: { id: 3, name: 'Auditorium 3', rowCount: 2, seatsPerRow: 4, aisleAfter: [2] },
    seats: seats(),
    salesOpen: true,
    serverTimeUtc: new Date().toISOString(),
    ...overrides,
  };
}

export function pricingInfo(): PricingInfo {
  return {
    adultCents: 1450,
    childCents: 1050,
    seniorCents: 1150,
    matineeDiscountCents: 300,
    matineeCutoffHour: 16,
    premiumSurchargeCents: 350,
    salesTaxRate: 0.0775,
    taxTickets: false,
    holdMinutes: 10,
    maxSeatsPerOrder: 10,
    maxConcessionQuantity: 10,
    cancellationCutoffMinutes: 30,
    concessions: [
      { id: 1, name: 'Popcorn (Small)', description: 'Fresh popped.', category: 'Snack', priceCents: 650 },
      { id: 6, name: 'Fountain Drink (Medium)', description: 'Soda or iced tea.', category: 'Drink', priceCents: 550 },
    ],
  };
}

export function cartWith(seatIds: number[], screeningId = 42): Cart {
  const all = seats();
  return {
    cartToken: TOKEN,
    screeningId: seatIds.length ? screeningId : null,
    holds: seatIds.map((id) => {
      const s = all.find((x) => x.id === id)!;
      return { seatId: s.id, label: s.label, row: s.row, number: s.number, seatType: s.seatType };
    }),
    expiresAtUtc: seatIds.length ? new Date(Date.now() + 9 * 60_000).toISOString() : null,
    serverTimeUtc: new Date().toISOString(),
  };
}

export function quoteFor(tickets: { seatId: number; ticketType: string }[], concessions: { itemId: number; quantity: number }[] = []): OrderQuote {
  const all = seats();
  const base: Record<string, number> = { Adult: 1450, Child: 1050, Senior: 1150 };
  const items: Record<number, { name: string; price: number }> = { 1: { name: 'Popcorn (Small)', price: 650 }, 6: { name: 'Fountain Drink (Medium)', price: 550 } };
  const lines = tickets.map((t) => {
    const seat = all.find((s) => s.id === t.seatId)!;
    const surcharge = seat.seatType === 'Premium' ? 350 : 0;
    return {
      seatId: t.seatId,
      seatLabel: seat.label,
      seatType: seat.seatType,
      ticketType: t.ticketType as 'Adult',
      basePriceCents: base[t.ticketType],
      discountCents: 0,
      surchargeCents: surcharge,
      priceCents: base[t.ticketType] + surcharge,
    };
  });
  const concessionLines = concessions.map((c) => ({
    itemId: c.itemId,
    name: items[c.itemId].name,
    unitPriceCents: items[c.itemId].price,
    quantity: c.quantity,
    lineTotalCents: items[c.itemId].price * c.quantity,
  }));
  const ticketSubtotal = lines.reduce((sum, l) => sum + l.priceCents, 0);
  const concessionSubtotal = concessionLines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const tax = Math.round(concessionSubtotal * 0.0775);
  return {
    tickets: lines,
    concessions: concessionLines,
    isMatinee: false,
    ticketSubtotalCents: ticketSubtotal,
    concessionSubtotalCents: concessionSubtotal,
    discountCents: 0,
    salesTaxRate: 0.0775,
    taxCents: tax,
    totalCents: ticketSubtotal + concessionSubtotal + tax,
  };
}

export function sampleOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderNumber: 'MT-7K3QX9AB',
    status: 'Paid',
    customerName: 'Avery Quinn',
    customerEmail: 'avery@example.com',
    screeningId: 42,
    movieTitle: 'Orbit of Small Hours',
    posterPalette: 'violet',
    posterMotif: 'orbit',
    auditoriumName: 'Auditorium 3',
    startsAtUtc: '2030-03-03T19:00:00Z',
    startsAtLocal: '2030-03-03T19:00:00',
    isMatinee: false,
    tickets: [
      { seatId: 2, seatLabel: 'A2', seatType: 'Standard', ticketType: 'Adult', basePriceCents: 1450, discountCents: 0, surchargeCents: 0, priceCents: 1450, isCancelled: false },
    ],
    concessions: [],
    ticketSubtotalCents: 1450,
    concessionSubtotalCents: 0,
    discountCents: 0,
    taxCents: 0,
    totalCents: 1450,
    refundedCents: 0,
    paymentReference: 'SIM-ABC123DEF456',
    createdAtUtc: '2030-03-01T18:00:00Z',
    cancelledAtUtc: null,
    cancelledBy: null,
    cancellationReason: null,
    canCancel: true,
    cancelDeadlineUtc: '2030-03-03T18:30:00Z',
    ...overrides,
  };
}

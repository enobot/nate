import type {
  AdminMovie,
  AdminOrderSummary,
  AdminScreening,
  AdminUser,
  Auditorium,
  Cart,
  CheckoutRequest,
  ConcessionSelection,
  MovieDetailResponse,
  MovieInput,
  Order,
  OrderQuote,
  OrderStatus,
  Paged,
  PricingInfo,
  SalesReport,
  ScreeningDetail,
  ScreeningInput,
  ShowtimesResponse,
  TicketSelection,
} from './types';

/** An error response from the API, parsed from RFC 9457 ProblemDetails. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, message: string, code?: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

interface ProblemBody {
  title?: string;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'Some of the information was not valid.',
  401: 'Please sign in to continue.',
  403: 'You do not have access to that.',
  404: 'We could not find that.',
  409: 'That change conflicts with something that just happened. Refresh and try again.',
  429: 'Too many attempts. Wait a minute and try again.',
  500: 'The server ran into a problem. Please try again.',
};

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'Could not reach the server. Check that it is running and try again.', 'network');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    const problem = (data ?? {}) as ProblemBody;
    const firstFieldError = problem.errors ? Object.values(problem.errors).flat()[0] : undefined;
    const message =
      problem.detail ?? firstFieldError ?? problem.title ?? FALLBACK_MESSAGES[response.status] ?? `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, problem.code, problem.errors ?? {});
  }

  return data as T;
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const del = <T>(path: string) => request<T>('DELETE', path);

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  showtimes: (date?: string, signal?: AbortSignal) => get<ShowtimesResponse>(`/api/showtimes${query({ date })}`, signal),
  movie: (id: number, signal?: AbortSignal) => get<MovieDetailResponse>(`/api/movies/${id}`, signal),
  screening: (id: number, signal?: AbortSignal) => get<ScreeningDetail>(`/api/screenings/${id}`, signal),
  pricing: (signal?: AbortSignal) => get<PricingInfo>('/api/pricing', signal),

  createCart: () => post<Cart>('/api/carts'),
  cart: (token: string) => get<Cart>(`/api/carts/${token}`),
  holdSeat: (token: string, screeningId: number, seatId: number) => post<Cart>(`/api/carts/${token}/holds`, { screeningId, seatId }),
  releaseSeat: (token: string, seatId: number) => del<Cart>(`/api/carts/${token}/holds/${seatId}`),
  clearCart: (token: string) => del<void>(`/api/carts/${token}`),

  quote: (screeningId: number, tickets: TicketSelection[], concessions: ConcessionSelection[]) =>
    post<OrderQuote>('/api/orders/quote', { screeningId, tickets, concessions }),
  checkout: (body: CheckoutRequest) => post<Order>('/api/orders', body),
  orderHistory: (orderNumber: string, email: string) => post<{ orders: Order[] }>('/api/orders/history', { orderNumber, email }),
  cancelOrder: (orderNumber: string, email: string) => post<Order>(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, { email }),

  admin: {
    me: () => get<AdminUser>('/api/admin/auth/me'),
    login: (username: string, password: string) => post<AdminUser>('/api/admin/auth/login', { username, password }),
    logout: () => post<void>('/api/admin/auth/logout'),
    movies: () => get<AdminMovie[]>('/api/admin/movies'),
    createMovie: (input: MovieInput) => post<AdminMovie>('/api/admin/movies', input),
    updateMovie: (id: number, input: MovieInput) => put<AdminMovie>(`/api/admin/movies/${id}`, input),
    deleteMovie: (id: number) => del<void>(`/api/admin/movies/${id}`),
    auditoriums: () => get<Auditorium[]>('/api/admin/auditoriums'),
    screenings: (from: string, to: string, movieId?: number) => get<AdminScreening[]>(`/api/admin/screenings${query({ from, to, movieId })}`),
    createScreening: (input: ScreeningInput) => post<AdminScreening>('/api/admin/screenings', input),
    updateScreening: (id: number, input: ScreeningInput) => put<AdminScreening>(`/api/admin/screenings/${id}`, input),
    deleteScreening: (id: number) => del<void>(`/api/admin/screenings/${id}`),
    orders: (params: { status?: OrderStatus; search?: string; page: number; pageSize: number }) =>
      get<Paged<AdminOrderSummary>>(`/api/admin/orders${query(params)}`),
    order: (orderNumber: string) => get<Order>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`),
    cancelOrder: (orderNumber: string, reason: string) =>
      post<Order>(`/api/admin/orders/${encodeURIComponent(orderNumber)}/cancel`, { reason }),
    salesReport: (from: string, to: string) => get<SalesReport>(`/api/admin/reports/sales${query({ from, to })}`),
  },
};

// TypeScript shapes of the JSON returned by the ASP.NET Core API (see src/MovieTheater.Api/Contracts).
// Money is always whole cents. "Local" times are theater wall-clock times without an offset.

export type SeatType = 'Standard' | 'Premium' | 'Accessible';
export type SeatStatus = 'Available' | 'Held' | 'Sold';
export type TicketType = 'Adult' | 'Child' | 'Senior';
export type OrderStatus = 'Paid' | 'Cancelled';
export type ConcessionCategory = 'Snack' | 'Drink' | 'Combo';

export const TICKET_TYPES: TicketType[] = ['Adult', 'Child', 'Senior'];

export interface Movie {
  id: number;
  title: string;
  tagline: string;
  synopsis: string;
  genre: string;
  rating: string;
  runtimeMinutes: number;
  posterPalette: string;
  posterMotif: string;
}

export interface Showtime {
  id: number;
  movieId: number;
  startsAtUtc: string;
  startsAtLocal: string;
  endsAtLocal: string;
  auditoriumId: number;
  auditoriumName: string;
  isMatinee: boolean;
  seatsAvailable: number;
  capacity: number;
}

export interface MovieShowtimes {
  movie: Movie;
  showtimes: Showtime[];
}

export interface ShowtimesResponse {
  date: string;
  dates: string[];
  movies: MovieShowtimes[];
}

export interface MovieDetailResponse {
  movie: Movie;
  showtimes: Showtime[];
}

export interface Seat {
  id: number;
  row: string;
  number: number;
  label: string;
  seatType: SeatType;
  status: SeatStatus;
}

export interface AuditoriumLayout {
  id: number;
  name: string;
  rowCount: number;
  seatsPerRow: number;
  aisleAfter: number[];
}

export interface ScreeningDetail {
  screening: Showtime;
  movie: Movie;
  auditorium: AuditoriumLayout;
  seats: Seat[];
  salesOpen: boolean;
  serverTimeUtc: string;
}

export interface ConcessionItem {
  id: number;
  name: string;
  description: string;
  category: ConcessionCategory;
  priceCents: number;
}

export interface PricingInfo {
  adultCents: number;
  childCents: number;
  seniorCents: number;
  matineeDiscountCents: number;
  matineeCutoffHour: number;
  premiumSurchargeCents: number;
  salesTaxRate: number;
  taxTickets: boolean;
  holdMinutes: number;
  maxSeatsPerOrder: number;
  maxConcessionQuantity: number;
  cancellationCutoffMinutes: number;
  concessions: ConcessionItem[];
}

export interface CartHold {
  seatId: number;
  label: string;
  row: string;
  number: number;
  seatType: SeatType;
}

export interface Cart {
  cartToken: string;
  screeningId: number | null;
  holds: CartHold[];
  expiresAtUtc: string | null;
  serverTimeUtc: string;
}

export interface TicketSelection {
  seatId: number;
  ticketType: TicketType;
}

export interface ConcessionSelection {
  itemId: number;
  quantity: number;
}

export interface TicketLineQuote {
  seatId: number;
  seatLabel: string;
  seatType: SeatType;
  ticketType: TicketType;
  basePriceCents: number;
  discountCents: number;
  surchargeCents: number;
  priceCents: number;
}

export interface ConcessionLineQuote {
  itemId: number;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderQuote {
  tickets: TicketLineQuote[];
  concessions: ConcessionLineQuote[];
  isMatinee: boolean;
  ticketSubtotalCents: number;
  concessionSubtotalCents: number;
  discountCents: number;
  salesTaxRate: number;
  taxCents: number;
  totalCents: number;
}

export interface OrderTicket {
  seatId: number;
  seatLabel: string;
  seatType: SeatType;
  ticketType: TicketType;
  basePriceCents: number;
  discountCents: number;
  surchargeCents: number;
  priceCents: number;
  isCancelled: boolean;
}

export interface OrderConcession {
  itemId: number;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Order {
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  screeningId: number;
  movieTitle: string;
  posterPalette: string;
  posterMotif: string;
  auditoriumName: string;
  startsAtUtc: string;
  startsAtLocal: string;
  isMatinee: boolean;
  tickets: OrderTicket[];
  concessions: OrderConcession[];
  ticketSubtotalCents: number;
  concessionSubtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  refundedCents: number;
  paymentReference: string;
  createdAtUtc: string;
  cancelledAtUtc: string | null;
  cancelledBy: 'Customer' | 'Admin' | null;
  cancellationReason: string | null;
  canCancel: boolean;
  cancelDeadlineUtc: string;
}

export interface CheckoutRequest {
  cartToken: string;
  customerName: string;
  customerEmail: string;
  tickets: TicketSelection[];
  concessions: ConcessionSelection[];
  simulateDecline: boolean;
}

// ---- Admin ----

export interface AdminUser {
  username: string;
}

export interface AdminMovie extends Movie {
  isActive: boolean;
  upcomingScreenings: number;
  totalScreenings: number;
}

export interface MovieInput {
  title: string;
  tagline: string;
  synopsis: string;
  genre: string;
  rating: string;
  runtimeMinutes: number;
  posterPalette: string;
  posterMotif: string;
  isActive: boolean;
}

export interface Auditorium {
  id: number;
  name: string;
  rowCount: number;
  seatsPerRow: number;
  capacity: number;
}

export interface AdminScreening {
  id: number;
  movieId: number;
  movieTitle: string;
  auditoriumId: number;
  auditoriumName: string;
  startsAtUtc: string;
  startsAtLocal: string;
  endsAtLocal: string;
  isMatinee: boolean;
  ticketsSold: number;
  seatsHeld: number;
  capacity: number;
  hasOrders: boolean;
  hasStarted: boolean;
}

export interface ScreeningInput {
  movieId: number;
  auditoriumId: number;
  startsAtLocal: string;
}

export interface AdminOrderSummary {
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  screeningId: number;
  movieTitle: string;
  auditoriumName: string;
  startsAtLocal: string;
  ticketCount: number;
  totalCents: number;
  createdAtUtc: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface SalesReport {
  from: string;
  to: string;
  paidOrders: number;
  cancelledOrders: number;
  ticketsSold: number;
  ticketRevenueCents: number;
  concessionRevenueCents: number;
  taxCents: number;
  grossCents: number;
  refundedCents: number;
  byMovie: { movieId: number; title: string; ticketsSold: number; ticketRevenueCents: number }[];
  concessions: { itemId: number; name: string; quantity: number; revenueCents: number }[];
  upcomingOccupancy: {
    screeningId: number;
    movieTitle: string;
    auditoriumName: string;
    startsAtLocal: string;
    ticketsSold: number;
    capacity: number;
  }[];
}

export interface SeatChange {
  seatId: number;
  status: SeatStatus;
}

export interface SeatsChangedMessage {
  screeningId: number;
  changes: SeatChange[];
}

import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useParams } from 'react-router';
import { Layout } from './components/Layout';
import { AboutPage, NotFoundPage } from './pages/AboutPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminMoviesPage } from './pages/admin/AdminMoviesPage';
import { AdminReservationsPage } from './pages/admin/AdminReservationsPage';
import { AdminScreeningsPage } from './pages/admin/AdminScreeningsPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { HomePage } from './pages/HomePage';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { SeatSelectionPage } from './pages/SeatSelectionPage';
import { CartProvider } from './state/cart';
import { ToastProvider } from './state/toast';

/** Remount the seat page per screening so its live connection and state start fresh. */
function KeyedSeatSelection() {
  const { screeningId } = useParams();
  return <SeatSelectionPage key={screeningId} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/movies/:movieId" element={<MovieDetailPage />} />
      <Route path="/screenings/:screeningId" element={<KeyedSeatSelection />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/confirmation/:orderNumber" element={<ConfirmationPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="movies" element={<AdminMoviesPage />} />
        <Route path="screenings" element={<AdminScreeningsPage />} />
        <Route path="reservations" element={<AdminReservationsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/** Providers shared by the real app and the page-level tests. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <Layout>{children}</Layout>
      </CartProvider>
    </ToastProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}

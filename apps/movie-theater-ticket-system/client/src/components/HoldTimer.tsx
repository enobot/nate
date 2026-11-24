import { useEffect, useRef } from 'react';
import { useNow } from '../hooks/useNow';
import { formatCountdown } from '../lib/format';
import { remainingMs, useCart } from '../state/cart';
import { useToast } from '../state/toast';

/**
 * Countdown for the cart's seat hold. When it reaches zero the cart is refreshed from the
 * server, which has already released the seats.
 */
export function HoldTimer({ compact = false }: { compact?: boolean }) {
  const cart = useCart();
  const { notify } = useToast();
  const active = cart.holds.length > 0 && cart.expiresAtMs !== null;
  const now = useNow(active);
  const left = remainingMs(cart, now);
  const expired = active && left !== null && left <= 0;
  const refreshedFor = useRef<number | null>(null);

  useEffect(() => {
    if (expired && refreshedFor.current !== cart.expiresAtMs) {
      refreshedFor.current = cart.expiresAtMs;
      notify('Your seat hold expired, so those seats were released. Choose seats again to continue.', 'error');
      void cart.refresh();
    }
  }, [expired, cart, notify]);

  if (!active || left === null) {
    return null;
  }

  const urgent = left < 2 * 60 * 1000;
  const minutes = Math.max(0, Math.ceil(left / 60000));

  return (
    <div
      role="timer"
      aria-label={`Seats held for about ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums ${
        urgent ? 'border-velvet-500/60 bg-velvet-500/15 text-velvet-400' : 'border-marquee-500/40 bg-marquee-500/10 text-marquee-300'
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="8.5" r="5.8" />
        <path d="M8 5.3v3.4l2.2 1.4M6.3 1.5h3.4" strokeLinecap="round" />
      </svg>
      {compact ? formatCountdown(left) : <>Seats held for {formatCountdown(left)}</>}
    </div>
  );
}

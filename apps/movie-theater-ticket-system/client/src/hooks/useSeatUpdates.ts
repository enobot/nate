import { useEffect, useRef, useState } from 'react';
import { createSeatFeed } from '../api/realtime';
import type { SeatChange } from '../api/types';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** How often the seat map is refetched while the live connection is down. */
export const FALLBACK_REFRESH_MS = 15_000;
const RESTART_DELAY_MS = 30_000;

/**
 * Subscribes to live seat changes for one screening.
 *
 * - `onChanges` receives each pushed batch of seat changes.
 * - `onResync` is called when pushes may have been missed (after a reconnect), and on a
 *   timer while the connection is down, so the seat map never stays stale for long.
 */
export function useSeatUpdates(
  screeningId: number | null,
  onChanges: (changes: SeatChange[]) => void,
  onResync: () => void,
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const handlers = useRef({ onChanges, onResync });

  useEffect(() => {
    handlers.current = { onChanges, onResync };
  });

  useEffect(() => {
    if (screeningId === null) {
      return;
    }

    let disposed = false;
    let restartTimer: number | undefined;
    const feed = createSeatFeed();

    const connect = async () => {
      try {
        await feed.start();
        await feed.join(screeningId);
        if (!disposed) {
          setStatus('live');
          handlers.current.onResync();
        }
      } catch {
        if (!disposed) {
          setStatus('offline');
          restartTimer = window.setTimeout(connect, RESTART_DELAY_MS);
        }
      }
    };

    feed.onSeatsChanged((message) => {
      if (message.screeningId === screeningId) {
        handlers.current.onChanges(message.changes);
      }
    });
    feed.onReconnecting(() => {
      if (!disposed) setStatus('reconnecting');
    });
    feed.onReconnected(() => {
      if (disposed) return;
      // Group membership is per connection, so join again after reconnecting.
      feed.join(screeningId).then(
        () => {
          if (!disposed) {
            setStatus('live');
            handlers.current.onResync();
          }
        },
        () => {
          if (!disposed) setStatus('offline');
        },
      );
    });
    feed.onClose(() => {
      if (!disposed) {
        setStatus('offline');
        restartTimer = window.setTimeout(connect, RESTART_DELAY_MS);
      }
    });

    void connect();

    return () => {
      disposed = true;
      window.clearTimeout(restartTimer);
      void feed.stop().catch(() => undefined);
    };
  }, [screeningId]);

  // Polling fallback: only runs while live updates are unavailable.
  useEffect(() => {
    if (status !== 'offline' && status !== 'reconnecting') {
      return;
    }
    const id = window.setInterval(() => handlers.current.onResync(), FALLBACK_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [status]);

  return status;
}

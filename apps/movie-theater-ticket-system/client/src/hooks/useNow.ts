import { useEffect, useState } from 'react';

/** Current time in milliseconds, refreshed every `intervalMs` while `active` is true. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}

/** Sets document.title for the current page. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Movie Theater Ticket System` : 'Movie Theater Ticket System';
  }, [title]);
}

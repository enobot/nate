import { useCallback, useEffect, useRef, useState } from 'react';

interface State<T> {
  requestKey: string | null;
  data: T | undefined;
  error: Error | undefined;
}

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Fetch again with the same key (keeps showing the current data meanwhile). */
  reload: () => void;
  /** Replace the data locally, e.g. after a live update or a successful mutation. */
  setData: (update: (current: T | undefined) => T | undefined) => void;
}

/**
 * Loads data for a key and cancels stale requests when the key changes, so a slow response
 * for an old key can never overwrite newer data. Pass `null` to skip loading.
 */
export function useApi<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>): ApiState<T> {
  const [state, setState] = useState<State<T>>({ requestKey: null, data: undefined, error: undefined });
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const requestKey = key === null ? null : `${key}#${version}`;

  useEffect(() => {
    if (requestKey === null) {
      return;
    }

    const controller = new AbortController();
    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setState({ requestKey, data, error: undefined });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState((current) => ({
            requestKey,
            data: current.data,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      },
    );

    return () => controller.abort();
  }, [requestKey]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (update: (current: T | undefined) => T | undefined) => setState((current) => ({ ...current, data: update(current.data) })),
    [],
  );

  return {
    data: state.data,
    error: state.requestKey === requestKey ? state.error : undefined,
    loading: requestKey !== null && state.requestKey !== requestKey,
    reload,
    setData,
  };
}

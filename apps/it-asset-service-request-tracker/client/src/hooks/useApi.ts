import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from '../api/client'

export interface ApiState<T> {
  data: T | undefined
  error: ApiError | undefined
  loading: boolean
  reload: () => void
}

/**
 * Loads data when the component mounts and whenever `deps` change. Earlier requests are
 * aborted so a slow response can never overwrite a newer one.
 */
export function useApi<T>(loader: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): ApiState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError>()
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(toApiError(err))
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, error, loading, reload }
}

/** Returns `value` after it has stopped changing for `delayMs`. Used for search boxes. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/**
 * Wraps a write operation with a pending flag so buttons can be disabled while it runs,
 * which stops double-clicks from sending the same request twice.
 */
export function useMutation<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiError>()
  const pendingRef = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (pendingRef.current) return undefined
      pendingRef.current = true
      setPending(true)
      setError(undefined)
      try {
        return await action(...args)
      } catch (err) {
        setError(toApiError(err))
        return undefined
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [action],
  )

  return { run, pending, error, setError }
}

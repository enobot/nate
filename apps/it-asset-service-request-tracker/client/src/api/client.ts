/**
 * Small fetch wrapper. Every non-2xx response is turned into an ApiError that carries the
 * RFC 9457 ProblemDetails fields the API returns (title, detail, and per-field errors).
 */

export interface ProblemDetails {
  title?: string
  status?: number
  detail?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail?: string
  /** Field errors keyed by the request property name, e.g. { assetTag: ['...'] }. */
  readonly fieldErrors: Record<string, string[]>

  constructor(status: number, title: string, detail?: string, fieldErrors: Record<string, string[]> = {}) {
    super(detail ?? title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.fieldErrors = fieldErrors
  }

  /** A single sentence suitable for an alert box. */
  get summary(): string {
    if (this.detail) return this.detail
    const first = Object.values(this.fieldErrors)[0]?.[0]
    return first ?? this.title
  }
}

/** ASP.NET Core reports JSON conversion errors with keys like "$.type". Normalize to "type". */
function normalizeFieldKey(key: string): string {
  const trimmed = key.startsWith('$.') ? key.slice(2) : key
  return trimmed.length > 0 ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed
}

function normalizeErrors(errors: Record<string, string[]> | undefined): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [key, messages] of Object.entries(errors ?? {})) {
    const normalized = normalizeFieldKey(key)
    result[normalized] = [...(result[normalized] ?? []), ...messages]
  }
  return result
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options
  let response: Response
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Network error', 'Could not reach the server. Check that the API is running and try again.')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
  }

  if (!response.ok) {
    const problem = (data ?? {}) as ProblemDetails
    throw new ApiError(
      response.status,
      problem.title ?? (response.statusText || `Request failed (${response.status})`),
      problem.detail,
      normalizeErrors(problem.errors),
    )
  }

  return data as T
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) return new ApiError(0, 'Unexpected error', error.message)
  return new ApiError(0, 'Unexpected error')
}

/** Builds a query string, skipping empty values. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

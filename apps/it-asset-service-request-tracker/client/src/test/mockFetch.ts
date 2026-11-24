import { vi } from 'vitest'

/**
 * Replaces the global fetch with a small router so tests exercise the real components and the
 * real API client, and only the network is faked. Unmatched requests fail the test loudly.
 */
export interface MockRoute {
  method?: string
  path: string | RegExp
  status?: number
  body?: unknown
  /** Optional handler to inspect the request or build a dynamic response. */
  handle?: (request: { url: string; method: string; body: unknown }) => { status?: number; body?: unknown }
}

export interface RecordedCall {
  url: string
  method: string
  body: unknown
}

export function mockFetch(routes: MockRoute[]) {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body })
    const route = routes.find(
      (r) =>
        (r.method ?? 'GET').toUpperCase() === method &&
        (typeof r.path === 'string' ? url === r.path || url.split('?')[0] === r.path : r.path.test(url)),
    )
    if (!route) throw new Error(`Unexpected request in test: ${method} ${url}`)
    const result = route.handle ? route.handle({ url, method, body }) : { status: route.status, body: route.body }
    const status = result.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? null), {
      status,
      headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export const technicians = [
  {
    id: 1,
    firstName: 'Avery',
    lastName: 'Alvarez',
    fullName: 'Avery Alvarez',
    email: 'avery.alvarez@aldercreek.example',
    department: 'IT Services',
    jobTitle: 'Network Analyst',
    isTechnician: true,
    assignedAssetCount: 0,
  },
  {
    id: 2,
    firstName: 'Jordan',
    lastName: 'Hoang',
    fullName: 'Jordan Hoang',
    email: 'jordan.hoang@aldercreek.example',
    department: 'IT Services',
    jobTitle: 'Desktop Support Technician',
    isTechnician: true,
    assignedAssetCount: 1,
  },
]

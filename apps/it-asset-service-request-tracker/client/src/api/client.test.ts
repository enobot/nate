import { describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/mockFetch'
import { ApiError, apiRequest, query } from './client'

describe('apiRequest', () => {
  it('sends JSON bodies and returns parsed JSON', async () => {
    const { calls, fetchMock } = mockFetch([{ method: 'POST', path: '/api/things', status: 201, body: { id: 7 } }])
    const result = await apiRequest<{ id: number }>('/api/things', { method: 'POST', body: { name: 'x' } })
    expect(result).toEqual({ id: 7 })
    expect(calls[0].body).toEqual({ name: 'x' })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('turns ProblemDetails into an ApiError with normalized field keys', async () => {
    mockFetch([
      {
        method: 'POST',
        path: '/api/assets',
        status: 400,
        body: {
          title: 'One or more validation errors occurred.',
          status: 400,
          errors: { AssetTag: ['Asset tag is required.'], '$.type': ['Bad value.'] },
        },
      },
    ])
    const error = await apiRequest('/api/assets', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(400)
    expect(apiError.fieldErrors).toEqual({ assetTag: ['Asset tag is required.'], type: ['Bad value.'] })
    expect(apiError.summary).toBe('Asset tag is required.')
  })

  it('uses the detail of a 409 as the summary', async () => {
    mockFetch([
      { method: 'DELETE', path: '/api/assets/3', status: 409, body: { title: 'Conflict', status: 409, detail: 'Asset is linked to 2 service request(s).' } },
    ])
    const error = (await apiRequest('/api/assets/3', { method: 'DELETE' }).catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(409)
    expect(error.summary).toBe('Asset is linked to 2 service request(s).')
  })

  it('returns undefined for 204 No Content', async () => {
    mockFetch([{ method: 'DELETE', path: '/api/jacks/1', status: 204 }])
    await expect(apiRequest('/api/jacks/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('reports network failures as status 0 with a readable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const error = (await apiRequest('/api/dashboard').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(0)
    expect(error.summary).toMatch(/could not reach the server/i)
  })
})

describe('query', () => {
  it('skips empty values and encodes the rest', () => {
    expect(query({ search: 'a b', status: '', page: 2, openOnly: true, missing: undefined })).toBe('?search=a+b&page=2&openOnly=true')
    expect(query({})).toBe('')
  })
})

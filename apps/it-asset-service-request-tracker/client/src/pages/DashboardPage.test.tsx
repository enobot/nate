import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Dashboard } from '../api/types'
import { mockFetch } from '../test/mockFetch'
import { DashboardPage } from './DashboardPage'

const dashboard: Dashboard = {
  asOf: '2026-06-15T12:00:00Z',
  totalAssets: 300,
  assetsByStatus: [
    { key: 'InStock', count: 41 },
    { key: 'Deployed', count: 212 },
    { key: 'InRepair', count: 19 },
    { key: 'Retired', count: 28 },
  ],
  warrantyExpiring30Days: 4,
  openRequests: 43,
  openP1Requests: 2,
  unassignedOpenRequests: 10,
  resolvedLast7Days: 9,
  avgResolutionHoursLast30Days: 37.4,
  openRequestsByPriority: [
    { key: 'P1', count: 2 },
    { key: 'P2', count: 9 },
    { key: 'P3', count: 21 },
    { key: 'P4', count: 11 },
  ],
  requestsByStatus: [],
  totalJacks: 180,
  activeJacks: 110,
  faultyJacks: 6,
  accessPorts: 210,
  patchedPorts: 121,
  recentRequests: [
    {
      id: 99,
      number: 'SR000099',
      title: 'No link light on jack 3-311A',
      category: 'Network',
      priority: 'P2',
      status: 'New',
      requesterId: 3,
      requesterName: 'Marcus Ellison',
      assigneeId: null,
      assigneeName: null,
      createdAt: '2026-06-15T10:00:00Z',
      updatedAt: '2026-06-15T10:00:00Z',
      resolvedAt: null,
    },
  ],
}

describe('DashboardPage', () => {
  it('renders the numbers returned by the API', async () => {
    mockFetch([{ path: '/api/dashboard', body: dashboard }])
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('300')).toBeInTheDocument()
    expect(screen.getByText('212 deployed')).toBeInTheDocument()
    expect(screen.getByText('43')).toBeInTheDocument()
    expect(screen.getByText('10 unassigned')).toBeInTheDocument()
    expect(screen.getByText('37.4')).toBeInTheDocument()
    expect(screen.getByText(/121 of 210 access ports have a jack patched \(57.6%\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SR000099' })).toHaveAttribute('href', '/requests/99')
    expect(screen.getByText('2 h ago')).toBeInTheDocument()
  })

  it('shows an error with a retry button when the API fails, and recovers', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockFetch([
      {
        path: '/api/dashboard',
        handle: () => {
          attempts += 1
          return attempts === 1 ? { status: 500, body: { title: 'An error occurred while processing your request.', status: 500 } } : { body: dashboard }
        },
      },
    ])
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('An error occurred while processing your request.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('300')).toBeInTheDocument()
  })
})

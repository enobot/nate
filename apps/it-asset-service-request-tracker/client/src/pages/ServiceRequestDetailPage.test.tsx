import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { ServiceRequestDetail } from '../api/types'
import { ActorProvider } from '../context/ActorContext'
import { mockFetch, technicians, type MockRoute } from '../test/mockFetch'
import { ServiceRequestDetailPage } from './ServiceRequestDetailPage'

const inProgress: ServiceRequestDetail = {
  id: 42,
  number: 'SR000042',
  title: 'Activate data jack 2-214B in ENG 214',
  description: 'New staff member starting Monday.',
  category: 'JackActivation',
  priority: 'P3',
  status: 'InProgress',
  requesterId: 9,
  requesterName: 'Priya Dang',
  assigneeId: 1,
  assigneeName: 'Avery Alvarez',
  relatedAsset: null,
  relatedJack: { id: 7, label: '2-214B', locationName: 'ENG 214', status: 'Inactive' },
  resolutionNotes: null,
  createdAt: '2026-06-14T10:00:00Z',
  updatedAt: '2026-06-14T12:00:00Z',
  resolvedAt: null,
  closedAt: null,
  version: 3,
  allowedTransitions: ['Resolved'],
  history: [
    { id: 1, type: 'Created', createdAt: '2026-06-14T10:00:00Z', actorId: 9, actorName: 'Priya Dang', fromStatus: null, toStatus: 'New', fromAssignee: null, toAssignee: null, text: null },
    { id: 2, type: 'Assigned', createdAt: '2026-06-14T11:00:00Z', actorId: 1, actorName: 'Avery Alvarez', fromStatus: null, toStatus: null, fromAssignee: null, toAssignee: 'Avery Alvarez', text: null },
  ],
}

function renderPage(routes: MockRoute[]) {
  const network = mockFetch([{ path: '/api/people', body: technicians }, { path: '/api/service-requests/42', body: inProgress }, ...routes])
  render(
    <MemoryRouter initialEntries={['/requests/42']}>
      <ActorProvider>
        <Routes>
          <Route path="/requests/:id" element={<ServiceRequestDetailPage />} />
        </Routes>
      </ActorProvider>
    </MemoryRouter>,
  )
  return network
}

describe('ServiceRequestDetailPage', () => {
  it('only offers the status changes the server allows', async () => {
    renderPage([])
    expect(await screen.findByRole('heading', { name: /SR000042/ })).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Allowed status changes' })
    expect(group.querySelectorAll('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.getByText(/assigned to Avery Alvarez/)).toBeInTheDocument()
  })

  it('requires resolution notes before resolving', async () => {
    const user = userEvent.setup()
    const { calls } = renderPage([])
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    await user.type(screen.getByLabelText(/resolution notes/i), 'ok')
    await user.click(screen.getAllByRole('button', { name: 'Resolve' }).at(-1)!)

    expect(await screen.findByText(/must be at least 5 characters/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('sends the status change with the version and acting technician, then shows the result', async () => {
    const user = userEvent.setup()
    const { calls } = renderPage([
      {
        method: 'POST',
        path: '/api/service-requests/42/status',
        handle: () => ({
          body: {
            ...inProgress,
            status: 'Resolved',
            version: 4,
            resolvedAt: '2026-06-15T09:00:00Z',
            resolutionNotes: 'Patched to ENG-IDF1-SW01 1/1/7 on VLAN 10.',
            allowedTransitions: ['Closed', 'Reopened'],
          },
        }),
      },
    ])
    await screen.findByText('Posted as Avery Alvarez')
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    await user.type(screen.getByLabelText(/resolution notes/i), 'Patched to ENG-IDF1-SW01 1/1/7 on VLAN 10.')
    await user.click(screen.getAllByRole('button', { name: 'Resolve' }).at(-1)!)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Status changed to Resolved.')

    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toEqual({ status: 'Resolved', actorId: 1, version: 3, note: 'Patched to ENG-IDF1-SW01 1/1/7 on VLAN 10.' })
  })

  it('shows the server message when the request changed underneath (409)', async () => {
    const user = userEvent.setup()
    renderPage([
      {
        method: 'POST',
        path: '/api/service-requests/42/comments',
        status: 409,
        body: { title: 'Conflict', status: 409, detail: 'This request was changed by someone else after you loaded it.' },
      },
    ])
    await screen.findByText('Posted as Avery Alvarez')
    await user.type(await screen.findByLabelText('Comment'), 'Checked the patch panel.')
    await user.click(screen.getByRole('button', { name: 'Post comment' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This request was changed by someone else after you loaded it.')
  })
})

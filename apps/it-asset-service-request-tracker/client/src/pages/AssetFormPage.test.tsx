import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { mockFetch, type MockRoute } from '../test/mockFetch'
import { AssetFormPage } from './AssetFormPage'

const locations = [
  { id: 4, buildingCode: 'ENG', building: 'Engineering and Computer Science', floor: 2, room: '214', description: 'Offices', displayName: 'ENG 214', assetCount: 3, jackCount: 4 },
]
const people = [
  { id: 9, firstName: 'Priya', lastName: 'Dang', fullName: 'Priya Dang', email: 'priya.dang@aldercreek.example', department: 'Registrar', jobTitle: null, isTechnician: false, assignedAssetCount: 1 },
]

const baseRoutes: MockRoute[] = [
  { path: '/api/locations', body: locations },
  { path: '/api/people', body: people },
]

function renderForm(routes: MockRoute[]) {
  const network = mockFetch([...baseRoutes, ...routes])
  render(
    <MemoryRouter initialEntries={['/assets/new']}>
      <Routes>
        <Route path="/assets/new" element={<AssetFormPage />} />
        <Route path="/assets/:id" element={<p>Asset detail page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return network
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/asset tag/i), 'ACC-200001')
  await user.selectOptions(screen.getByLabelText(/^type/i), 'Laptop')
  await user.type(screen.getByLabelText(/manufacturer/i), 'Dell')
  await user.type(screen.getByLabelText(/^model/i), 'Latitude 5450')
  await user.type(screen.getByLabelText(/serial number/i), 'LTTEST0001')
}

describe('AssetFormPage', () => {
  it('shows client-side validation errors and does not call the API', async () => {
    const user = userEvent.setup()
    const { calls } = renderForm([])
    await screen.findByRole('option', { name: /ENG 214/ })

    await user.click(screen.getByRole('button', { name: 'Add asset' }))

    const summary = await screen.findByRole('alert')
    expect(within(summary).getByText(/Asset tag: Asset tag is required/)).toBeInTheDocument()
    expect(within(summary).getByText(/Serial number: Serial number is required/)).toBeInTheDocument()
    expect(screen.getByLabelText(/asset tag/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/asset tag/i)).toHaveAccessibleDescription(/Asset tag is required/)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('blocks assigning a person to an asset that is not deployed', async () => {
    const user = userEvent.setup()
    renderForm([])
    await screen.findByRole('option', { name: /Priya Dang/ })
    await fillValidForm(user)
    await user.selectOptions(screen.getByLabelText(/assigned to/i), '9')

    await user.click(screen.getByRole('button', { name: 'Add asset' }))

    expect(await screen.findByText('Only deployed assets can be assigned to a person.', { selector: 'p' })).toBeInTheDocument()
  })

  it('shows a 409 conflict from the server', async () => {
    const user = userEvent.setup()
    renderForm([
      { method: 'POST', path: '/api/assets', status: 409, body: { title: 'Conflict', status: 409, detail: 'Asset tag ACC-200001 is already in use.' } },
    ])
    await screen.findByRole('option', { name: /ENG 214/ })
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Add asset' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Conflict')
    expect(alert).toHaveTextContent('Asset tag ACC-200001 is already in use.')
  })

  it('maps server field errors onto the matching input', async () => {
    const user = userEvent.setup()
    renderForm([
      {
        method: 'POST',
        path: '/api/assets',
        status: 400,
        body: { title: 'One or more validation errors occurred.', status: 400, errors: { locationId: ['Location 4 does not exist.'] } },
      },
    ])
    await screen.findByRole('option', { name: /ENG 214/ })
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Add asset' }))

    await waitFor(() => expect(screen.getByLabelText(/^location/i)).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByLabelText(/^location/i)).toHaveAccessibleDescription(/Location 4 does not exist/)
  })

  it('posts the asset and opens its detail page on success', async () => {
    const user = userEvent.setup()
    const { calls } = renderForm([
      {
        method: 'POST',
        path: '/api/assets',
        handle: ({ body }) => ({ status: 201, body: { ...(body as object), id: 501, assetTag: 'ACC-200001', version: 1 } }),
      },
    ])
    await screen.findByRole('option', { name: /ENG 214/ })
    await fillValidForm(user)
    await user.selectOptions(screen.getByLabelText(/^status/i), 'Deployed')
    await user.selectOptions(screen.getByLabelText(/^location/i), '4')
    await user.selectOptions(screen.getByLabelText(/assigned to/i), '9')

    await user.click(screen.getByRole('button', { name: 'Add asset' }))

    expect(await screen.findByText('Asset detail page')).toBeInTheDocument()
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toMatchObject({
      assetTag: 'ACC-200001',
      type: 'Laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5450',
      serialNumber: 'LTTEST0001',
      status: 'Deployed',
      locationId: 4,
      assignedToId: 9,
    })
  })
})

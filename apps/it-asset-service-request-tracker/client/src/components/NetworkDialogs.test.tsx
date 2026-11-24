import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Jack, SwitchPort, SwitchSummary, Vlan } from '../api/types'
import { mockFetch } from '../test/mockFetch'
import { ActivateJackDialog } from './NetworkDialogs'

const jack: Jack = {
  id: 31,
  label: '1-113A',
  locationId: 5,
  locationName: 'ADM 113',
  buildingCode: 'ADM',
  type: 'Data',
  status: 'Inactive',
  switchPortId: null,
  switchId: null,
  switchName: null,
  portName: null,
  vlanId: null,
  notes: null,
}

const adminSwitch: SwitchSummary = {
  id: 1,
  name: 'ADM-IDF1-SW01',
  model: 'OmniSwitch 6860E-P24',
  managementIp: '10.20.10.2',
  locationId: 2,
  locationName: 'ADM IDF1',
  building: 'Halvorsen Administration Building',
  portCount: 24,
  accessPorts: 23,
  enabledPorts: 21,
  patchedPorts: 23,
  activeJacks: 20,
}

const vlans: Vlan[] = [
  { vlanId: 10, name: 'STAFF-DATA', description: null, portCount: 80 },
  { vlanId: 99, name: 'NET-MGMT', description: null, portCount: 6 },
]

function accessPort(id: number, number: number): SwitchPort {
  return { id, switchId: 1, portName: `1/1/${number}`, portNumber: number, vlanId: null, vlanName: null, adminStatus: 'Disabled', role: 'Access', description: null, jack: null }
}

function renderDialog() {
  const onDone = vi.fn()
  render(<ActivateJackDialog open jack={jack} switches={[adminSwitch]} vlans={vlans} onClose={() => {}} onDone={onDone} />)
  return { onDone }
}

describe('ActivateJackDialog', () => {
  it('says plainly when a switch has no free access ports', async () => {
    const { calls } = mockFetch([{ path: '/api/switches/1/free-ports', body: [] }])
    renderDialog()

    expect(await screen.findByText(/No free access ports on ADM-IDF1-SW01/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^port/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate jack' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Patch only' })).toBeDisabled()
    // Ports come from the free-ports endpoint (which excludes uplinks), not the full port list.
    expect(calls.map((c) => c.url)).toEqual(['/api/switches/1/free-ports'])
  })

  it('offers only the free access ports from the API and activates on the chosen one', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch([
      { path: '/api/switches/1/free-ports', body: [accessPort(205, 7), accessPort(206, 9)] },
      {
        method: 'POST',
        path: '/api/jacks/31/activate',
        handle: ({ body }) => ({
          body: { ...jack, status: 'Active', switchId: 1, switchName: 'ADM-IDF1-SW01', switchPortId: (body as { switchPortId: number }).switchPortId, portName: '1/1/9', vlanId: 10 },
        }),
      },
    ])
    const { onDone } = renderDialog()

    const portSelect = await screen.findByLabelText(/^port/i)
    await waitFor(() => expect(screen.getAllByRole('option', { name: /^1\/1\// })).toHaveLength(2))
    expect(screen.queryByRole('option', { name: /uplink/i })).not.toBeInTheDocument()

    await user.selectOptions(portSelect, '206')
    await user.click(screen.getByRole('button', { name: 'Activate jack' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ switchPortId: 206, vlanId: 10 })
    expect(onDone.mock.calls[0][1]).toBe('Jack 1-113A is active on ADM-IDF1-SW01 1/1/9, VLAN 10.')
  })

  it('shows the 409 message if the server rejects the port', async () => {
    const user = userEvent.setup()
    mockFetch([
      { path: '/api/switches/1/free-ports', body: [accessPort(205, 7)] },
      {
        method: 'POST',
        path: '/api/jacks/31/activate',
        status: 409,
        body: { title: 'Conflict', status: 409, detail: 'Port 1/1/7 already has a jack patched to it.' },
      },
    ])
    renderDialog()

    await user.selectOptions(await screen.findByLabelText(/^port/i), '205')
    await user.click(screen.getByRole('button', { name: 'Activate jack' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Port 1/1/7 already has a jack patched to it.')
  })
})

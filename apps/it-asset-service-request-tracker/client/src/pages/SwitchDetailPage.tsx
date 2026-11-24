import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { PORT_STATUSES, type PortAdminStatus, type SwitchPort } from '../api/types'
import { SwitchFormDialog } from '../components/NetworkDialogs'
import { Badge, Button, ConfirmDialog, ErrorAlert, Notice, PageHeader, Spinner, Table, td, th, Card } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { jackStatusTone } from '../lib/format'

function PortRow({ port, vlans, onSaved, onError }: { port: SwitchPort; vlans: { vlanId: number; name: string }[]; onSaved: (message: string) => void; onError: (error: ApiError) => void }) {
  const [editing, setEditing] = useState(false)
  const [vlanId, setVlanId] = useState<number | null>(port.vlanId)
  const [status, setStatus] = useState<PortAdminStatus>(port.adminStatus)
  const [description, setDescription] = useState(port.description ?? '')
  const save = useMutation(async () => {
    await api.ports.update(port.id, { vlanId, adminStatus: status, description: description.trim() || null })
    setEditing(false)
    onSaved(`Port ${port.portName} updated.`)
  })
  const unpatch = useMutation(async () => {
    if (!port.jack) return
    await api.jacks.unpatch(port.jack.id)
    onSaved(`Jack ${port.jack.label} unpatched from ${port.portName}.`)
  })

  // Errors are shown above the table (a table row has no good place for an alert).
  const fail = save.error ?? unpatch.error
  useEffect(() => {
    if (fail) onError(fail)
  }, [fail, onError])

  const isUplink = port.role === 'Uplink'
  const roleBadge = isUplink ? (
    <span className="ml-2">
      <Badge tone="violet">Uplink</Badge>
    </span>
  ) : null

  if (editing) {
    return (
      <tr className="bg-slate-800/40">
        <td className={`${td} font-mono`}>
          {port.portName}
          {roleBadge}
          {isUplink && <span className="mt-1 block font-sans text-xs text-slate-400">Status and VLAN are fixed on the uplink.</span>}
        </td>
        <td className={td}>
          <label className="sr-only" htmlFor={`status-${port.id}`}>
            Admin status for {port.portName}
          </label>
          <select
            id={`status-${port.id}`}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 disabled:opacity-60"
            value={status}
            disabled={isUplink}
            onChange={(e) => setStatus(e.target.value as PortAdminStatus)}
          >
            {PORT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </td>
        <td className={td}>
          <label className="sr-only" htmlFor={`vlan-${port.id}`}>
            VLAN for {port.portName}
          </label>
          <select
            id={`vlan-${port.id}`}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 disabled:opacity-60"
            value={vlanId ?? ''}
            disabled={isUplink}
            onChange={(e) => setVlanId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No VLAN</option>
            {vlans.map((v) => (
              <option key={v.vlanId} value={v.vlanId}>
                {v.vlanId} - {v.name}
              </option>
            ))}
          </select>
        </td>
        <td className={td}>
          <label className="sr-only" htmlFor={`desc-${port.id}`}>
            Description for {port.portName}
          </label>
          <input id={`desc-${port.id}`} className="w-48 rounded border border-slate-700 bg-slate-950 px-2 py-1" maxLength={100} value={description} onChange={(e) => setDescription(e.target.value)} />
        </td>
        <td className={td}>{port.jack ? port.jack.label : '-'}</td>
        <td className={`${td} text-right`}>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="primary" onClick={() => void save.run()} disabled={save.pending}>
              {save.pending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(false)
                setVlanId(port.vlanId)
                setStatus(port.adminStatus)
                setDescription(port.description ?? '')
              }}
            >
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className={`${td} font-mono`}>
        {port.portName}
        {roleBadge}
      </td>
      <td className={td}>
        <Badge tone={port.adminStatus === 'Enabled' ? 'green' : 'slate'}>{port.adminStatus}</Badge>
      </td>
      <td className={td}>{port.vlanId ? `${port.vlanId} ${port.vlanName ?? ''}` : <span className="text-slate-500">None</span>}</td>
      <td className={`${td} max-w-xs truncate text-slate-400`}>{port.description}</td>
      <td className={td}>
        {port.jack ? (
          <span className="inline-flex items-center gap-2">
            <span className="font-mono">{port.jack.label}</span>
            <Badge tone={jackStatusTone[port.jack.status]}>{port.jack.status}</Badge>
            <span className="text-xs text-slate-500">{port.jack.locationName}</span>
          </span>
        ) : isUplink ? (
          <span className="text-slate-500">Core uplink (no jack)</span>
        ) : (
          <span className="text-slate-500">Free</span>
        )}
      </td>
      <td className={`${td} text-right`}>
        <div className="flex justify-end gap-1">
          <Button size="sm" onClick={() => setEditing(true)} aria-label={`Edit port ${port.portName}`}>
            Edit
          </Button>
          {port.jack && (
            <Button size="sm" variant="ghost" onClick={() => void unpatch.run()} disabled={unpatch.pending} aria-label={`Unpatch jack from port ${port.portName}`}>
              Unpatch
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

export function SwitchDetailPage() {
  const { id } = useParams()
  const switchId = Number(id)
  const navigate = useNavigate()
  const detail = useApi((signal) => api.switches.get(switchId, signal), [switchId])
  const vlans = useApi((signal) => api.vlans.list(signal), [])
  const locations = useApi((signal) => api.locations.list(signal), [])
  const [notice, setNotice] = useState<string | null>(null)
  const [rowError, setRowError] = useState<ApiError>()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const remove = useMutation(async () => {
    await api.switches.remove(switchId)
    navigate('/network', { replace: true })
  })

  if (detail.error) return <ErrorAlert error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Spinner label="Loading switch" />
  const sw = detail.data
  const patched = sw.ports.filter((p) => p.jack).length
  const accessPorts = sw.ports.filter((p) => p.role === 'Access').length

  return (
    <>
      <Link to="/network" className="text-sm text-sky-300 hover:underline">
        Back to network
      </Link>
      <PageHeader
        title={sw.name}
        description={`${sw.model} - ${sw.locationName} (${sw.building}) - management IP ${sw.managementIp} - ${patched} of ${accessPorts} access ports patched`}
        actions={
          <>
            <Button onClick={() => setEditOpen(true)}>Edit switch</Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </>
        }
      />
      <Notice message={notice} />
      {rowError && (
        <div className="mb-4">
          <ErrorAlert error={rowError} />
        </div>
      )}
      <Card title="Ports">
        <Table caption={`Ports on ${sw.name}`}>
          <thead>
            <tr>
              <th className={th}>Port</th>
              <th className={th}>Admin status</th>
              <th className={th}>VLAN</th>
              <th className={th}>Description</th>
              <th className={th}>Patched jack</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sw.ports.map((p) => (
              <PortRow
                key={`${p.id}-${p.vlanId}-${p.adminStatus}-${p.jack?.id ?? 0}`}
                port={p}
                vlans={vlans.data ?? []}
                onSaved={(message) => {
                  setRowError(undefined)
                  setNotice(message)
                  detail.reload()
                }}
                onError={setRowError}
              />
            ))}
          </tbody>
        </Table>
      </Card>

      <SwitchFormDialog
        open={editOpen}
        existing={sw}
        locations={locations.data ?? []}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          setNotice('Switch details saved.')
          detail.reload()
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${sw.name}?`}
        message="The switch and all of its ports will be removed. A switch that still has jacks patched to it cannot be deleted."
        confirmLabel="Delete switch"
        pending={remove.pending}
        error={remove.error}
        onConfirm={() => void remove.run()}
        onCancel={() => {
          setDeleteOpen(false)
          remove.setError(undefined)
        }}
      />
    </>
  )
}

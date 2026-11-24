import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { JACK_STATUSES, JACK_TYPES, type Jack, type JackStatus, type JackType, type Location, type SwitchPort, type SwitchSummary, type Vlan } from '../api/types'
import { useApi } from '../hooks/useApi'
import { label } from '../lib/format'
import { firstErrors, isPrivateIPv4, type FieldErrors } from '../lib/validation'
import { Button, Dialog, ErrorAlert, SelectField, TextAreaField, TextField } from './ui'

/** Shared submit handling: client errors first, then server field errors or a general error. */
function useDialogSubmit() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError>()
  const [saving, setSaving] = useState(false)

  const submit = async (clientErrors: FieldErrors, action: () => Promise<void>) => {
    if (saving) return
    setServerError(undefined)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return
    setSaving(true)
    try {
      await action()
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err))
      setServerError(apiError)
      setErrors(firstErrors(apiError.fieldErrors))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setErrors({})
    setServerError(undefined)
  }

  return { errors, serverError, saving, submit, reset }
}

export function JackFormDialog({
  open,
  jack,
  locations,
  onClose,
  onSaved,
}: {
  open: boolean
  jack?: Jack
  locations: Location[]
  onClose: () => void
  onSaved: (jack: Jack) => void
}) {
  const [labelText, setLabelText] = useState('')
  const [locationId, setLocationId] = useState<number | null>(null)
  const [type, setType] = useState<JackType>('Data')
  const [status, setStatus] = useState<JackStatus>('Inactive')
  const [notes, setNotes] = useState('')
  const { errors, serverError, saving, submit, reset } = useDialogSubmit()

  useEffect(() => {
    if (!open) return
    reset()
    setLabelText(jack?.label ?? '')
    setLocationId(jack?.locationId ?? null)
    setType(jack?.type ?? 'Data')
    setStatus(jack?.status ?? 'Inactive')
    setNotes(jack?.notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jack])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const clientErrors: FieldErrors = {}
    if (!/^[A-Za-z0-9-]{2,20}$/.test(labelText.trim())) clientErrors.label = 'Use 2 to 20 letters, numbers or dashes, e.g. 2-214B.'
    if (locationId === null) clientErrors.locationId = 'Choose the room the jack is in.'
    void submit(clientErrors, async () => {
      const body = { label: labelText.trim(), locationId, type, status, notes: notes.trim() || null }
      const saved = jack ? await api.jacks.update(jack.id, body) : await api.jacks.create(body)
      onSaved(saved)
    })
  }

  return (
    <Dialog open={open} title={jack ? `Edit jack ${jack.label}` : 'Add jack'} onClose={onClose}>
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {serverError && Object.keys(errors).length === 0 && <ErrorAlert error={serverError} />}
        <TextField label="Jack label" required value={labelText} maxLength={20} error={errors.label} hint="Floor-room plus jack letter, e.g. 2-214B" onChange={(e) => setLabelText(e.target.value)} />
        <SelectField label="Room" required value={locationId ?? ''} error={errors.locationId} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose a room</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.displayName}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as JackType)}>
            {JACK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Status"
            value={status}
            error={errors.status}
            hint="Active needs a patched, enabled port"
            onChange={(e) => setStatus(e.target.value as JackStatus)}
          >
            {JACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField label="Notes" value={notes} maxLength={500} error={errors.notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save jack'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Patch a jack to a free access port. "Activate" also sets the VLAN, enables the port and marks
 * the jack Active in one API call; "Patch only" just connects it. The port list comes from
 * GET /api/switches/{id}/free-ports, which never includes uplink ports.
 */
export function ActivateJackDialog({
  open,
  jack,
  switches,
  vlans,
  onClose,
  onDone,
}: {
  open: boolean
  jack?: Jack
  switches: SwitchSummary[]
  vlans: Vlan[]
  onClose: () => void
  onDone: (jack: Jack, message: string) => void
}) {
  const [switchId, setSwitchId] = useState<number | null>(null)
  const [portId, setPortId] = useState<number | null>(null)
  const [vlanId, setVlanId] = useState<number | null>(null)
  const { errors, serverError, saving, submit, reset } = useDialogSubmit()

  const buildingSwitches = switches.filter((s) => !jack || s.locationName.startsWith(`${jack.buildingCode} `))
  const choices = buildingSwitches.length > 0 ? buildingSwitches : switches

  useEffect(() => {
    if (!open || !jack) return
    reset()
    setSwitchId(jack.switchId ?? choices[0]?.id ?? null)
    setPortId(jack.switchPortId)
    const preferred = vlans.find((v) => (jack.type === 'Voice' ? v.name === 'VOICE' : v.name === 'STAFF-DATA'))
    setVlanId(jack.vlanId ?? preferred?.vlanId ?? vlans[0]?.vlanId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jack])

  const free = useApi((signal) => (open && switchId ? api.switches.freePorts(switchId, signal) : Promise.resolve([] as SwitchPort[])), [open, switchId])
  const selectedSwitch = choices.find((s) => s.id === switchId)

  // A jack that is already patched on this switch keeps its own port as an option, so it can be
  // activated or moved to another VLAN without unpatching first.
  const currentPort =
    jack && jack.switchPortId !== null && jack.switchId === switchId ? { id: jack.switchPortId, label: `${jack.portName} (current port)` } : null
  const portOptions = [
    ...(currentPort ? [currentPort] : []),
    ...(free.data ?? [])
      .filter((p) => p.id !== currentPort?.id)
      .map((p) => ({
        id: p.id,
        label: `${p.portName} - ${label(p.adminStatus)}${p.vlanId ? `, VLAN ${p.vlanId}` : ''}${p.description ? ` (${p.description})` : ''}`,
      })),
  ]
  const noFreePorts = !free.loading && !free.error && portOptions.length === 0

  const run = (activate: boolean) => {
    if (!jack) return
    const clientErrors: FieldErrors = {}
    if (portId === null) clientErrors.switchPortId = 'Choose a free access port.'
    if (activate && vlanId === null) clientErrors.vlanId = 'Choose a VLAN.'
    void submit(clientErrors, async () => {
      const result = activate ? await api.jacks.activate(jack.id, portId!, vlanId!) : await api.jacks.patch(jack.id, portId!)
      onDone(
        result,
        activate
          ? `Jack ${result.label} is active on ${result.switchName} ${result.portName}, VLAN ${result.vlanId}.`
          : `Jack ${result.label} patched to ${result.switchName} ${result.portName}.`,
      )
    })
  }

  return (
    <Dialog open={open} title={jack ? `Patch / activate jack ${jack.label}` : 'Patch jack'} onClose={onClose}>
      {jack && (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(true)
          }}
        >
          <p className="text-sm text-slate-400">
            {jack.locationName} - {jack.type} jack - currently {jack.status.toLowerCase()}
            {jack.switchName ? ` on ${jack.switchName} ${jack.portName}` : ', not patched'}.
          </p>
          {serverError && <ErrorAlert error={serverError} />}
          {free.error && <ErrorAlert error={free.error} onRetry={free.reload} />}
          <SelectField
            label="Switch"
            value={switchId ?? ''}
            onChange={(e) => {
              setSwitchId(e.target.value ? Number(e.target.value) : null)
              setPortId(null)
            }}
          >
            {choices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.locationName})
              </option>
            ))}
          </SelectField>
          {noFreePorts ? (
            <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              No free access ports on {selectedSwitch?.name ?? 'this switch'}. Choose another switch or unpatch a jack first. Uplink ports
              are never offered because they connect the switch to the core network.
            </p>
          ) : (
            <SelectField
              label="Port"
              required
              value={portId ?? ''}
              error={errors.switchPortId}
              hint={free.loading ? 'Loading ports...' : `${free.data?.length ?? 0} free access port(s). Uplinks are not listed.`}
              onChange={(e) => setPortId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose a port</option>
              {portOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField label="VLAN" required value={vlanId ?? ''} error={errors.vlanId} hint="Used by Activate" onChange={(e) => setVlanId(e.target.value ? Number(e.target.value) : null)}>
            {vlans.map((v) => (
              <option key={v.vlanId} value={v.vlanId}>
                {v.vlanId} - {v.name}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={() => run(false)} disabled={saving || noFreePorts}>
              Patch only
            </Button>
            <Button type="submit" variant="primary" disabled={saving || noFreePorts}>
              {saving ? 'Working...' : 'Activate jack'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function SwitchFormDialog({
  open,
  existing,
  locations,
  onClose,
  onSaved,
}: {
  open: boolean
  existing?: { id: number; name: string; model: string; managementIp: string; locationId: number }
  locations: Location[]
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [ip, setIp] = useState('')
  const [locationId, setLocationId] = useState<number | null>(null)
  const [portCount, setPortCount] = useState('24')
  const { errors, serverError, saving, submit, reset } = useDialogSubmit()

  useEffect(() => {
    if (!open) return
    reset()
    setName(existing?.name ?? '')
    setModel(existing?.model ?? '')
    setIp(existing?.managementIp ?? '')
    setLocationId(existing?.locationId ?? null)
    setPortCount('24')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing])

  const closets = locations.filter((l) => l.room.startsWith('IDF'))
  const options = closets.length > 0 ? [...closets, ...locations.filter((l) => !l.room.startsWith('IDF'))] : locations

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const clientErrors: FieldErrors = {}
    if (!/^[A-Za-z0-9-]{3,40}$/.test(name.trim())) clientErrors.name = 'Use 3 to 40 letters, numbers or dashes.'
    if (!model.trim()) clientErrors.model = 'Model is required.'
    if (!isPrivateIPv4(ip)) clientErrors.managementIp = 'Use a private IPv4 address (10.x, 172.16-31.x or 192.168.x).'
    if (locationId === null) clientErrors.locationId = 'Choose where the switch is installed.'
    const ports = Number(portCount)
    if (!existing && (!Number.isInteger(ports) || ports < 1 || ports > 96)) clientErrors.portCount = 'Port count must be 1 to 96.'
    void submit(clientErrors, async () => {
      const body = { name: name.trim(), model: model.trim(), managementIp: ip.trim(), locationId }
      const saved = existing ? await api.switches.update(existing.id, body) : await api.switches.create({ ...body, portCount: ports })
      onSaved(saved.id)
    })
  }

  return (
    <Dialog open={open} title={existing ? `Edit ${existing.name}` : 'Add switch'} onClose={onClose}>
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {serverError && Object.keys(errors).length === 0 && <ErrorAlert error={serverError} />}
        <TextField label="Switch name" required value={name} maxLength={40} error={errors.name} hint="e.g. ENG-IDF2-SW01" onChange={(e) => setName(e.target.value)} />
        <TextField label="Model" required value={model} maxLength={60} error={errors.model} onChange={(e) => setModel(e.target.value)} />
        <TextField label="Management IP" required value={ip} maxLength={15} error={errors.managementIp} inputMode="decimal" onChange={(e) => setIp(e.target.value)} />
        <SelectField label="Location" required value={locationId ?? ''} error={errors.locationId} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose a location</option>
          {options.map((l) => (
            <option key={l.id} value={l.id}>
              {l.displayName}
              {l.description ? ` - ${l.description}` : ''}
            </option>
          ))}
        </SelectField>
        {!existing && (
          <TextField label="Number of ports" required type="number" min={1} max={96} value={portCount} error={errors.portCount} hint="Ports are created as 1/1/1 to 1/1/N, disabled" onChange={(e) => setPortCount(e.target.value)} />
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save switch'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

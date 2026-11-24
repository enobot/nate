import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { JACK_STATUSES, JACK_TYPES, type Jack, type JackStatus, type JackType } from '../api/types'
import { ActivateJackDialog, JackFormDialog, SwitchFormDialog } from '../components/NetworkDialogs'
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorAlert, Notice, PageHeader, Pagination, SelectField, Spinner, Table, TextField, td, th } from '../components/ui'
import { useApi, useDebouncedValue, useMutation } from '../hooks/useApi'
import { jackStatusTone, percent } from '../lib/format'
import { firstErrors, isValidVlanId, type FieldErrors } from '../lib/validation'

type Tab = 'switches' | 'jacks' | 'vlans'
const TABS: { key: Tab; label: string }[] = [
  { key: 'switches', label: 'Switches' },
  { key: 'jacks', label: 'Jacks' },
  { key: 'vlans', label: 'VLANs' },
]

export function NetworkPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'switches') as Tab
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <>
      <PageHeader title="Network" description="Switches, ports, wall jacks and VLANs. Patch and activate jacks the way the telecom team does." />
      <Notice message={notice} />
      <div role="tablist" aria-label="Network sections" className="mb-5 flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-100'}`}
            onClick={() => {
              setNotice(null)
              setParams({ tab: t.key }, { replace: true })
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'switches' && <SwitchesTab />}
        {tab === 'jacks' && <JacksTab onNotice={setNotice} />}
        {tab === 'vlans' && <VlansTab onNotice={setNotice} />}
      </div>
    </>
  )
}

function SwitchesTab() {
  const navigate = useNavigate()
  const switches = useApi((signal) => api.switches.list(signal), [])
  const locations = useApi((signal) => api.locations.list(signal), [])
  const [adding, setAdding] = useState(false)

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add switch
        </Button>
      </div>
      {switches.error && <ErrorAlert error={switches.error} onRetry={switches.reload} />}
      {switches.loading && !switches.data && <Spinner label="Loading switches" />}
      {switches.data && switches.data.length === 0 && <EmptyState>No switches yet.</EmptyState>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(switches.data ?? []).map((s) => {
          const used = percent(s.patchedPorts, s.accessPorts)
          return (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link to={`/network/switches/${s.id}`} className="font-mono text-base font-semibold text-sky-300 hover:underline">
                    {s.name}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {s.model} - {s.locationName}
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-400">{s.managementIp}</span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Access ports</dt>
                  <dd className="font-semibold tabular-nums">{s.accessPorts}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Patched</dt>
                  <dd className="font-semibold tabular-nums">{s.patchedPorts}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Active jacks</dt>
                  <dd className="font-semibold tabular-nums text-emerald-300">{s.activeJacks}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    Access port utilization
                    {s.portCount > s.accessPorts && ` (${s.portCount - s.accessPorts} uplink not counted)`}
                  </span>
                  <span>{used}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-800" aria-hidden="true">
                  <div className="h-2 rounded-full bg-sky-400" style={{ width: `${used}%` }} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      <SwitchFormDialog
        open={adding}
        locations={locations.data ?? []}
        onClose={() => setAdding(false)}
        onSaved={(id) => {
          setAdding(false)
          navigate(`/network/switches/${id}`)
        }}
      />
    </>
  )
}

function JacksTab({ onNotice }: { onNotice: (message: string | null) => void }) {
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  const [status, setStatus] = useState<JackStatus | ''>('')
  const [type, setType] = useState<JackType | ''>('')
  const [building, setBuilding] = useState('')
  const [patched, setPatched] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)

  const jacks = useApi(
    (signal) => api.jacks.list({ search, status, type, building, patched: patched === '' ? undefined : patched === 'true', page, pageSize: 25 }, signal),
    [search, status, type, building, patched, page],
  )
  const locations = useApi((signal) => api.locations.list(signal), [])
  const switches = useApi((signal) => api.switches.list(signal), [])
  const vlans = useApi((signal) => api.vlans.list(signal), [])
  const buildings = [...new Set((locations.data ?? []).map((l) => l.buildingCode))].sort()

  const [editing, setEditing] = useState<Jack | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [patching, setPatching] = useState<Jack | undefined>()
  const [deleting, setDeleting] = useState<Jack | undefined>()

  const unpatch = useMutation(async (jack: Jack) => {
    const result = await api.jacks.unpatch(jack.id)
    onNotice(`Jack ${result.label} unpatched${jack.status === 'Active' ? ' and set to Inactive' : ''}.`)
    jacks.reload()
  })
  const remove = useMutation(async (jack: Jack) => {
    await api.jacks.remove(jack.id)
    setDeleting(undefined)
    onNotice(`Jack ${jack.label} deleted.`)
    jacks.reload()
  })

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }

  return (
    <>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <TextField label="Search" type="search" placeholder="Jack, room or switch" className="lg:col-span-2" value={searchText} maxLength={50} onChange={(e) => resetPage(setSearchText)(e.target.value)} />
          <SelectField label="Status" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as JackStatus | '')}>
            <option value="">All</option>
            {JACK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectField>
          <SelectField label="Type" value={type} onChange={(e) => resetPage(setType)(e.target.value as JackType | '')}>
            <option value="">All</option>
            {JACK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </SelectField>
          <SelectField label="Building" value={building} onChange={(e) => resetPage(setBuilding)(e.target.value)}>
            <option value="">All</option>
            {buildings.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </SelectField>
          <SelectField label="Patched" value={patched} onChange={(e) => resetPage(setPatched)(e.target.value as '' | 'true' | 'false')}>
            <option value="">Any</option>
            <option value="true">Patched</option>
            <option value="false">Not patched</option>
          </SelectField>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              setEditing(undefined)
              setFormOpen(true)
            }}
          >
            Add jack
          </Button>
        </div>

        <div className="mt-4">
          {unpatch.error && <ErrorAlert error={unpatch.error} />}
          {jacks.error && <ErrorAlert error={jacks.error} onRetry={jacks.reload} />}
          {jacks.loading && !jacks.data && <Spinner label="Loading jacks" />}
          {jacks.data && jacks.data.items.length === 0 && <EmptyState>No jacks match these filters.</EmptyState>}
          {jacks.data && jacks.data.items.length > 0 && (
            <>
              <Table caption="Network jacks">
                <thead>
                  <tr>
                    <th className={th}>Jack</th>
                    <th className={th}>Room</th>
                    <th className={th}>Type</th>
                    <th className={th}>Status</th>
                    <th className={th}>Switch port</th>
                    <th className={th}>VLAN</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {jacks.data.items.map((j) => (
                    <tr key={j.id}>
                      <td className={`${td} font-mono`}>{j.label}</td>
                      <td className={td}>{j.locationName}</td>
                      <td className={td}>{j.type}</td>
                      <td className={td}>
                        <Badge tone={jackStatusTone[j.status]}>{j.status}</Badge>
                      </td>
                      <td className={td}>
                        {j.switchId ? (
                          <Link to={`/network/switches/${j.switchId}`} className="font-mono text-sky-300 hover:underline">
                            {j.switchName} {j.portName}
                          </Link>
                        ) : (
                          <span className="text-slate-500">Not patched</span>
                        )}
                      </td>
                      <td className={td}>{j.vlanId ?? '-'}</td>
                      <td className={`${td} text-right`}>
                        <div className="flex justify-end gap-1">
                          {j.status !== 'Faulty' && (
                            <Button size="sm" variant="primary" onClick={() => setPatching(j)} aria-label={`Patch or activate jack ${j.label}`}>
                              {j.status === 'Active' ? 'Change port' : 'Activate'}
                            </Button>
                          )}
                          {j.switchPortId && (
                            <Button size="sm" onClick={() => void unpatch.run(j)} disabled={unpatch.pending} aria-label={`Unpatch jack ${j.label}`}>
                              Unpatch
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => {
                              setEditing(j)
                              setFormOpen(true)
                            }}
                            aria-label={`Edit jack ${j.label}`}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(j)} aria-label={`Delete jack ${j.label}`}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={jacks.data.page} totalPages={jacks.data.totalPages} totalCount={jacks.data.totalCount} onPage={setPage} />
            </>
          )}
        </div>
      </Card>

      <JackFormDialog
        open={formOpen}
        jack={editing}
        locations={locations.data ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false)
          onNotice(`Jack ${saved.label} saved.`)
          jacks.reload()
        }}
      />
      <ActivateJackDialog
        open={patching !== undefined}
        jack={patching}
        switches={switches.data ?? []}
        vlans={vlans.data ?? []}
        onClose={() => setPatching(undefined)}
        onDone={(_, message) => {
          setPatching(undefined)
          onNotice(message)
          jacks.reload()
          switches.reload()
        }}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        title={`Delete jack ${deleting?.label ?? ''}?`}
        message="Only unpatched jacks that are not referenced by a service request can be deleted."
        confirmLabel="Delete jack"
        pending={remove.pending}
        error={remove.error}
        onConfirm={() => deleting && void remove.run(deleting)}
        onCancel={() => {
          setDeleting(undefined)
          remove.setError(undefined)
        }}
      />
    </>
  )
}

function VlansTab({ onNotice }: { onNotice: (message: string | null) => void }) {
  const vlans = useApi((signal) => api.vlans.list(signal), [])
  const [vlanId, setVlanId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError>()
  const [saving, setSaving] = useState(false)
  const remove = useMutation(async (id: number) => {
    await api.vlans.remove(id)
    onNotice(`VLAN ${id} deleted.`)
    vlans.reload()
  })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    const next: FieldErrors = {}
    const id = Number(vlanId)
    if (!vlanId || !isValidVlanId(id)) next.vlanId = 'VLAN ID must be a whole number from 1 to 4094.'
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(name.trim())) next.name = 'Use letters, numbers, dashes or underscores.'
    setErrors(next)
    setServerError(undefined)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    try {
      const created = await api.vlans.create({ vlanId: id, name: name.trim(), description: description.trim() || null })
      onNotice(`VLAN ${created.vlanId} (${created.name}) added.`)
      setVlanId('')
      setName('')
      setDescription('')
      vlans.reload()
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err))
      setServerError(apiError)
      setErrors(firstErrors(apiError.fieldErrors))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Defined VLANs" className="lg:col-span-2">
        {remove.error && <ErrorAlert error={remove.error} />}
        {vlans.error && <ErrorAlert error={vlans.error} onRetry={vlans.reload} />}
        {vlans.loading && !vlans.data && <Spinner />}
        {vlans.data && (
          <Table caption="VLANs">
            <thead>
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Name</th>
                <th className={th}>Description</th>
                <th className={th}>Ports</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {vlans.data.map((v) => (
                <tr key={v.vlanId}>
                  <td className={`${td} font-mono`}>{v.vlanId}</td>
                  <td className={`${td} font-mono`}>{v.name}</td>
                  <td className={`${td} whitespace-normal text-slate-400`}>{v.description}</td>
                  <td className={td}>{v.portCount}</td>
                  <td className={`${td} text-right`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={remove.pending}
                      onClick={() => void remove.run(v.vlanId)}
                      aria-label={`Delete VLAN ${v.vlanId}`}
                      title={v.portCount > 0 ? 'VLANs in use cannot be deleted' : undefined}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Add VLAN">
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          {serverError && Object.keys(errors).length === 0 && <ErrorAlert error={serverError} />}
          <TextField label="VLAN ID" required type="number" min={1} max={4094} value={vlanId} error={errors.vlanId} hint="1 to 4094" onChange={(e) => setVlanId(e.target.value)} />
          <TextField label="Name" required value={name} maxLength={40} error={errors.name} hint="e.g. GUEST-WIFI" onChange={(e) => setName(e.target.value)} />
          <TextField label="Description" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Adding...' : 'Add VLAN'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

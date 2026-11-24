import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Location, LocationWrite, Person, PersonWrite } from '../api/types'
import { Badge, Button, Card, ConfirmDialog, Dialog, ErrorAlert, Notice, PageHeader, Spinner, Table, TextField, td, th } from '../components/ui'
import { useApi, useDebouncedValue, useMutation } from '../hooks/useApi'
import { firstErrors, type FieldErrors } from '../lib/validation'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function PersonDialog({ open, person, onClose, onSaved }: { open: boolean; person?: Person; onClose: () => void; onSaved: (p: Person) => void }) {
  // Dialog only renders its children while open, so the form starts fresh every time it opens.
  return (
    <Dialog open={open} title={person ? `Edit ${person.fullName}` : 'Add person'} onClose={onClose}>
      <PersonForm person={person} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}

function PersonForm({ person, onClose, onSaved }: { person?: Person; onClose: () => void; onSaved: (p: Person) => void }) {
  const [form, setForm] = useState<PersonWrite>(() =>
    person
      ? { firstName: person.firstName, lastName: person.lastName, email: person.email, department: person.department, jobTitle: person.jobTitle, isTechnician: person.isTechnician }
      : { firstName: '', lastName: '', email: '', department: '', jobTitle: null, isTechnician: false },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError>()
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    const next: FieldErrors = {}
    if (!form.firstName.trim()) next.firstName = 'First name is required.'
    if (!form.lastName.trim()) next.lastName = 'Last name is required.'
    if (!EMAIL.test(form.email.trim())) next.email = 'Enter a valid email address.'
    if (!form.department.trim()) next.department = 'Department is required.'
    setErrors(next)
    setServerError(undefined)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    try {
      const body = { ...form, jobTitle: form.jobTitle?.trim() || null }
      onSaved(person ? await api.people.update(person.id, body) : await api.people.create(body))
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err))
      setServerError(apiError)
      setErrors(firstErrors(apiError.fieldErrors))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      {serverError && Object.keys(errors).length === 0 && <ErrorAlert error={serverError} />}
      <div className="grid grid-cols-2 gap-4">
        <TextField label="First name" required maxLength={50} value={form.firstName} error={errors.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        <TextField label="Last name" required maxLength={50} value={form.lastName} error={errors.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      </div>
      <TextField label="Email" required type="email" maxLength={120} value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <TextField label="Department" required maxLength={80} value={form.department} error={errors.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
      <TextField label="Job title" maxLength={80} value={form.jobTitle ?? ''} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={form.isTechnician} onChange={(e) => setForm({ ...form, isTechnician: e.target.checked })} />
        IT technician (can be assigned service requests)
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save person'}
        </Button>
      </div>
    </form>
  )
}

function LocationDialog({ open, location, onClose, onSaved }: { open: boolean; location?: Location; onClose: () => void; onSaved: (l: Location) => void }) {
  return (
    <Dialog open={open} title={location ? `Edit ${location.displayName}` : 'Add location'} onClose={onClose}>
      <LocationForm location={location} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}

function LocationForm({ location, onClose, onSaved }: { location?: Location; onClose: () => void; onSaved: (l: Location) => void }) {
  const [form, setForm] = useState<LocationWrite>(() =>
    location
      ? { buildingCode: location.buildingCode, building: location.building, floor: location.floor, room: location.room, description: location.description }
      : { buildingCode: '', building: '', floor: 1, room: '', description: null },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError>()
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    const next: FieldErrors = {}
    if (!/^[A-Za-z0-9]{2,10}$/.test(form.buildingCode.trim())) next.buildingCode = 'Use 2 to 10 letters or numbers, e.g. ENG.'
    if (!form.building.trim()) next.building = 'Building name is required.'
    if (form.floor === null || !Number.isInteger(form.floor) || form.floor < -5 || form.floor > 100) next.floor = 'Floor must be a whole number from -5 to 100.'
    if (!/^[A-Za-z0-9 -]{1,20}$/.test(form.room.trim())) next.room = 'Use up to 20 letters, numbers, spaces or dashes.'
    setErrors(next)
    setServerError(undefined)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    try {
      const body = { ...form, description: form.description?.trim() || null }
      onSaved(location ? await api.locations.update(location.id, body) : await api.locations.create(body))
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err))
      setServerError(apiError)
      setErrors(firstErrors(apiError.fieldErrors))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      {serverError && Object.keys(errors).length === 0 && <ErrorAlert error={serverError} />}
      <div className="grid grid-cols-3 gap-4">
        <TextField label="Building code" required maxLength={10} value={form.buildingCode} error={errors.buildingCode} onChange={(e) => setForm({ ...form, buildingCode: e.target.value })} />
        <TextField
          label="Floor"
          required
          type="number"
          value={form.floor ?? ''}
          error={errors.floor}
          onChange={(e) => setForm({ ...form, floor: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <TextField label="Room" required maxLength={20} value={form.room} error={errors.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
      </div>
      <TextField label="Building name" required maxLength={80} value={form.building} error={errors.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
      <TextField label="Description" maxLength={200} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save location'}
        </Button>
      </div>
    </form>
  )
}

export function DirectoryPage() {
  const [notice, setNotice] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const search = useDebouncedValue(searchText.trim())
  const people = useApi((signal) => api.people.list({ search }, signal), [search])
  const locations = useApi((signal) => api.locations.list(signal), [])

  const [personDialog, setPersonDialog] = useState<{ open: boolean; person?: Person }>({ open: false })
  const [locationDialog, setLocationDialog] = useState<{ open: boolean; location?: Location }>({ open: false })
  const [deleting, setDeleting] = useState<{ kind: 'person'; item: Person } | { kind: 'location'; item: Location } | undefined>()

  const remove = useMutation(async () => {
    if (!deleting) return
    if (deleting.kind === 'person') {
      await api.people.remove(deleting.item.id)
      setNotice(`${deleting.item.fullName} removed.`)
      people.reload()
    } else {
      await api.locations.remove(deleting.item.id)
      setNotice(`${deleting.item.displayName} removed.`)
      locations.reload()
    }
    setDeleting(undefined)
  })

  return (
    <>
      <PageHeader title="People & locations" description="Staff who can be assigned equipment or requests, and the rooms assets and jacks live in." />
      <Notice message={notice} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="People"
          actions={
            <Button variant="primary" size="sm" onClick={() => setPersonDialog({ open: true })}>
              Add person
            </Button>
          }
        >
          <TextField label="Search people" type="search" className="mb-4" value={searchText} maxLength={100} onChange={(e) => setSearchText(e.target.value)} />
          {people.error && <ErrorAlert error={people.error} onRetry={people.reload} />}
          {people.loading && !people.data && <Spinner />}
          {people.data && (
            <div className="max-h-[36rem] overflow-y-auto">
              <Table caption="People">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Department</th>
                    <th className={th}>Assets</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {people.data.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>
                        <span className="font-medium">{p.fullName}</span> {p.isTechnician && <Badge tone="violet">Technician</Badge>}
                        <span className="block text-xs text-slate-500">{p.email}</span>
                      </td>
                      <td className={td}>
                        {p.department}
                        <span className="block text-xs text-slate-500">{p.jobTitle}</span>
                      </td>
                      <td className={td}>{p.assignedAssetCount}</td>
                      <td className={`${td} text-right`}>
                        <Button size="sm" onClick={() => setPersonDialog({ open: true, person: p })} aria-label={`Edit ${p.fullName}`}>
                          Edit
                        </Button>{' '}
                        <Button size="sm" variant="ghost" onClick={() => setDeleting({ kind: 'person', item: p })} aria-label={`Remove ${p.fullName}`}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <Card
          title="Locations"
          actions={
            <Button variant="primary" size="sm" onClick={() => setLocationDialog({ open: true })}>
              Add location
            </Button>
          }
        >
          {locations.error && <ErrorAlert error={locations.error} onRetry={locations.reload} />}
          {locations.loading && !locations.data && <Spinner />}
          {locations.data && (
            <div className="max-h-[40rem] overflow-y-auto">
              <Table caption="Locations">
                <thead>
                  <tr>
                    <th className={th}>Room</th>
                    <th className={th}>Building</th>
                    <th className={th}>Assets</th>
                    <th className={th}>Jacks</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {locations.data.map((l) => (
                    <tr key={l.id}>
                      <td className={`${td} font-mono`}>
                        {l.displayName}
                        <span className="block font-sans text-xs text-slate-500">{l.description}</span>
                      </td>
                      <td className={td}>
                        {l.building}
                        <span className="block text-xs text-slate-500">Floor {l.floor}</span>
                      </td>
                      <td className={td}>{l.assetCount}</td>
                      <td className={td}>{l.jackCount}</td>
                      <td className={`${td} text-right`}>
                        <Button size="sm" onClick={() => setLocationDialog({ open: true, location: l })} aria-label={`Edit ${l.displayName}`}>
                          Edit
                        </Button>{' '}
                        <Button size="sm" variant="ghost" onClick={() => setDeleting({ kind: 'location', item: l })} aria-label={`Remove ${l.displayName}`}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <PersonDialog
        open={personDialog.open}
        person={personDialog.person}
        onClose={() => setPersonDialog({ open: false })}
        onSaved={(p) => {
          setPersonDialog({ open: false })
          setNotice(`${p.fullName} saved.`)
          people.reload()
        }}
      />
      <LocationDialog
        open={locationDialog.open}
        location={locationDialog.location}
        onClose={() => setLocationDialog({ open: false })}
        onSaved={(l) => {
          setLocationDialog({ open: false })
          setNotice(`${l.displayName} saved.`)
          locations.reload()
        }}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting?.kind === 'person' ? `Remove ${deleting.item.fullName}?` : `Remove ${deleting?.item.displayName ?? ''}?`}
        message="Records that are still in use (assigned assets, service requests, jacks or switches) cannot be removed."
        confirmLabel="Remove"
        pending={remove.pending}
        error={remove.error}
        onConfirm={() => void remove.run()}
        onCancel={() => {
          setDeleting(undefined)
          remove.setError(undefined)
        }}
      />
    </>
  )
}

import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { ASSET_STATUSES, ASSET_TYPES, type AssetDetail, type AssetWrite, type Location, type Person } from '../api/types'
import { Button, Card, ErrorAlert, ErrorSummary, PageHeader, SelectField, Spinner, TextAreaField, TextField } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { label } from '../lib/format'
import { firstErrors, todayIso, validateAsset, type FieldErrors } from '../lib/validation'

const FIELD_LABELS: Record<string, string> = {
  assetTag: 'Asset tag',
  type: 'Type',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serialNumber: 'Serial number',
  status: 'Status',
  locationId: 'Location',
  assignedToId: 'Assigned to',
  purchaseDate: 'Purchase date',
  warrantyEndDate: 'Warranty end date',
  notes: 'Notes',
  changeNote: 'Change note',
}

const EMPTY: AssetWrite = {
  assetTag: '',
  type: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  status: 'InStock',
  locationId: null,
  assignedToId: null,
  purchaseDate: null,
  warrantyEndDate: null,
  notes: null,
}

function fromDetail(a: AssetDetail): AssetWrite {
  return {
    assetTag: a.assetTag,
    type: a.type,
    manufacturer: a.manufacturer,
    model: a.model,
    serialNumber: a.serialNumber,
    status: a.status,
    locationId: a.locationId,
    assignedToId: a.assignedToId,
    purchaseDate: a.purchaseDate,
    warrantyEndDate: a.warrantyEndDate,
    notes: a.notes,
    version: a.version,
    changeNote: null,
  }
}

/** Loads the record (when editing) and the lookup lists, then mounts the form with its starting values. */
export function AssetFormPage() {
  const { id } = useParams()
  const assetId = id ? Number(id) : undefined
  const locations = useApi((signal) => api.locations.list(signal), [])
  const people = useApi((signal) => api.people.list({}, signal), [])
  const existing = useApi((signal) => (assetId ? api.assets.get(assetId, signal) : Promise.resolve(undefined)), [assetId])

  if (assetId !== undefined && existing.error) return <ErrorAlert error={existing.error} onRetry={existing.reload} />
  if (assetId !== undefined && !existing.data) return <Spinner label="Loading asset" />

  return (
    <AssetForm
      // A new version from "reload the latest version" remounts the form with fresh values.
      key={existing.data ? `${existing.data.id}-${existing.data.version}` : 'new'}
      existing={existing.data}
      locations={locations.data ?? []}
      people={people.data ?? []}
      onReloadLatest={existing.reload}
    />
  )
}

function AssetForm({
  existing,
  locations,
  people,
  onReloadLatest,
}: {
  existing: AssetDetail | undefined
  locations: Location[]
  people: Person[]
  onReloadLatest: () => void
}) {
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const isEdit = existing !== undefined
  const [form, setForm] = useState<AssetWrite>(() => (existing ? fromDetail(existing) : EMPTY))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError>()
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof AssetWrite>(key: K, value: AssetWrite[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }

  const focusFirstError = () => {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setServerError(undefined)
    const clientErrors = validateAsset(form, todayIso())
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) {
      focusFirstError()
      return
    }

    setSaving(true)
    try {
      const body: AssetWrite = {
        ...form,
        assetTag: form.assetTag.trim(),
        serialNumber: form.serialNumber.trim(),
        notes: form.notes?.trim() ? form.notes.trim() : null,
      }
      const saved = existing ? await api.assets.update(existing.id, body) : await api.assets.create(body)
      navigate(`/assets/${saved.id}`, { state: { notice: isEdit ? 'Changes saved.' : `Asset ${saved.assetTag} added.` } })
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err))
      setServerError(apiError)
      const fieldErrors = firstErrors(apiError.fieldErrors)
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors)
        focusFirstError()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title={existing ? `Edit ${existing.assetTag}` : 'Add asset'}
        description={isEdit ? 'Changes to status, location or assignee are recorded in the assignment history.' : 'Enter the details printed on the device and its asset tag.'}
      />
      <Card>
        <form ref={formRef} noValidate onSubmit={onSubmit} aria-describedby="required-note">
          <p id="required-note" className="mb-4 text-xs text-slate-500">
            Fields marked <span className="text-rose-400">*</span> are required.
          </p>
          <ErrorSummary errors={errors} labels={FIELD_LABELS} />
          {serverError && Object.keys(errors).length === 0 && (
            <div className="mb-4">
              <ErrorAlert error={serverError} />
              {serverError.status === 409 && isEdit && (
                <p className="mt-2 text-sm text-slate-400">
                  If someone else edited this asset,{' '}
                  <button type="button" className="text-sky-300 underline" onClick={onReloadLatest}>
                    reload the latest version
                  </button>{' '}
                  and re-apply your change.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Asset tag" required value={form.assetTag} maxLength={20} error={errors.assetTag} hint="Letters, numbers and dashes, e.g. ACC-100245" onChange={(e) => set('assetTag', e.target.value)} />
            <SelectField label="Type" required value={form.type} error={errors.type} onChange={(e) => set('type', e.target.value as AssetWrite['type'])}>
              <option value="">Choose a type</option>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Status" required value={form.status} error={errors.status} onChange={(e) => set('status', e.target.value as AssetWrite['status'])}>
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </SelectField>
            <TextField label="Manufacturer" required value={form.manufacturer} maxLength={60} error={errors.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
            <TextField label="Model" required value={form.model} maxLength={80} error={errors.model} onChange={(e) => set('model', e.target.value)} />
            <TextField label="Serial number" required value={form.serialNumber} maxLength={40} error={errors.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
            <SelectField
              label="Location"
              value={form.locationId ?? ''}
              error={errors.locationId}
              hint={form.status === 'Deployed' ? 'Required for deployed assets' : undefined}
              onChange={(e) => set('locationId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.displayName} {l.description ? `- ${l.description}` : ''}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Assigned to"
              value={form.assignedToId ?? ''}
              error={errors.assignedToId}
              hint="Only deployed assets can be assigned"
              onChange={(e) => set('assignedToId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.department})
                </option>
              ))}
            </SelectField>
            <div className="hidden lg:block" />
            <TextField label="Purchase date" type="date" value={form.purchaseDate ?? ''} error={errors.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value || null)} />
            <TextField label="Warranty end date" type="date" value={form.warrantyEndDate ?? ''} error={errors.warrantyEndDate} onChange={(e) => set('warrantyEndDate', e.target.value || null)} />
            <div className="hidden lg:block" />
            <TextAreaField label="Notes" className="sm:col-span-2 lg:col-span-3" value={form.notes ?? ''} maxLength={1000} error={errors.notes} onChange={(e) => set('notes', e.target.value)} />
            {isEdit && (
              <TextField
                label="Change note"
                className="sm:col-span-2 lg:col-span-3"
                hint="Optional. Saved with the history entry when status, location or assignee changes."
                value={form.changeNote ?? ''}
                maxLength={300}
                onChange={(e) => set('changeNote', e.target.value)}
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add asset'}
            </Button>
            <Link to={existing ? `/assets/${existing.id}` : '/assets'} className="rounded-lg px-3.5 py-2 text-sm text-slate-300 hover:bg-slate-800">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </>
  )
}

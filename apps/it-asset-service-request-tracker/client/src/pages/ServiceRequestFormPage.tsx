import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, type Person, type ServiceRequestDetail, type ServiceRequestWrite } from '../api/types'
import { Button, Card, ErrorAlert, ErrorSummary, PageHeader, SelectField, Spinner, TextAreaField, TextField } from '../components/ui'
import { useActor } from '../context/actor'
import { useApi, useDebouncedValue } from '../hooks/useApi'
import { label, priorityLabel } from '../lib/format'
import { firstErrors, validateServiceRequest, type FieldErrors } from '../lib/validation'

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  category: 'Category',
  priority: 'Priority',
  requesterId: 'Requester',
  relatedAssetId: 'Related asset',
  relatedJackId: 'Related jack',
  actorId: 'Working as',
}

const EMPTY: ServiceRequestWrite = { title: '', description: '', category: '', priority: 'P3', requesterId: null, relatedAssetId: null, relatedJackId: null }

/** Small search-as-you-type picker for linking an asset or jack. */
function LookupField<T extends { id: number }>({
  label: fieldLabel,
  selectedText,
  error,
  search,
  describe,
  onSelect,
  onClear,
}: {
  label: string
  selectedText: string | null
  error?: string
  search: (term: string, signal: AbortSignal) => Promise<T[]>
  describe: (item: T) => string
  onSelect: (item: T) => void
  onClear: () => void
}) {
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term.trim())
  const results = useApi((signal) => (debounced.length >= 2 ? search(debounced, signal) : Promise.resolve([] as T[])), [debounced])

  if (selectedText) {
    return (
      <div>
        <p className="block text-sm font-medium text-slate-300">{fieldLabel}</p>
        <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <span>{selectedText}</span>
          <Button size="sm" variant="ghost" onClick={onClear} aria-label={`Remove ${fieldLabel.toLowerCase()}`}>
            Remove
          </Button>
        </div>
        {error && <p className="mt-1 text-xs text-rose-300">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <TextField label={fieldLabel} type="search" placeholder="Type at least 2 characters" value={term} maxLength={50} error={error} onChange={(e) => setTerm(e.target.value)} />
      {(results.data ?? []).length > 0 && (
        <ul className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-700 bg-slate-950 text-sm" aria-label={`${fieldLabel} matches`}>
          {results.data!.map((item) => (
            <li key={item.id}>
              <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-800 focus:bg-slate-800" onClick={() => onSelect(item)}>
                {describe(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ServiceRequestFormPage() {
  const { id } = useParams()
  const requestId = id ? Number(id) : undefined
  const [params] = useSearchParams()
  const people = useApi((signal) => api.people.list({}, signal), [])
  const existing = useApi((signal) => (requestId ? api.requests.get(requestId, signal) : Promise.resolve(undefined)), [requestId])
  const presetAssetId = params.get('assetId') ? Number(params.get('assetId')) : undefined
  const presetJackId = params.get('jackId') ? Number(params.get('jackId')) : undefined
  const presetAsset = useApi((signal) => (presetAssetId ? api.assets.get(presetAssetId, signal) : Promise.resolve(undefined)), [presetAssetId])
  const presetJack = useApi((signal) => (presetJackId ? api.jacks.get(presetJackId, signal) : Promise.resolve(undefined)), [presetJackId])

  if (requestId !== undefined && existing.error) return <ErrorAlert error={existing.error} onRetry={existing.reload} />
  if ((requestId !== undefined && !existing.data) || presetAsset.loading || presetJack.loading) return <Spinner label="Loading request" />

  // Starting values: the saved request when editing, otherwise any asset/jack passed in the URL
  // (for example the "Open service request" button on an asset page).
  const r = existing.data
  const a = presetAsset.data
  const j = presetJack.data
  const initial: ServiceRequestWrite = r
    ? { title: r.title, description: r.description, category: r.category, priority: r.priority, requesterId: r.requesterId, relatedAssetId: r.relatedAsset?.id ?? null, relatedJackId: r.relatedJack?.id ?? null }
    : { ...EMPTY, relatedAssetId: a?.id ?? null, relatedJackId: j?.id ?? null, category: a ? 'Hardware' : j ? 'JackActivation' : '' }
  const initialAssetText = r?.relatedAsset ? `${r.relatedAsset.assetTag} - ${r.relatedAsset.description}` : a ? `${a.assetTag} - ${a.manufacturer} ${a.model}` : null
  const initialJackText = r?.relatedJack ? `${r.relatedJack.label} (${r.relatedJack.locationName})` : j ? `${j.label} (${j.locationName})` : null

  return (
    <ServiceRequestForm
      key={r ? `${r.id}-${r.version}` : 'new'}
      existing={r}
      initial={initial}
      initialAssetText={initialAssetText}
      initialJackText={initialJackText}
      people={people.data ?? []}
    />
  )
}

function ServiceRequestForm({
  existing,
  initial,
  initialAssetText,
  initialJackText,
  people,
}: {
  existing: ServiceRequestDetail | undefined
  initial: ServiceRequestWrite
  initialAssetText: string | null
  initialJackText: string | null
  people: Person[]
}) {
  const isEdit = existing !== undefined
  const navigate = useNavigate()
  const { actor } = useActor()
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState<ServiceRequestWrite>(initial)
  const [assetText, setAssetText] = useState<string | null>(initialAssetText)
  const [jackText, setJackText] = useState<string | null>(initialJackText)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError>()
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof ServiceRequestWrite>(key: K, value: ServiceRequestWrite[K]) => setForm((f) => ({ ...f, [key]: value }))

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setServerError(undefined)
    const clientErrors = validateServiceRequest(form, !isEdit)
    if (isEdit && !actor) clientErrors.actorId = 'Choose who you are working as in the header.'
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    setSaving(true)
    try {
      const body = { ...form, title: form.title.trim(), description: form.description.trim() }
      const saved = existing
        ? await api.requests.update(existing.id, { ...body, actorId: actor!.id, version: existing.version })
        : await api.requests.create({ ...body, actorId: actor?.id ?? null })
      navigate(`/requests/${saved.id}`, { state: { notice: isEdit ? 'Request updated.' : `Request ${saved.number} created.` } })
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err))
      setServerError(apiError)
      setErrors(firstErrors(apiError.fieldErrors))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title={existing ? `Edit ${existing.number}` : 'New service request'} description="Describe the problem or request. Link a device or wall jack if it is about one." />
      <Card>
        <form ref={formRef} noValidate onSubmit={onSubmit}>
          <ErrorSummary errors={errors} labels={FIELD_LABELS} />
          {serverError && Object.keys(errors).length === 0 && (
            <div className="mb-4">
              <ErrorAlert error={serverError} />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Title" required className="md:col-span-2" value={form.title} maxLength={120} error={errors.title} placeholder="e.g. Activate data jack 2-214B in ENG 214" onChange={(e) => set('title', e.target.value)} />
            <TextAreaField label="Description" required className="md:col-span-2" rows={5} value={form.description} maxLength={4000} error={errors.description} onChange={(e) => set('description', e.target.value)} />
            <SelectField label="Category" required value={form.category} error={errors.category} onChange={(e) => set('category', e.target.value as ServiceRequestWrite['category'])}>
              <option value="">Choose a category</option>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Priority" required value={form.priority} error={errors.priority} onChange={(e) => set('priority', e.target.value as ServiceRequestWrite['priority'])}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel[p]}
                </option>
              ))}
            </SelectField>
            {!isEdit && (
              <SelectField label="Requester" required value={form.requesterId ?? ''} error={errors.requesterId} onChange={(e) => set('requesterId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Who is this for?</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} - {p.department}
                  </option>
                ))}
              </SelectField>
            )}
            <LookupField
              label="Related asset"
              selectedText={assetText}
              error={errors.relatedAssetId}
              search={async (term, signal) => (await api.assets.list({ search: term, pageSize: 8 }, signal)).items}
              describe={(a) => `${a.assetTag} - ${a.manufacturer} ${a.model}${a.assignedToName ? ` (${a.assignedToName})` : ''}`}
              onSelect={(a) => {
                set('relatedAssetId', a.id)
                setAssetText(`${a.assetTag} - ${a.manufacturer} ${a.model}`)
              }}
              onClear={() => {
                set('relatedAssetId', null)
                setAssetText(null)
              }}
            />
            <LookupField
              label="Related jack"
              selectedText={jackText}
              error={errors.relatedJackId}
              search={async (term, signal) => (await api.jacks.list({ search: term, pageSize: 8 }, signal)).items}
              describe={(j) => `${j.label} - ${j.locationName} (${j.status})`}
              onSelect={(j) => {
                set('relatedJackId', j.id)
                setJackText(`${j.label} (${j.locationName})`)
              }}
              onClear={() => {
                set('relatedJackId', null)
                setJackText(null)
              }}
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create request'}
            </Button>
            <Link to={existing ? `/requests/${existing.id}` : '/requests'} className="rounded-lg px-3.5 py-2 text-sm text-slate-300 hover:bg-slate-800">
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </>
  )
}

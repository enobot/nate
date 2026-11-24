import { Link, useSearchParams } from 'react-router'
import { api } from '../api/endpoints'
import { ASSET_STATUSES, ASSET_TYPES, type AssetStatus, type AssetType } from '../api/types'
import { Badge, Card, EmptyState, ErrorAlert, PageHeader, Pagination, SelectField, Spinner, Table, TextField, td, th } from '../components/ui'
import { useApi, useDebouncedValue } from '../hooks/useApi'
import { assetStatusTone, formatDate, label } from '../lib/format'
import { useState } from 'react'

const SORTABLE: { key: string; label: string }[] = [
  { key: 'assetTag', label: 'Asset tag' },
  { key: 'type', label: 'Type' },
  { key: 'model', label: 'Make / model' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'assignedTo', label: 'Assigned to' },
  { key: 'warrantyEndDate', label: 'Warranty ends' },
]

export function AssetsPage() {
  // Filters live in the URL so a refresh, the back button or a shared link keeps them.
  const [params, setParams] = useSearchParams()
  const [searchText, setSearchText] = useState(params.get('search') ?? '')
  const search = useDebouncedValue(searchText.trim(), 300)
  const status = (params.get('status') ?? '') as AssetStatus | ''
  const type = (params.get('type') ?? '') as AssetType | ''
  const building = params.get('building') ?? ''
  const sort = params.get('sort') ?? 'assetTag'
  const page = Number(params.get('page') ?? '1') || 1
  const warrantyWithinDays = params.get('warrantyWithinDays') ? Number(params.get('warrantyWithinDays')) : undefined

  const locations = useApi((signal) => api.locations.list(signal), [])
  const buildings = [...new Set((locations.data ?? []).map((l) => l.buildingCode))].sort()

  const { data, error, loading, reload } = useApi(
    (signal) => api.assets.list({ search, status, type, building, sort, page, pageSize: 25, warrantyWithinDays }, signal),
    [search, status, type, building, sort, page, warrantyWithinDays],
  )

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  const toggleSort = (key: string) => update({ sort: sort === key ? `-${key}` : key })
  const sortState = (key: string): 'ascending' | 'descending' | undefined =>
    sort === key ? 'ascending' : sort === `-${key}` ? 'descending' : undefined

  return (
    <>
      <PageHeader
        title="Equipment inventory"
        description="Search, filter and manage every tracked device."
        actions={
          <Link to="/assets/new" className="rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
            Add asset
          </Link>
        }
      />

      <Card>
        <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()}>
          <TextField
            label="Search"
            type="search"
            placeholder="Tag, serial, model or person"
            value={searchText}
            maxLength={100}
            onChange={(e) => {
              setSearchText(e.target.value)
              update({ search: e.target.value.trim() || undefined })
            }}
            className="lg:col-span-2"
          />
          <SelectField label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Type" value={type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All types</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Building" value={building} onChange={(e) => update({ building: e.target.value })}>
            <option value="">All buildings</option>
            {buildings.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </SelectField>
        </form>
        {warrantyWithinDays !== undefined && (
          <p className="mt-3 text-sm text-amber-300">
            Showing assets whose warranty ends within {warrantyWithinDays} days.{' '}
            <button type="button" className="underline" onClick={() => update({ warrantyWithinDays: undefined })}>
              Clear
            </button>
          </p>
        )}

        <div className="mt-5">
          {error && <ErrorAlert error={error} onRetry={reload} />}
          {loading && !data && <Spinner label="Loading assets" />}
          {data && data.items.length === 0 && <EmptyState>No assets match these filters.</EmptyState>}
          {data && data.items.length > 0 && (
            <>
              <Table caption="Assets">
                <thead>
                  <tr>
                    {SORTABLE.map((col) => (
                      <th key={col.key} className={th} aria-sort={sortState(col.key)}>
                        <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-slate-100" onClick={() => toggleSort(col.key)}>
                          {col.label}
                          <span aria-hidden="true">{sortState(col.key) === 'ascending' ? '▲' : sortState(col.key) === 'descending' ? '▼' : ''}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y divide-slate-800 ${loading ? 'opacity-60' : ''}`}>
                  {data.items.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/40">
                      <td className={td}>
                        <Link to={`/assets/${a.id}`} className="font-mono text-sky-300 hover:underline">
                          {a.assetTag}
                        </Link>
                      </td>
                      <td className={td}>{label(a.type)}</td>
                      <td className={td}>
                        {a.manufacturer} {a.model}
                      </td>
                      <td className={td}>
                        <Badge tone={assetStatusTone[a.status]}>{label(a.status)}</Badge>
                      </td>
                      <td className={td}>{a.locationName ?? <span className="text-slate-500">None</span>}</td>
                      <td className={td}>{a.assignedToName ?? <span className="text-slate-500">Unassigned</span>}</td>
                      <td className={td}>{formatDate(a.warrantyEndDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} totalPages={data.totalPages} totalCount={data.totalCount} onPage={(p) => update({ page: String(p) })} />
            </>
          )}
        </div>
      </Card>
    </>
  )
}

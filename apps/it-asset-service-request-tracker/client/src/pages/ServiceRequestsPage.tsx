import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/endpoints'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, type TicketCategory, type TicketPriority, type TicketStatus } from '../api/types'
import { Badge, Card, EmptyState, ErrorAlert, PageHeader, Pagination, SelectField, Spinner, Table, TextField, td, th } from '../components/ui'
import { useActor } from '../context/actor'
import { useApi, useDebouncedValue } from '../hooks/useApi'
import { formatDateTime, label, priorityLabel, priorityTone, ticketStatusTone } from '../lib/format'

const SORTS = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'priority', label: 'Priority (P1 first)' },
  { value: '-updatedAt', label: 'Recently updated' },
]

export function ServiceRequestsPage() {
  const [params, setParams] = useSearchParams()
  const { technicians } = useActor()
  const [searchText, setSearchText] = useState(params.get('search') ?? '')
  const search = useDebouncedValue(searchText.trim())
  const status = (params.get('status') ?? '') as TicketStatus | ''
  const priority = (params.get('priority') ?? '') as TicketPriority | ''
  const category = (params.get('category') ?? '') as TicketCategory | ''
  const assignee = params.get('assignee') ?? ''
  const view = params.get('view') ?? 'open'
  const sort = params.get('sort') ?? '-createdAt'
  const page = Number(params.get('page') ?? '1') || 1

  const { data, error, loading, reload } = useApi(
    (signal) =>
      api.requests.list(
        {
          search,
          status,
          priority,
          category,
          sort,
          page,
          pageSize: 25,
          openOnly: view === 'open' || undefined,
          unassigned: assignee === 'none' || undefined,
          assigneeId: assignee && assignee !== 'none' ? Number(assignee) : undefined,
        },
        signal,
      ),
    [search, status, priority, category, assignee, view, sort, page],
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

  return (
    <>
      <PageHeader
        title="Service requests"
        description="Track requests from intake to resolution. Status changes follow the allowed lifecycle."
        actions={
          <Link to="/requests/new" className="rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
            New request
          </Link>
        }
      />
      <Card>
        <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" onSubmit={(e) => e.preventDefault()}>
          <TextField
            label="Search"
            type="search"
            className="lg:col-span-2"
            placeholder="SR number, title, jack or tag"
            value={searchText}
            maxLength={100}
            onChange={(e) => {
              setSearchText(e.target.value)
              update({ search: e.target.value.trim() || undefined })
            }}
          />
          <SelectField label="Show" value={view} onChange={(e) => update({ view: e.target.value === 'open' ? undefined : e.target.value })}>
            <option value="open">Open only</option>
            <option value="all">All requests</option>
          </SelectField>
          <SelectField label="Status" value={status} onChange={(e) => update({ status: e.target.value, view: 'all' })}>
            <option value="">Any status</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Priority" value={priority} onChange={(e) => update({ priority: e.target.value })}>
            <option value="">Any priority</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel[p]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">Any category</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Assignee" value={assignee} onChange={(e) => update({ assignee: e.target.value })}>
            <option value="">Anyone</option>
            <option value="none">Unassigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </SelectField>
        </form>
        <div className="mt-3 flex justify-end">
          <SelectField label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value })} className="w-56">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-4">
          {error && <ErrorAlert error={error} onRetry={reload} />}
          {loading && !data && <Spinner label="Loading requests" />}
          {data && data.items.length === 0 && <EmptyState>No requests match these filters.</EmptyState>}
          {data && data.items.length > 0 && (
            <>
              <Table caption="Service requests">
                <thead>
                  <tr>
                    <th className={th}>Number</th>
                    <th className={th}>Title</th>
                    <th className={th}>Category</th>
                    <th className={th}>Priority</th>
                    <th className={th}>Status</th>
                    <th className={th}>Requester</th>
                    <th className={th}>Assignee</th>
                    <th className={th}>Opened</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-slate-800 ${loading ? 'opacity-60' : ''}`}>
                  {data.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40">
                      <td className={td}>
                        <Link to={`/requests/${r.id}`} className="font-mono text-sky-300 hover:underline">
                          {r.number}
                        </Link>
                      </td>
                      <td className={`${td} max-w-sm truncate`} title={r.title}>
                        {r.title}
                      </td>
                      <td className={td}>{label(r.category)}</td>
                      <td className={td}>
                        <Badge tone={priorityTone[r.priority]}>{r.priority}</Badge>
                      </td>
                      <td className={td}>
                        <Badge tone={ticketStatusTone[r.status]}>{label(r.status)}</Badge>
                      </td>
                      <td className={td}>{r.requesterName}</td>
                      <td className={td}>{r.assigneeName ?? <span className="text-slate-500">Unassigned</span>}</td>
                      <td className={`${td} text-slate-400`}>{formatDateTime(r.createdAt)}</td>
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

import { Link } from 'react-router'
import { api } from '../api/endpoints'
import { Badge, BarList, Card, ErrorAlert, PageHeader, Spinner, StatCard, Table, td, th } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { assetStatusTone, formatDateTime, formatNumber, label, percent, priorityTone, relativeAge, ticketStatusTone } from '../lib/format'

export function DashboardPage() {
  const { data, error, loading, reload } = useApi((signal) => api.dashboard(signal), [])

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={data ? `Live counts from the database. Last loaded ${formatDateTime(data.asOf)}.` : 'Live counts from the database.'}
        actions={
          <button type="button" onClick={reload} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">
            Refresh
          </button>
        }
      />
      {error && <ErrorAlert error={error} onRetry={reload} />}
      {loading && !data && <Spinner label="Loading dashboard" />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total assets" value={formatNumber(data.totalAssets)} sublabel={`${data.assetsByStatus.find((s) => s.key === 'Deployed')?.count ?? 0} deployed`} />
            <StatCard label="Warranty ends in 30 days" value={data.warrantyExpiring30Days} tone={data.warrantyExpiring30Days > 0 ? 'amber' : 'slate'} sublabel="Not retired" />
            <StatCard label="Open requests" value={data.openRequests} tone="blue" sublabel={`${data.unassignedOpenRequests} unassigned`} />
            <StatCard label="Open P1 requests" value={data.openP1Requests} tone={data.openP1Requests > 0 ? 'red' : 'slate'} />
            <StatCard label="Resolved last 7 days" value={data.resolvedLast7Days} tone="green" />
            <StatCard
              label="Avg hours to resolve"
              value={data.avgResolutionHoursLast30Days === null ? '-' : formatNumber(data.avgResolutionHoursLast30Days, 1)}
              sublabel="Resolved in last 30 days"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Assets by status">
              <BarList rows={data.assetsByStatus.map((s) => ({ label: label(s.key), value: s.count, tone: assetStatusTone[s.key] }))} />
            </Card>
            <Card title="Open requests by priority">
              <BarList rows={data.openRequestsByPriority.map((p) => ({ label: p.key, value: p.count, tone: priorityTone[p.key] }))} />
            </Card>
            <Card title="Network jacks">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-400">Active jacks</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-emerald-300">
                    {data.activeJacks}
                    <span className="ml-1 text-sm font-normal text-slate-400">/ {data.totalJacks}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Faulty jacks</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-rose-300">{data.faultyJacks}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400">Access ports in use</dt>
                  <dd className="text-slate-100">
                    {data.patchedPorts} of {data.accessPorts} access ports have a jack patched ({percent(data.patchedPorts, data.accessPorts)}%)
                  </dd>
                </div>
              </dl>
              <Link to="/network" className="mt-4 inline-block text-sm text-sky-300 underline-offset-2 hover:underline">
                Manage switches and jacks
              </Link>
            </Card>
          </div>

          <Card
            title="Newest service requests"
            actions={
              <Link to="/requests" className="text-sm text-sky-300 hover:underline">
                View all
              </Link>
            }
          >
            <Table caption="Newest service requests">
              <thead>
                <tr>
                  <th className={th}>Number</th>
                  <th className={th}>Title</th>
                  <th className={th}>Priority</th>
                  <th className={th}>Status</th>
                  <th className={th}>Assignee</th>
                  <th className={th}>Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.recentRequests.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>
                      <Link to={`/requests/${r.id}`} className="font-mono text-sky-300 hover:underline">
                        {r.number}
                      </Link>
                    </td>
                    <td className={`${td} max-w-xs truncate`}>{r.title}</td>
                    <td className={td}>
                      <Badge tone={priorityTone[r.priority]}>{r.priority}</Badge>
                    </td>
                    <td className={td}>
                      <Badge tone={ticketStatusTone[r.status]}>{label(r.status)}</Badge>
                    </td>
                    <td className={td}>{r.assigneeName ?? <span className="text-slate-500">Unassigned</span>}</td>
                    <td className={`${td} text-slate-400`}>{relativeAge(r.createdAt, new Date(data.asOf))}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </>
  )
}

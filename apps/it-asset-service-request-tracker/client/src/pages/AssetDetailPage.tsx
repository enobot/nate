import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { api } from '../api/endpoints'
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorAlert, Notice, PageHeader, Spinner, Table, td, th } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { assetStatusTone, formatDate, formatDateTime, label, priorityTone, ticketStatusTone } from '../lib/format'

export function AssetDetailPage() {
  const { id } = useParams()
  const assetId = Number(id)
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice ?? null

  const asset = useApi((signal) => api.assets.get(assetId, signal), [assetId])
  const history = useApi((signal) => api.assets.history(assetId, signal), [assetId])
  const tickets = useApi((signal) => api.requests.list({ relatedAssetId: assetId, pageSize: 20 }, signal), [assetId])

  const [confirmOpen, setConfirmOpen] = useState(false)
  const remove = useMutation(async () => {
    await api.assets.remove(assetId)
    navigate('/assets', { replace: true })
  })

  if (asset.error) return <ErrorAlert error={asset.error} onRetry={asset.reload} />
  if (!asset.data) return <Spinner label="Loading asset" />
  const a = asset.data

  return (
    <>
      <Notice message={notice} />
      <PageHeader
        title={a.assetTag}
        description={`${a.manufacturer} ${a.model} - ${label(a.type)}`}
        actions={
          <>
            <Link to={`/assets/${a.id}/edit`} className="rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400">
              Edit
            </Link>
            <Link
              to={`/requests/new?assetId=${a.id}`}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              Open service request
            </Link>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-400">Status</dt>
            <dd>
              <Badge tone={assetStatusTone[a.status]}>{label(a.status)}</Badge>
            </dd>
            <dt className="text-slate-400">Serial</dt>
            <dd className="font-mono">{a.serialNumber}</dd>
            <dt className="text-slate-400">Location</dt>
            <dd>{a.locationName ?? 'None'}</dd>
            <dt className="text-slate-400">Assigned to</dt>
            <dd>{a.assignedToName ?? 'Unassigned'}</dd>
            <dt className="text-slate-400">Purchased</dt>
            <dd>{formatDate(a.purchaseDate) || '-'}</dd>
            <dt className="text-slate-400">Warranty ends</dt>
            <dd>{formatDate(a.warrantyEndDate) || '-'}</dd>
            <dt className="text-slate-400">Open requests</dt>
            <dd>{a.openRequestCount}</dd>
            <dt className="text-slate-400">Last updated</dt>
            <dd>{formatDateTime(a.updatedAt)}</dd>
          </dl>
          {a.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-sm text-slate-300">{a.notes}</p>}
        </Card>

        <Card title="Assignment history" className="lg:col-span-2">
          {history.error && <ErrorAlert error={history.error} onRetry={history.reload} />}
          {history.loading && !history.data && <Spinner />}
          {history.data && history.data.length === 0 && <EmptyState>No changes recorded yet.</EmptyState>}
          {history.data && history.data.length > 0 && (
            <ol className="space-y-3">
              {history.data.map((h) => (
                <li key={h.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs text-slate-500">{formatDateTime(h.changedAt)}</p>
                  <p className="mt-1 text-slate-200">
                    {h.fromStatus && h.fromStatus !== h.toStatus ? `${label(h.fromStatus)} -> ${label(h.toStatus)}` : label(h.toStatus)}
                  </p>
                  {(h.fromAssignee || h.toAssignee) && (
                    <p className="text-slate-400">
                      Assignee: {h.fromAssignee ?? 'none'} {'->'} {h.toAssignee ?? 'none'}
                    </p>
                  )}
                  {(h.fromLocation || h.toLocation) && (
                    <p className="text-slate-400">
                      Location: {h.fromLocation ?? 'none'} {'->'} {h.toLocation ?? 'none'}
                    </p>
                  )}
                  {h.note && <p className="mt-1 italic text-slate-300">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Related service requests" className="mt-6">
        {tickets.error && <ErrorAlert error={tickets.error} onRetry={tickets.reload} />}
        {tickets.data && tickets.data.items.length === 0 && <EmptyState>No service requests mention this asset.</EmptyState>}
        {tickets.data && tickets.data.items.length > 0 && (
          <Table caption="Service requests for this asset">
            <thead>
              <tr>
                <th className={th}>Number</th>
                <th className={th}>Title</th>
                <th className={th}>Priority</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tickets.data.items.map((r) => (
                <tr key={r.id}>
                  <td className={td}>
                    <Link className="font-mono text-sky-300 hover:underline" to={`/requests/${r.id}`}>
                      {r.number}
                    </Link>
                  </td>
                  <td className={td}>{r.title}</td>
                  <td className={td}>
                    <Badge tone={priorityTone[r.priority]}>{r.priority}</Badge>
                  </td>
                  <td className={td}>
                    <Badge tone={ticketStatusTone[r.status]}>{label(r.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${a.assetTag}?`}
        message={
          <p>
            This permanently removes the asset and its assignment history. Assets linked to service requests cannot be deleted; retire them
            instead.
          </p>
        }
        confirmLabel="Delete asset"
        pending={remove.pending}
        error={remove.error}
        onConfirm={() => void remove.run()}
        onCancel={() => {
          setConfirmOpen(false)
          remove.setError(undefined)
        }}
      />
    </>
  )
}

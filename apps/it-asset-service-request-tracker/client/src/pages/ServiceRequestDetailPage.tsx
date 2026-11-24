import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { ServiceRequestDetail, TicketEvent, TicketStatus } from '../api/types'
import { Badge, Button, Card, ErrorAlert, Notice, PageHeader, SelectField, Spinner, TextAreaField } from '../components/ui'
import { useActor } from '../context/actor'
import { useApi } from '../hooks/useApi'
import { formatDateTime, jackStatusTone, label, priorityLabel, priorityTone, ticketStatusTone } from '../lib/format'

const ACTION_LABEL: Record<TicketStatus, string> = {
  New: 'Move to New',
  Assigned: 'Mark assigned',
  InProgress: 'Start work',
  Resolved: 'Resolve',
  Closed: 'Close',
  Reopened: 'Reopen',
}

/** Statuses that need a note before the API will accept them. */
const NOTE_REQUIRED: Partial<Record<TicketStatus, string>> = {
  Resolved: 'Resolution notes',
  Reopened: 'Reason for reopening',
}

function describeEvent(e: TicketEvent): string {
  switch (e.type) {
    case 'Created':
      return 'opened the request'
    case 'Assigned':
      return e.fromAssignee ? `reassigned from ${e.fromAssignee} to ${e.toAssignee}` : `assigned to ${e.toAssignee}`
    case 'StatusChanged':
      return `changed status from ${label(e.fromStatus)} to ${label(e.toStatus)}`
    case 'Comment':
      return 'added a comment'
    case 'Updated':
      return 'edited the request'
  }
}

export function ServiceRequestDetailPage() {
  const { id } = useParams()
  const requestId = Number(id)
  const location = useLocation()
  const { actor, technicians } = useActor()
  const loaded = useApi((signal) => api.requests.get(requestId, signal), [requestId])
  // After each action the API returns the updated request, which replaces the loaded copy.
  const [latest, setLatest] = useState<ServiceRequestDetail>()
  const r = latest && latest.id === requestId && (!loaded.data || latest.version >= loaded.data.version) ? latest : loaded.data

  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)
  const [actionError, setActionError] = useState<ApiError>()
  const [pending, setPending] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string>()
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string>()

  const run = async (action: () => Promise<ServiceRequestDetail>, message: string) => {
    if (pending) return false
    if (!actor) {
      setActionError(new ApiError(0, 'No technician selected', 'Choose who you are working as in the header first.'))
      return false
    }
    setPending(true)
    setActionError(undefined)
    try {
      const updated = await action()
      setLatest(updated)
      setNotice(message)
      return true
    } catch (err) {
      setActionError(err instanceof ApiError ? err : new ApiError(0, 'Unexpected error', String(err)))
      if (err instanceof ApiError && err.status === 409) loaded.reload()
      return false
    } finally {
      setPending(false)
    }
  }

  if (loaded.error && !r) return <ErrorAlert error={loaded.error} onRetry={loaded.reload} />
  if (!r) return <Spinner label="Loading request" />

  const startStatusChange = (status: TicketStatus) => {
    setNoteError(undefined)
    setNote('')
    if (NOTE_REQUIRED[status]) {
      setPendingStatus(status)
    } else {
      void run(() => api.requests.changeStatus(r.id, status, actor!.id, r.version, null), `Status changed to ${label(status)}.`)
    }
  }

  const submitStatusWithNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!pendingStatus) return
    if (note.trim().length < 5) {
      setNoteError(`${NOTE_REQUIRED[pendingStatus]} must be at least 5 characters.`)
      return
    }
    const ok = await run(() => api.requests.changeStatus(r.id, pendingStatus, actor!.id, r.version, note.trim()), `Status changed to ${label(pendingStatus)}.`)
    if (ok) {
      setPendingStatus(null)
      setNote('')
    }
  }

  const canAssign = r.status !== 'Resolved' && r.status !== 'Closed'

  return (
    <>
      <Link to="/requests" className="text-sm text-sky-300 hover:underline">
        Back to service requests
      </Link>
      <PageHeader
        title={`${r.number}: ${r.title}`}
        description={`Opened ${formatDateTime(r.createdAt)} for ${r.requesterName}`}
        actions={
          r.status !== 'Closed' ? (
            <Link to={`/requests/${r.id}/edit`} className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium hover:bg-slate-700">
              Edit details
            </Link>
          ) : undefined
        }
      />
      <Notice message={notice} />
      {actionError && (
        <div className="mb-4">
          <ErrorAlert error={actionError} />
          {actionError.status === 409 && <p className="mt-1 text-sm text-slate-400">The request was reloaded with the latest changes.</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Request">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone={ticketStatusTone[r.status]}>{label(r.status)}</Badge>
              <Badge tone={priorityTone[r.priority]}>{priorityLabel[r.priority]}</Badge>
              <Badge>{label(r.category)}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-200">{r.description}</p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Assignee</dt>
                <dd>{r.assigneeName ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Last updated</dt>
                <dd>{formatDateTime(r.updatedAt)}</dd>
              </div>
              {r.relatedAsset && (
                <div>
                  <dt className="text-slate-400">Related asset</dt>
                  <dd>
                    <Link to={`/assets/${r.relatedAsset.id}`} className="text-sky-300 hover:underline">
                      {r.relatedAsset.assetTag}
                    </Link>{' '}
                    {r.relatedAsset.description}
                  </dd>
                </div>
              )}
              {r.relatedJack && (
                <div>
                  <dt className="text-slate-400">Related jack</dt>
                  <dd className="flex items-center gap-2">
                    <Link to={`/network?tab=jacks`} className="font-mono text-sky-300 hover:underline">
                      {r.relatedJack.label}
                    </Link>
                    <span className="text-slate-400">{r.relatedJack.locationName}</span>
                    <Badge tone={jackStatusTone[r.relatedJack.status]}>{r.relatedJack.status}</Badge>
                  </dd>
                </div>
              )}
              {r.resolvedAt && (
                <div>
                  <dt className="text-slate-400">Resolved</dt>
                  <dd>{formatDateTime(r.resolvedAt)}</dd>
                </div>
              )}
              {r.closedAt && (
                <div>
                  <dt className="text-slate-400">Closed</dt>
                  <dd>{formatDateTime(r.closedAt)}</dd>
                </div>
              )}
            </dl>
            {r.resolutionNotes && (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                <p className="font-medium text-emerald-300">Resolution</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-200">{r.resolutionNotes}</p>
              </div>
            )}
          </Card>

          <Card title="History">
            <ol className="relative space-y-4 border-l border-slate-700 pl-5">
              {r.history.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-sky-400 ring-4 ring-slate-900" aria-hidden="true" />
                  <p className="text-sm text-slate-200">
                    <span className="font-medium">{e.actorName || 'Someone'}</span> {describeEvent(e)}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</p>
                  {e.text && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-950 p-2 text-sm text-slate-300">{e.text}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Workflow">
            {r.allowedTransitions.length === 0 ? (
              <p className="text-sm text-slate-400">This request is closed. Closed requests cannot change status.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Allowed status changes">
                {r.allowedTransitions.map((s) => (
                  <Button key={s} variant={s === 'Resolved' ? 'primary' : 'secondary'} disabled={pending} onClick={() => startStatusChange(s)}>
                    {ACTION_LABEL[s]}
                  </Button>
                ))}
              </div>
            )}
            {pendingStatus && (
              <form className="mt-4 space-y-3" onSubmit={submitStatusWithNote} noValidate>
                <TextAreaField label={NOTE_REQUIRED[pendingStatus]!} required value={note} maxLength={2000} error={noteError} autoFocus onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" disabled={pending}>
                    {pending ? 'Saving...' : ACTION_LABEL[pendingStatus]}
                  </Button>
                  <Button onClick={() => setPendingStatus(null)}>Cancel</Button>
                </div>
              </form>
            )}
            <p className="mt-3 text-xs text-slate-500">Only the next steps allowed by the server are shown.</p>
          </Card>

          {canAssign && (
            <Card title={r.assigneeName ? 'Reassign' : 'Assign'}>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!assigneeId) return
                  const name = technicians.find((t) => t.id === Number(assigneeId))?.fullName ?? 'technician'
                  void run(() => api.requests.assign(r.id, Number(assigneeId), actor!.id, r.version), `Assigned to ${name}.`).then((ok) => ok && setAssigneeId(''))
                }}
              >
                <SelectField label="Technician" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Choose a technician</option>
                  {technicians
                    .filter((t) => t.id !== r.assigneeId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} - {t.jobTitle}
                      </option>
                    ))}
                </SelectField>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" disabled={!assigneeId || pending}>
                    Assign
                  </Button>
                  {actor && actor.id !== r.assigneeId && (
                    <Button disabled={pending} onClick={() => void run(() => api.requests.assign(r.id, actor.id, actor.id, r.version), `Assigned to ${actor.fullName}.`)}>
                      Assign to me
                    </Button>
                  )}
                </div>
              </form>
            </Card>
          )}

          <Card title="Add comment">
            <form
              className="space-y-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (comment.trim().length < 2) {
                  setCommentError('Write at least 2 characters.')
                  return
                }
                setCommentError(undefined)
                void run(() => api.requests.comment(r.id, comment.trim(), actor!.id), 'Comment added.').then((ok) => ok && setComment(''))
              }}
            >
              <TextAreaField label="Comment" value={comment} maxLength={2000} error={commentError} hint={actor ? `Posted as ${actor.fullName}` : undefined} onChange={(e) => setComment(e.target.value)} />
              <Button type="submit" disabled={pending}>
                Post comment
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  )
}

import { useState } from 'react'
import { api } from '../api/endpoints'
import { Button, Card, ConfirmDialog, ErrorAlert, Notice, PageHeader, Spinner } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'

const COUNT_LABELS: Record<string, string> = {
  assets: 'Assets',
  people: 'People',
  locations: 'Locations',
  switches: 'Switches',
  ports: 'Switch ports',
  jacks: 'Jacks',
  serviceRequests: 'Service requests',
  openServiceRequests: 'Open service requests',
}

export function AboutPage() {
  const info = useApi((signal) => api.demo.info(signal), [])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const reset = useMutation(async () => {
    await api.demo.reset()
    setConfirmOpen(false)
    setNotice('Demo data was reset. Reload other pages to see the fresh data.')
    info.reload()
  })

  return (
    <>
      <PageHeader title="About this demo" description="What is real here, and what is not." />
      <Notice message={notice} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Fictional organization">
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              <strong>Alder Creek College</strong> is an invented organization. Every person, building, room, device, serial number and
              service request in this database was created by the demo seeder. Email addresses use the reserved <code>.example</code> domain.
            </p>
            <p>
              The data is stored in a local SQLite file by the ASP.NET Core API. Every number on the dashboard and reports pages is queried from
              that database when the page loads.
            </p>
            <p>
              <strong>No sign-in:</strong> this local demo has no authentication. The &quot;Working as&quot; picker in the header only records
              which technician performed a ticket action; the server cannot verify it. A real deployment would need sign-in and role-based
              permissions.
            </p>
          </div>
        </Card>
        <Card title="Database contents">
          {info.error && <ErrorAlert error={info.error} onRetry={info.reload} />}
          {info.loading && !info.data && <Spinner />}
          {info.data && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(info.data.counts).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-slate-950 p-3">
                    <dt className="text-xs text-slate-400">{COUNT_LABELS[key] ?? key}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5">
                {info.data.resetEnabled ? (
                  <>
                    <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                      Reset demo data
                    </Button>
                    <p className="mt-2 text-xs text-slate-500">Deletes everything and reloads the same fictional dataset. Useful before recording a demo.</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Demo reset is turned off on this server (Demo:EnableResetEndpoint is false).</p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Reset all demo data?"
        message="Every asset, jack, switch, person, location and service request will be deleted and replaced with the original demo data. Changes you made will be lost."
        confirmLabel="Reset data"
        pending={reset.pending}
        error={reset.error}
        onConfirm={() => void reset.run()}
        onCancel={() => {
          setConfirmOpen(false)
          reset.setError(undefined)
        }}
      />
    </>
  )
}

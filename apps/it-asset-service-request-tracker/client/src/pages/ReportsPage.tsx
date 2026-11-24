import { useState } from 'react'
import { api } from '../api/endpoints'
import type { ReportDefinition } from '../api/types'
import { BarList, Button, Card, EmptyState, ErrorAlert, PageHeader, Spinner, Table, TextField, td, th } from '../components/ui'
import { useApi, useDebouncedValue } from '../hooks/useApi'
import { downloadCsv, toCsv } from '../lib/csv'
import { formatDate, label } from '../lib/format'

type Row = Record<string, unknown>

/** Which column to draw as a bar for each report, and which id columns to hide. */
const CHARTS: Record<string, { labelKey: string; valueKey: string; suffix?: string }> = {
  'assets-by-status': { labelKey: 'label', valueKey: 'count' },
  'assets-by-building': { labelKey: 'building', valueKey: 'total' },
  'open-tickets-by-priority': { labelKey: 'priority', valueKey: 'openCount' },
  'ticket-aging': { labelKey: 'bucket', valueKey: 'count' },
  'resolution-time': { labelKey: 'category', valueKey: 'avgHoursToResolve', suffix: 'h avg' },
  'jack-utilization': { labelKey: 'switchName', valueKey: 'utilizationPercent', suffix: '%' },
  'technician-workload': { labelKey: 'technician', valueKey: 'openAssigned', suffix: 'open' },
}
const HIDDEN_COLUMNS = new Set(['sortOrder', 'switchId', 'personId', 'assetId'])

function columnTitle(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

function cell(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (key.toLowerCase().endsWith('date') && typeof value === 'string') return formatDate(value)
  if (typeof value === 'string') return label(value)
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

function ReportCard({ definition }: { definition: ReportDefinition }) {
  const [daysText, setDaysText] = useState('90')
  const days = useDebouncedValue(daysText, 400)
  const daysNumber = Number(days)
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 730
  const needsDays = definition.key === 'warranty-expiring'
  const [showSql, setShowSql] = useState(false)

  const result = useApi(
    (signal) =>
      needsDays && !daysValid ? Promise.resolve<Row[]>([]) : api.reports.run<Row>(definition.key, needsDays ? { days: daysNumber } : {}, signal),
    [definition.key, needsDays ? days : ''],
  )
  const rows = result.data ?? []
  const columns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => !HIDDEN_COLUMNS.has(k)) : []
  const chart = CHARTS[definition.key]

  return (
    <Card
      title={definition.title}
      actions={
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowSql((s) => !s)} aria-expanded={showSql}>
            {showSql ? 'Hide SQL' : 'Show SQL'}
          </Button>
          <Button
            size="sm"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(`${definition.key}.csv`, toCsv(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])))))}
          >
            Export CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={result.reload}>
            Refresh
          </Button>
        </div>
      }
    >
      <p className="-mt-2 mb-4 text-sm text-slate-400">{definition.description}</p>
      {needsDays && (
        <TextField
          label="Days ahead"
          type="number"
          min={1}
          max={730}
          className="mb-4 w-40"
          value={daysText}
          error={daysValid || daysText === '' ? undefined : 'Enter 1 to 730'}
          onChange={(e) => setDaysText(e.target.value)}
        />
      )}
      {showSql && (
        <div className="mb-4">
          <pre className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
            <code>{definition.sql}</code>
          </pre>
          {definition.parameters.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">Parameters (sent as DbParameters, never concatenated): {definition.parameters.join(', ')}</p>
          )}
        </div>
      )}
      {result.error && <ErrorAlert error={result.error} onRetry={result.reload} />}
      {result.loading && !result.data && <Spinner label="Running query" />}
      {result.data && rows.length === 0 && <EmptyState>The query returned no rows.</EmptyState>}
      {rows.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-5">
          {chart && (
            <div className="xl:col-span-2">
              <BarList
                rows={rows.map((r) => ({
                  label: cell(chart.labelKey, r[chart.labelKey]),
                  value: Number(r[chart.valueKey] ?? 0),
                  hint: chart.suffix,
                }))}
              />
            </div>
          )}
          <div className={chart ? 'xl:col-span-3' : 'xl:col-span-5'}>
            <Table caption={definition.title}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className={th}>
                      {columnTitle(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c} className={td}>
                        {cell(c, r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  )
}

export function ReportsPage() {
  const definitions = useApi((signal) => api.reports.definitions(signal), [])
  return (
    <>
      <PageHeader title="Reports" description="Each report is a parameterized SQL query run against the SQLite database when the page loads." />
      {definitions.error && <ErrorAlert error={definitions.error} onRetry={definitions.reload} />}
      {definitions.loading && !definitions.data && <Spinner label="Loading reports" />}
      <div className="space-y-6">
        {(definitions.data ?? []).map((d) => (
          <ReportCard key={d.key} definition={d} />
        ))}
      </div>
    </>
  )
}

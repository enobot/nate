/**
 * Converts report rows to CSV text (RFC 4180 quoting). Cells that start with = + - @ are
 * prefixed with an apostrophe so spreadsheet apps do not run them as formulas.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: unknown): string => {
    let text = value === null || value === undefined ? '' : String(value)
    if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\r\n')
}

/** Saves CSV text as a file through a temporary object URL. */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

import type { AssetStatus, AssetType, JackStatus, TicketCategory, TicketPriority, TicketStatus } from '../api/types'

const LABELS: Record<string, string> = {
  InStock: 'In stock',
  InRepair: 'In repair',
  InProgress: 'In progress',
  VoipPhone: 'VoIP phone',
  AccessPoint: 'Access point',
  JackActivation: 'Jack activation',
  AccountAccess: 'Account access',
}

/** Turns enum names such as "InRepair" into readable labels such as "In repair". */
export function label(value: string | null | undefined): string {
  if (!value) return ''
  return LABELS[value] ?? value
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

/** API timestamps are UTC ISO strings; show them in the viewer's local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date)
}

/** Date-only values ("2026-06-15") have no time zone, so format them as UTC to avoid an off-by-one day. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

export function relativeAge(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  const hours = ms / 36e5
  if (hours < 1) return `${Math.max(1, Math.round(ms / 6e4))} min ago`
  if (hours < 24) return `${Math.round(hours)} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10
}

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet'

export const assetStatusTone: Record<AssetStatus, Tone> = {
  Deployed: 'green',
  InStock: 'blue',
  InRepair: 'amber',
  Retired: 'slate',
}

export const jackStatusTone: Record<JackStatus, Tone> = {
  Active: 'green',
  Inactive: 'slate',
  Faulty: 'red',
}

export const ticketStatusTone: Record<TicketStatus, Tone> = {
  New: 'blue',
  Assigned: 'violet',
  InProgress: 'amber',
  Resolved: 'green',
  Closed: 'slate',
  Reopened: 'red',
}

export const priorityTone: Record<TicketPriority, Tone> = {
  P1: 'red',
  P2: 'amber',
  P3: 'blue',
  P4: 'slate',
}

export const priorityLabel: Record<TicketPriority, string> = {
  P1: 'P1 - Critical',
  P2: 'P2 - High',
  P3: 'P3 - Moderate',
  P4: 'P4 - Low',
}

export const assetTypeLabel = (t: AssetType) => label(t)
export const categoryLabel = (c: TicketCategory) => label(c)

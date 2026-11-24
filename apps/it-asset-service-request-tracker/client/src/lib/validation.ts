/**
 * Client-side checks that mirror the server's DataAnnotations and business rules. They exist so
 * people get instant feedback; the API still validates everything because the browser can be bypassed.
 */
import type { AssetWrite, ServiceRequestWrite } from '../api/types'

export type FieldErrors = Record<string, string>

const IDENTIFIER = /^[A-Za-z0-9-]+$/

export function validateAsset(form: AssetWrite, today: string): FieldErrors {
  const errors: FieldErrors = {}
  const tag = form.assetTag.trim()
  if (!tag) errors.assetTag = 'Asset tag is required.'
  else if (tag.length < 3 || tag.length > 20) errors.assetTag = 'Asset tag must be 3 to 20 characters.'
  else if (!IDENTIFIER.test(tag)) errors.assetTag = 'Asset tag may contain only letters, numbers and dashes.'

  const serial = form.serialNumber.trim()
  if (!serial) errors.serialNumber = 'Serial number is required.'
  else if (serial.length < 3 || serial.length > 40) errors.serialNumber = 'Serial number must be 3 to 40 characters.'
  else if (!IDENTIFIER.test(serial)) errors.serialNumber = 'Serial number may contain only letters, numbers and dashes.'

  if (!form.type) errors.type = 'Choose a type.'
  if (!form.status) errors.status = 'Choose a status.'
  if (!form.manufacturer.trim()) errors.manufacturer = 'Manufacturer is required.'
  else if (form.manufacturer.length > 60) errors.manufacturer = 'Manufacturer must be 60 characters or fewer.'
  if (!form.model.trim()) errors.model = 'Model is required.'
  else if (form.model.length > 80) errors.model = 'Model must be 80 characters or fewer.'

  if (form.assignedToId !== null && form.status && form.status !== 'Deployed') {
    errors.assignedToId = 'Only deployed assets can be assigned to a person.'
  }
  if (form.status === 'Deployed' && form.locationId === null) errors.locationId = 'A deployed asset needs a location.'
  if (form.purchaseDate && form.purchaseDate > today) errors.purchaseDate = 'Purchase date cannot be in the future.'
  if (form.purchaseDate && form.warrantyEndDate && form.warrantyEndDate < form.purchaseDate) {
    errors.warrantyEndDate = 'Warranty end date must be on or after the purchase date.'
  }
  if (form.notes && form.notes.length > 1000) errors.notes = 'Notes must be 1000 characters or fewer.'
  return errors
}

export function validateServiceRequest(form: ServiceRequestWrite, requireRequester: boolean): FieldErrors {
  const errors: FieldErrors = {}
  const title = form.title.trim()
  if (title.length < 5) errors.title = 'Title must be at least 5 characters.'
  else if (title.length > 120) errors.title = 'Title must be 120 characters or fewer.'
  const description = form.description.trim()
  if (description.length < 10) errors.description = 'Description must be at least 10 characters.'
  else if (description.length > 4000) errors.description = 'Description must be 4000 characters or fewer.'
  if (!form.category) errors.category = 'Choose a category.'
  if (!form.priority) errors.priority = 'Choose a priority.'
  if (requireRequester && form.requesterId === null) errors.requesterId = 'Choose who the request is for.'
  return errors
}

export function isValidVlanId(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 4094
}

/** Same RFC 1918 check as NetworkRules.IsPrivateIPv4 on the server. */
export function isPrivateIPv4(value: string): boolean {
  const parts = value.trim().split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false
  const [a, b, c, d] = parts.map(Number)
  if ([a, b, c, d].some((n) => n > 255)) return false
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** Takes the first server message for each field, so server and client errors render the same way. */
export function firstErrors(errors: Record<string, string[]>): FieldErrors {
  const result: FieldErrors = {}
  for (const [key, messages] of Object.entries(errors)) {
    if (messages.length > 0) result[key] = messages[0]
  }
  return result
}

export function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

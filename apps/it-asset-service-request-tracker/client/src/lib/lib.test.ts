import { describe, expect, it } from 'vitest'
import type { AssetWrite } from '../api/types'
import { toCsv } from './csv'
import { formatDate, label } from './format'
import { isPrivateIPv4, isValidVlanId, validateAsset, validateServiceRequest } from './validation'

const validAsset: AssetWrite = {
  assetTag: 'ACC-100245',
  type: 'Laptop',
  manufacturer: 'Dell',
  model: 'Latitude 5450',
  serialNumber: 'LT7KQ2M9XA',
  status: 'Deployed',
  locationId: 4,
  assignedToId: 9,
  purchaseDate: '2026-01-10',
  warrantyEndDate: '2029-01-10',
  notes: null,
}

describe('validateAsset', () => {
  it('accepts a valid deployed asset', () => {
    expect(validateAsset(validAsset, '2026-06-15')).toEqual({})
  })

  it('mirrors the server rules for assignment, location and dates', () => {
    const errors = validateAsset(
      { ...validAsset, status: 'InStock', locationId: null, purchaseDate: '2026-07-01', warrantyEndDate: '2026-06-30' },
      '2026-06-15',
    )
    expect(Object.keys(errors).sort()).toEqual(['assignedToId', 'purchaseDate', 'warrantyEndDate'])
    expect(validateAsset({ ...validAsset, locationId: null }, '2026-06-15').locationId).toBe('A deployed asset needs a location.')
  })

  it('rejects tags with spaces or symbols', () => {
    expect(validateAsset({ ...validAsset, assetTag: 'ACC 1;' }, '2026-06-15').assetTag).toMatch(/letters, numbers and dashes/)
  })
})

describe('validateServiceRequest', () => {
  it('requires title, description, category and requester', () => {
    const errors = validateServiceRequest(
      { title: 'Hi', description: 'short', category: '', priority: 'P3', requesterId: null, relatedAssetId: null, relatedJackId: null },
      true,
    )
    expect(Object.keys(errors).sort()).toEqual(['category', 'description', 'requesterId', 'title'])
  })
})

describe('network validation', () => {
  it.each([
    [1, true],
    [4094, true],
    [0, false],
    [4095, false],
    [10.5, false],
  ])('VLAN %s valid=%s', (vlan, expected) => {
    expect(isValidVlanId(vlan)).toBe(expected)
  })

  it.each([
    ['10.20.30.2', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['8.8.8.8', false],
    ['10.1', false],
    ['10.1.1.300', false],
  ])('IP %s private=%s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected)
  })
})

describe('toCsv', () => {
  it('quotes commas, quotes and new lines, and neutralizes formulas', () => {
    const csv = toCsv([
      { name: 'Smith, Jo', note: 'He said "hi"', formula: '=SUM(A1)', count: -3 },
      { name: 'Plain', note: 'line1\nline2', formula: '@cmd', count: 4 },
    ])
    expect(csv.split('\r\n')).toEqual([
      'name,note,formula,count',
      `"Smith, Jo","He said ""hi""",'=SUM(A1),-3`,
      `Plain,"line1\nline2",'@cmd,4`,
    ])
  })

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })
})

describe('format helpers', () => {
  it('labels enum values', () => {
    expect(label('InRepair')).toBe('In repair')
    expect(label('Deployed')).toBe('Deployed')
  })

  it('formats date-only values as the same calendar day', () => {
    expect(formatDate('2026-01-31')).toContain('31')
    expect(formatDate('2026-01-31')).toContain('2026')
  })
})

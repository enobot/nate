// TypeScript shapes of the JSON returned by the ASP.NET Core API (see src/ItAssetTracker.Api/Contracts).

export const ASSET_TYPES = ['Laptop', 'Desktop', 'Monitor', 'Printer', 'VoipPhone', 'Tablet', 'Projector', 'AccessPoint', 'Other'] as const
export const ASSET_STATUSES = ['InStock', 'Deployed', 'InRepair', 'Retired'] as const
export const JACK_TYPES = ['Data', 'Voice'] as const
export const JACK_STATUSES = ['Active', 'Inactive', 'Faulty'] as const
export const PORT_STATUSES = ['Enabled', 'Disabled'] as const
export const PORT_ROLES = ['Access', 'Uplink'] as const
export const TICKET_STATUSES = ['New', 'Assigned', 'InProgress', 'Resolved', 'Closed', 'Reopened'] as const
export const TICKET_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const
export const TICKET_CATEGORIES = ['JackActivation', 'Network', 'Hardware', 'Software', 'Telephone', 'AccountAccess', 'Other'] as const

export type AssetType = (typeof ASSET_TYPES)[number]
export type AssetStatus = (typeof ASSET_STATUSES)[number]
export type JackType = (typeof JACK_TYPES)[number]
export type JackStatus = (typeof JACK_STATUSES)[number]
export type PortAdminStatus = (typeof PORT_STATUSES)[number]
/** Access ports take wall jacks; the uplink connects the switch to the core and never takes a jack. */
export type PortRole = (typeof PORT_ROLES)[number]
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export type TicketEventType = 'Created' | 'StatusChanged' | 'Assigned' | 'Comment' | 'Updated'

export interface PagedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AssetListItem {
  id: number
  assetTag: string
  type: AssetType
  manufacturer: string
  model: string
  serialNumber: string
  status: AssetStatus
  locationId: number | null
  locationName: string | null
  assignedToId: number | null
  assignedToName: string | null
  purchaseDate: string | null
  warrantyEndDate: string | null
}

export interface AssetDetail extends AssetListItem {
  notes: string | null
  createdAt: string
  updatedAt: string
  version: number
  openRequestCount: number
}

export interface AssetHistoryEntry {
  id: number
  changedAt: string
  fromStatus: string | null
  toStatus: string | null
  fromAssignee: string | null
  toAssignee: string | null
  fromLocation: string | null
  toLocation: string | null
  note: string | null
}

export interface AssetWrite {
  assetTag: string
  type: AssetType | ''
  manufacturer: string
  model: string
  serialNumber: string
  status: AssetStatus | ''
  locationId: number | null
  assignedToId: number | null
  purchaseDate: string | null
  warrantyEndDate: string | null
  notes: string | null
  version?: number
  changeNote?: string | null
}

export interface Location {
  id: number
  buildingCode: string
  building: string
  floor: number
  room: string
  description: string | null
  displayName: string
  assetCount: number
  jackCount: number
}

export interface LocationWrite {
  buildingCode: string
  building: string
  floor: number | null
  room: string
  description: string | null
}

export interface Person {
  id: number
  firstName: string
  lastName: string
  fullName: string
  email: string
  department: string
  jobTitle: string | null
  isTechnician: boolean
  assignedAssetCount: number
}

export interface PersonWrite {
  firstName: string
  lastName: string
  email: string
  department: string
  jobTitle: string | null
  isTechnician: boolean
}

export interface Vlan {
  vlanId: number
  name: string
  description: string | null
  portCount: number
}

export interface SwitchSummary {
  id: number
  name: string
  model: string
  managementIp: string
  locationId: number
  locationName: string
  building: string
  portCount: number
  accessPorts: number
  enabledPorts: number
  patchedPorts: number
  activeJacks: number
}

export interface PortJack {
  id: number
  label: string
  locationName: string
  type: JackType
  status: JackStatus
}

export interface SwitchPort {
  id: number
  switchId: number
  portName: string
  portNumber: number
  vlanId: number | null
  vlanName: string | null
  adminStatus: PortAdminStatus
  role: PortRole
  description: string | null
  jack: PortJack | null
}

export interface SwitchDetail {
  id: number
  name: string
  model: string
  managementIp: string
  locationId: number
  locationName: string
  building: string
  ports: SwitchPort[]
}

export interface Jack {
  id: number
  label: string
  locationId: number
  locationName: string
  buildingCode: string
  type: JackType
  status: JackStatus
  switchPortId: number | null
  switchId: number | null
  switchName: string | null
  portName: string | null
  vlanId: number | null
  notes: string | null
}

export interface ServiceRequestListItem {
  id: number
  number: string
  title: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  requesterId: number
  requesterName: string
  assigneeId: number | null
  assigneeName: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface TicketEvent {
  id: number
  type: TicketEventType
  createdAt: string
  actorId: number | null
  actorName: string
  fromStatus: string | null
  toStatus: string | null
  fromAssignee: string | null
  toAssignee: string | null
  text: string | null
}

export interface ServiceRequestDetail {
  id: number
  number: string
  title: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  requesterId: number
  requesterName: string
  assigneeId: number | null
  assigneeName: string | null
  relatedAsset: { id: number; assetTag: string; description: string } | null
  relatedJack: { id: number; label: string; locationName: string; status: JackStatus } | null
  resolutionNotes: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
  version: number
  allowedTransitions: TicketStatus[]
  history: TicketEvent[]
}

export interface ServiceRequestWrite {
  title: string
  description: string
  category: TicketCategory | ''
  priority: TicketPriority | ''
  requesterId: number | null
  relatedAssetId: number | null
  relatedJackId: number | null
}

export interface CountBy<K> {
  key: K
  count: number
}

export interface Dashboard {
  asOf: string
  totalAssets: number
  assetsByStatus: CountBy<AssetStatus>[]
  warrantyExpiring30Days: number
  openRequests: number
  openP1Requests: number
  unassignedOpenRequests: number
  resolvedLast7Days: number
  avgResolutionHoursLast30Days: number | null
  openRequestsByPriority: CountBy<TicketPriority>[]
  requestsByStatus: CountBy<TicketStatus>[]
  totalJacks: number
  activeJacks: number
  faultyJacks: number
  /** Ports that can take a jack (uplinks excluded). */
  accessPorts: number
  patchedPorts: number
  recentRequests: ServiceRequestListItem[]
}

export interface ReportDefinition {
  key: string
  title: string
  description: string
  sql: string
  parameters: string[]
}

export interface DemoInfo {
  organization: string
  fictional: boolean
  resetEnabled: boolean
  counts: Record<string, number>
}

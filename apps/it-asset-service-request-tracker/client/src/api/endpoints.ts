import { apiRequest, query } from './client'
import type {
  AssetDetail,
  AssetHistoryEntry,
  AssetListItem,
  AssetStatus,
  AssetType,
  AssetWrite,
  Dashboard,
  DemoInfo,
  Jack,
  JackStatus,
  JackType,
  Location,
  LocationWrite,
  PagedResult,
  Person,
  PersonWrite,
  PortAdminStatus,
  ReportDefinition,
  ServiceRequestDetail,
  ServiceRequestListItem,
  ServiceRequestWrite,
  SwitchDetail,
  SwitchPort,
  SwitchSummary,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  Vlan,
} from './types'

type Signal = AbortSignal | undefined

export interface AssetFilters {
  search?: string
  status?: AssetStatus | ''
  type?: AssetType | ''
  building?: string
  assignedToId?: number
  warrantyWithinDays?: number
  sort?: string
  page?: number
  pageSize?: number
}

export interface JackFilters {
  search?: string
  status?: JackStatus | ''
  type?: JackType | ''
  building?: string
  patched?: boolean
  page?: number
  pageSize?: number
}

export interface RequestFilters {
  search?: string
  status?: TicketStatus | ''
  priority?: TicketPriority | ''
  category?: TicketCategory | ''
  assigneeId?: number
  openOnly?: boolean
  unassigned?: boolean
  relatedAssetId?: number
  relatedJackId?: number
  sort?: string
  page?: number
  pageSize?: number
}

export const api = {
  dashboard: (signal?: Signal) => apiRequest<Dashboard>('/api/dashboard', { signal }),

  assets: {
    list: (f: AssetFilters, signal?: Signal) => apiRequest<PagedResult<AssetListItem>>(`/api/assets${query({ ...f })}`, { signal }),
    get: (id: number, signal?: Signal) => apiRequest<AssetDetail>(`/api/assets/${id}`, { signal }),
    history: (id: number, signal?: Signal) => apiRequest<AssetHistoryEntry[]>(`/api/assets/${id}/history`, { signal }),
    create: (body: AssetWrite) => apiRequest<AssetDetail>('/api/assets', { method: 'POST', body }),
    update: (id: number, body: AssetWrite) => apiRequest<AssetDetail>(`/api/assets/${id}`, { method: 'PUT', body }),
    remove: (id: number) => apiRequest<void>(`/api/assets/${id}`, { method: 'DELETE' }),
  },

  locations: {
    list: (signal?: Signal) => apiRequest<Location[]>('/api/locations', { signal }),
    create: (body: LocationWrite) => apiRequest<Location>('/api/locations', { method: 'POST', body }),
    update: (id: number, body: LocationWrite) => apiRequest<Location>(`/api/locations/${id}`, { method: 'PUT', body }),
    remove: (id: number) => apiRequest<void>(`/api/locations/${id}`, { method: 'DELETE' }),
  },

  people: {
    list: (opts: { technicianOnly?: boolean; search?: string } = {}, signal?: Signal) =>
      apiRequest<Person[]>(`/api/people${query({ technicianOnly: opts.technicianOnly || undefined, search: opts.search })}`, { signal }),
    create: (body: PersonWrite) => apiRequest<Person>('/api/people', { method: 'POST', body }),
    update: (id: number, body: PersonWrite) => apiRequest<Person>(`/api/people/${id}`, { method: 'PUT', body }),
    remove: (id: number) => apiRequest<void>(`/api/people/${id}`, { method: 'DELETE' }),
  },

  vlans: {
    list: (signal?: Signal) => apiRequest<Vlan[]>('/api/vlans', { signal }),
    create: (body: { vlanId: number | null; name: string; description: string | null }) =>
      apiRequest<Vlan>('/api/vlans', { method: 'POST', body }),
    remove: (vlanId: number) => apiRequest<void>(`/api/vlans/${vlanId}`, { method: 'DELETE' }),
  },

  switches: {
    list: (signal?: Signal) => apiRequest<SwitchSummary[]>('/api/switches', { signal }),
    get: (id: number, signal?: Signal) => apiRequest<SwitchDetail>(`/api/switches/${id}`, { signal }),
    /** Access ports with no jack. Uplink ports are never returned. */
    freePorts: (id: number, signal?: Signal) => apiRequest<SwitchPort[]>(`/api/switches/${id}/free-ports`, { signal }),
    create: (body: { name: string; model: string; managementIp: string; locationId: number | null; portCount: number | null }) =>
      apiRequest<SwitchDetail>('/api/switches', { method: 'POST', body }),
    update: (id: number, body: { name: string; model: string; managementIp: string; locationId: number | null }) =>
      apiRequest<SwitchDetail>(`/api/switches/${id}`, { method: 'PUT', body }),
    remove: (id: number) => apiRequest<void>(`/api/switches/${id}`, { method: 'DELETE' }),
  },

  ports: {
    update: (id: number, body: { vlanId: number | null; adminStatus: PortAdminStatus; description: string | null }) =>
      apiRequest<SwitchPort>(`/api/ports/${id}`, { method: 'PUT', body }),
  },

  jacks: {
    list: (f: JackFilters, signal?: Signal) => apiRequest<PagedResult<Jack>>(`/api/jacks${query({ ...f })}`, { signal }),
    get: (id: number, signal?: Signal) => apiRequest<Jack>(`/api/jacks/${id}`, { signal }),
    create: (body: { label: string; locationId: number | null; type: JackType; status: JackStatus; notes: string | null }) =>
      apiRequest<Jack>('/api/jacks', { method: 'POST', body }),
    update: (id: number, body: { label: string; locationId: number | null; type: JackType; status: JackStatus; notes: string | null }) =>
      apiRequest<Jack>(`/api/jacks/${id}`, { method: 'PUT', body }),
    remove: (id: number) => apiRequest<void>(`/api/jacks/${id}`, { method: 'DELETE' }),
    patch: (id: number, switchPortId: number) => apiRequest<Jack>(`/api/jacks/${id}/patch`, { method: 'POST', body: { switchPortId } }),
    unpatch: (id: number) => apiRequest<Jack>(`/api/jacks/${id}/unpatch`, { method: 'POST' }),
    activate: (id: number, switchPortId: number, vlanId: number) =>
      apiRequest<Jack>(`/api/jacks/${id}/activate`, { method: 'POST', body: { switchPortId, vlanId } }),
  },

  requests: {
    list: (f: RequestFilters, signal?: Signal) =>
      apiRequest<PagedResult<ServiceRequestListItem>>(`/api/service-requests${query({ ...f })}`, { signal }),
    get: (id: number, signal?: Signal) => apiRequest<ServiceRequestDetail>(`/api/service-requests/${id}`, { signal }),
    create: (body: ServiceRequestWrite & { actorId: number | null }) =>
      apiRequest<ServiceRequestDetail>('/api/service-requests', { method: 'POST', body }),
    update: (id: number, body: Omit<ServiceRequestWrite, 'requesterId'> & { actorId: number; version: number }) =>
      apiRequest<ServiceRequestDetail>(`/api/service-requests/${id}`, { method: 'PUT', body }),
    assign: (id: number, assigneeId: number, actorId: number, version: number) =>
      apiRequest<ServiceRequestDetail>(`/api/service-requests/${id}/assign`, { method: 'POST', body: { assigneeId, actorId, version } }),
    changeStatus: (id: number, status: TicketStatus, actorId: number, version: number, note: string | null) =>
      apiRequest<ServiceRequestDetail>(`/api/service-requests/${id}/status`, { method: 'POST', body: { status, actorId, version, note } }),
    comment: (id: number, text: string, actorId: number) =>
      apiRequest<ServiceRequestDetail>(`/api/service-requests/${id}/comments`, { method: 'POST', body: { text, actorId } }),
  },

  reports: {
    definitions: (signal?: Signal) => apiRequest<ReportDefinition[]>('/api/reports/definitions', { signal }),
    run: <T>(key: string, params: Record<string, number> = {}, signal?: Signal) =>
      apiRequest<T[]>(`/api/reports/${key}${query(params)}`, { signal }),
  },

  demo: {
    info: (signal?: Signal) => apiRequest<DemoInfo>('/api/demo', { signal }),
    reset: () => apiRequest<{ reset: boolean; counts: Record<string, number> }>('/api/demo/reset', { method: 'POST' }),
  },
}

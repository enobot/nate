/**
 * Provides the technician chosen in the header's "Working as" picker. See ./actor.ts for why
 * this exists and what it does not do.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { ActorContext, type ActorContextValue } from './actor'

const STORAGE_KEY = 'itat.actorId'

function readStoredId(): number | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? Number(value) : undefined
  } catch {
    return undefined
  }
}

export function ActorProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useApi((signal) => api.people.list({ technicianOnly: true }, signal), [])
  const [actorId, setActorIdState] = useState<number | undefined>(readStoredId)
  const technicians = useMemo(() => data ?? [], [data])

  // Fall back to the first technician if nothing (or a removed person) was stored.
  const effectiveId = technicians.some((t) => t.id === actorId) ? actorId : technicians[0]?.id

  const value = useMemo<ActorContextValue>(
    () => ({
      technicians,
      actor: technicians.find((t) => t.id === effectiveId),
      loading,
      setActorId: (id: number) => {
        setActorIdState(id)
        try {
          window.localStorage.setItem(STORAGE_KEY, String(id))
        } catch {
          // Private browsing can block storage; the choice then lasts until refresh.
        }
      },
    }),
    [technicians, effectiveId, loading],
  )

  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>
}

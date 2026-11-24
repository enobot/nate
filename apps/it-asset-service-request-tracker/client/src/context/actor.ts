import { createContext, useContext } from 'react'
import type { Person } from '../api/types'

/**
 * The demo has no sign-in, so the technician performing ticket actions is picked from a list in
 * the header ("Working as"). The API records that person in the ticket history but cannot verify
 * it. This is a documented limitation, not a security feature.
 */
export interface ActorContextValue {
  technicians: Person[]
  actor: Person | undefined
  setActorId: (id: number) => void
  loading: boolean
}

export const ActorContext = createContext<ActorContextValue | undefined>(undefined)

export function useActor(): ActorContextValue {
  const value = useContext(ActorContext)
  if (!value) throw new Error('useActor must be used inside ActorProvider')
  return value
}

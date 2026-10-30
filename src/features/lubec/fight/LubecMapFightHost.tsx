import type { ReactNode } from 'react'
import type { Role } from '../../../types/app'
import { useCharacterStore } from '../../character/characterStore/useCharacterStore'
import { MapFightContext, type MapFightFor } from '../../maps/mapFight'
import { lubecCharacterStore } from '../../ruleSets/lubec/characterParser'
import { lubecMapFightRequest, lubecOwnCharacter } from './lubecFightCombatants'
import { useLubecFightRoom } from './useLubecFightRoom'

type MapFightHostProps = {
  campaignId: string
  groupId: string
  role: Role | null
  currentUserId: string
  gmUserId: string | null
  setError: (message: string) => void
  children: ReactNode
}

/**
 * The fight modal over the map. It holds the campaign's characters in a store
 * of its own, which lives only while Maps is the open tab, as the shell shows
 * one tab's panel at a time, and which the modal only reads.
 */
export function LubecMapFightHost({ campaignId, groupId, role, currentUserId, gmUserId, setError, children }: MapFightHostProps) {
  const store = useCharacterStore({ ruleSet: lubecCharacterStore, campaignId, groupId, userId: currentUserId, role, gmUserId, setError, enabled: true })
  const viewer = { role, userId: currentUserId }
  const { combatants, host, modal } = useLubecFightRoom({ scope: { campaignId, groupId }, viewer, gmUserId, store, setError })
  const own = lubecOwnCharacter(store.characters, store.currentCharacterId, currentUserId)
  const fightFor: MapFightFor = (tokens) => {
    const request = lubecMapFightRequest(tokens, { viewer, own, combatants })
    return request && (() => host.open(request))
  }
  return (
    <MapFightContext value={fightFor}>
      {children}
      {modal}
    </MapFightContext>
  )
}

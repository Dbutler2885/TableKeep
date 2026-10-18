import { useEffect, useRef, useState, type RefObject } from 'react'
import { onSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../../firebase'
import type { Role } from '../../types/app'
import { campaignCollectionRef, campaignUserStateRef } from '../campaign/firestorePaths'
import { nextSelectedVtmCharacterId, readVtmCharacterSnapshot, visibleVtmCharacters } from './vtmCharacterRoster'
import type { VtmCharacterSaves } from './vtmCharacterWrites'
import type { VtmCharacterRecord } from './vtmTypes'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export const readCurrentCharacterId = (data: DocumentData | undefined) => {
  const value = data?.currentCharacterId
  return typeof value === 'string' ? value : null
}

/** The character this user has marked as current in the campaign. */
export function useCurrentVtmCharacterId(
  campaignId: string | null,
  groupId: string | null,
  userId: string,
  enabled: boolean,
  setError: (message: string) => void,
) {
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId || !groupId || !enabled) {
      queueMicrotask(() => setCurrentCharacterId(null))
      return
    }
    const unsub = onSnapshot(
      campaignUserStateRef(db, { campaignId, groupId }, userId),
      (snap) => setCurrentCharacterId(readCurrentCharacterId(snap.data())),
      (err) => setError(errorMessage(err, 'Unable to load current character')),
    )
    return () => unsub()
  }, [campaignId, enabled, groupId, setError, userId])

  return [currentCharacterId, setCurrentCharacterId] as const
}

type RosterOptions = {
  campaignId: string | null
  groupId: string | null
  userId: string
  role: Role | null
  gmUserId: string | null
  currentCharacterId: string | null
  enabled: boolean
  setError: (message: string) => void
  savesRef: RefObject<VtmCharacterSaves>
}

/** The campaign's VtM characters this user can see, kept in step with Firestore, and the selected one. */
export function useVtmCharacterRoster(options: RosterOptions) {
  const { campaignId, groupId, userId, role, gmUserId, currentCharacterId, enabled, setError, savesRef } = options
  const [characters, setCharacters] = useState<VtmCharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const charactersRef = useRef<VtmCharacterRecord[]>([])

  useEffect(() => {
    charactersRef.current = characters
  }, [characters])

  useEffect(() => {
    if (!campaignId || !groupId || !role || !enabled) {
      queueMicrotask(() => {
        setCharacters([])
        setCharactersLoading(false)
      })
      return
    }
    queueMicrotask(() => setCharactersLoading(true))
    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'characters'),
      (snap) => {
        const all = readVtmCharacterSnapshot(snap.docs, savesRef.current, charactersRef.current)
        const next = visibleVtmCharacters(all, role, gmUserId)
        setCharacters(next)
        setCharactersLoading(false)
        setSelectedCharacterId((current) => nextSelectedVtmCharacterId(current, next, currentCharacterId, userId))
      },
      (err) => {
        setError(errorMessage(err, 'Unable to load VtM characters'))
        setCharactersLoading(false)
      },
    )
    return () => unsub()
  }, [campaignId, currentCharacterId, enabled, gmUserId, groupId, role, savesRef, setError, userId])

  return {
    characters,
    setCharacters,
    charactersLoading,
    selectedCharacterId,
    setSelectedCharacterId,
    charactersRef,
  }
}

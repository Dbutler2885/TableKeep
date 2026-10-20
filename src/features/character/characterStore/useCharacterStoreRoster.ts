import { useEffect, useRef, useState, type RefObject } from 'react'
import { onSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { Role } from '../../../types/app'
import { campaignCollectionRef, campaignUserStateRef } from '../../campaign/firestorePaths'
import type { CharacterStoreRecord, CharacterStoreRuleSet } from './characterStoreRecord'
import {
  nextSelectedCharacterStoreId,
  readCharacterStoreSnapshot,
  visibleCharacterStoreCharacters,
} from './characterStoreRoster'
import { sendCharacterStoreSavesNow, type CharacterStoreSaves } from './characterStoreWrites'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export const readCurrentCharacterId = (data: DocumentData | undefined) => {
  const value = data?.currentCharacterId
  return typeof value === 'string' ? value : null
}

/** The character this user has marked as current in the campaign. */
export function useCharacterStoreCurrentCharacterId(
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

type RosterOptions<Character extends CharacterStoreRecord> = {
  ruleSet: CharacterStoreRuleSet<Character>
  campaignId: string | null
  groupId: string | null
  userId: string
  role: Role | null
  gmUserId: string | null
  currentCharacterId: string | null
  enabled: boolean
  setError: (message: string) => void
  savesRef: RefObject<CharacterStoreSaves>
}

/**
 * The campaign's characters of the rule set this user can see, kept in step
 * with Firestore, and the selected one. Every waiting save is sent before the
 * subscription stops, because the list it would read its character from is
 * cleared once nothing is listening.
 */
export function useCharacterStoreRoster<Character extends CharacterStoreRecord>(options: RosterOptions<Character>) {
  const { ruleSet, campaignId, groupId, userId, role, gmUserId, currentCharacterId, enabled, setError, savesRef } = options
  const [characters, setCharacters] = useState<Character[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const charactersRef = useRef<Character[]>([])

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
    // The saves made while this subscription runs; a campaign change replaces them.
    const saves = savesRef.current
    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'characters'),
      (snap) => {
        const all = readCharacterStoreSnapshot(ruleSet, snap.docs, savesRef.current, charactersRef.current)
        const next = visibleCharacterStoreCharacters(all, role, gmUserId)
        setCharacters(next)
        setCharactersLoading(false)
        setSelectedCharacterId((current) => nextSelectedCharacterStoreId(current, next, currentCharacterId, userId))
      },
      (err) => {
        setError(errorMessage(err, `Unable to load ${ruleSet.label} characters`))
        setCharactersLoading(false)
      },
    )
    return () => {
      sendCharacterStoreSavesNow(saves)
      unsub()
    }
  }, [campaignId, currentCharacterId, enabled, gmUserId, groupId, role, ruleSet, savesRef, setError, userId])

  return {
    characters,
    setCharacters,
    charactersLoading,
    selectedCharacterId,
    setSelectedCharacterId,
    charactersRef,
  }
}

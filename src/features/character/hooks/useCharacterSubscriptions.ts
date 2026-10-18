// The campaign character subscriptions. Each effect hands its setters to a
// subscribe function, which clears or flags state synchronously in the effect
// that switches the subscription off or on, not on a later tick.
import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { onSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { CharacterRecord, Role } from '../../../types/app'
import { campaignCollectionRef, campaignUserStateRef, type CampaignScope } from '../../campaign/firestorePaths'
import { nextSelectedCharacterId, readCharacterSnapshot, visibleCharacters } from '../lib/characterSnapshot'
import { campaignScope, type CharacterSaves } from '../lib/characterWrites'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export const readCurrentCharacterId = (data: DocumentData | undefined) => {
  const value = data?.currentCharacterId
  return typeof value === 'string' ? value : null
}

type CurrentCharacterIdSubscription = {
  campaign: CampaignScope | null
  userId: string
  setCurrentCharacterId: Dispatch<SetStateAction<string | null>>
  setError: (message: string) => void
}

/** Follows the user's current character, or clears it when there is no campaign to follow. */
export function subscribeToCurrentCharacterId(options: CurrentCharacterIdSubscription) {
  const { campaign, setCurrentCharacterId, setError } = options
  if (!campaign) {
    setCurrentCharacterId(null)
    return undefined
  }
  const unsub = onSnapshot(
    campaignUserStateRef(db, campaign, options.userId),
    (snap) => setCurrentCharacterId(readCurrentCharacterId(snap.data())),
    (err) => setError(errorMessage(err, 'Unable to load current character')),
  )
  return () => unsub()
}

/** The character this user has marked as current in the campaign. */
export function useCurrentCharacterId(
  campaignId: string | null,
  groupId: string | null,
  userId: string,
  enabled: boolean,
  setError: (message: string) => void,
) {
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)

  useEffect(() => subscribeToCurrentCharacterId({
    campaign: enabled ? campaignScope(campaignId, groupId) : null,
    userId,
    setCurrentCharacterId,
    setError,
  }), [campaignId, enabled, groupId, setError, userId])

  return [currentCharacterId, setCurrentCharacterId] as const
}

type CharacterListSubscription = {
  campaign: CampaignScope | null
  role: Role | null
  userId: string
  currentUsername: string
  gmUserId: string | null
  currentCharacterId: string | null
  savesRef: RefObject<CharacterSaves>
  charactersRef: RefObject<CharacterRecord[]>
  setCharacters: Dispatch<SetStateAction<CharacterRecord[]>>
  setCharactersLoading: Dispatch<SetStateAction<boolean>>
  setSelectedCharacterId: Dispatch<SetStateAction<string>>
  setError: (message: string) => void
}

/** Follows the campaign's characters this user can see, or clears them when there is nothing to follow. */
export function subscribeToCharacterList(options: CharacterListSubscription) {
  const { campaign, role, userId, setCharacters, setCharactersLoading, setSelectedCharacterId } = options
  if (!campaign || !role) {
    setCharacters([])
    setCharactersLoading(false)
    return undefined
  }
  setCharactersLoading(true)
  const viewer = { userId, currentUsername: options.currentUsername }
  const unsub = onSnapshot(
    campaignCollectionRef(db, campaign, 'characters'),
    (snap) => {
      const all = readCharacterSnapshot(snap.docs, options.savesRef.current, options.charactersRef.current, viewer)
      const next = visibleCharacters(all, role, options.gmUserId)
      setCharacters(next)
      setCharactersLoading(false)
      setSelectedCharacterId((current) => nextSelectedCharacterId(current, next, options.currentCharacterId, userId))
    },
    (err) => {
      options.setError(errorMessage(err, 'Unable to load characters'))
      setCharactersLoading(false)
    },
  )
  return () => unsub()
}

type CharacterListOptions = {
  campaignId: string | null
  groupId: string | null
  userId: string
  currentUsername: string
  role: Role | null
  gmUserId: string | null
  currentCharacterId: string | null
  enabled: boolean
  setError: (message: string) => void
  savesRef: RefObject<CharacterSaves>
  charactersRef: RefObject<CharacterRecord[]>
  setCharacters: Dispatch<SetStateAction<CharacterRecord[]>>
}

/** Keeps the character list in step with Firestore, with its loading flag and the selected character. */
export function useCharacterListSubscription(options: CharacterListOptions) {
  const { campaignId, groupId, userId, currentUsername, role, gmUserId, currentCharacterId, enabled } = options
  const { setError, savesRef, charactersRef, setCharacters } = options
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')

  useEffect(() => subscribeToCharacterList({
    campaign: enabled ? campaignScope(campaignId, groupId) : null,
    role,
    userId,
    currentUsername,
    gmUserId,
    currentCharacterId,
    savesRef,
    charactersRef,
    setCharacters,
    setCharactersLoading,
    setSelectedCharacterId,
    setError,
  }), [gmUserId, campaignId, currentCharacterId, currentUsername, enabled, groupId, role, userId, setError, savesRef, charactersRef, setCharacters])

  return { charactersLoading, selectedCharacterId, setSelectedCharacterId }
}

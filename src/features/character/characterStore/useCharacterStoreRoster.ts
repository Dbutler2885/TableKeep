import { receiveRevisionedStoreDocs } from './revisionedStoreAdapter'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { onSnapshot, type DocumentSnapshot, type QuerySnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { Role } from '../../../types/app'
import { campaignCollectionRef, campaignDocRef, campaignUserStateRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { CharacterStoreRecord, CharacterStoreRuleSet } from './characterStoreRecord'
import {
  nextSelectedCharacterStoreId,
  readCharacterStoreSnapshot,
  visibleCharacterStoreCharacters,
  type StoredCharacterDoc,
} from './characterStoreRoster'
import { sendCharacterStoreSavesNow, type CharacterStoreCollection, type CharacterStoreSaves } from './characterStoreWrites'

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
  const reportError = useEffectEvent(setError)

  useEffect(() => {
    if (!campaignId || !groupId || !enabled) {
      queueMicrotask(() => setCurrentCharacterId(null))
      return
    }
    const unsub = onSnapshot(
      campaignUserStateRef(db, { campaignId, groupId }, userId),
      (snap) => setCurrentCharacterId(readCurrentCharacterId(snap.data())),
      (err) => reportError(errorMessage(err, 'Unable to load current character')),
    )
    return () => unsub()
  }, [campaignId, enabled, groupId, userId])

  return [currentCharacterId, setCurrentCharacterId] as const
}

// Listens to the store's records: the whole collection, or only the one document when the store is narrowed to it.
function listenToCharacterStoreDocs(
  campaign: CampaignScope,
  collection: CharacterStoreCollection,
  onlyId: string | undefined,
  next: (docs: StoredCharacterDoc[]) => void,
  fail: (err: unknown) => void,
  metadata: boolean,
) {
  if (onlyId) {
    if (metadata) return onSnapshot(campaignDocRef(db, campaign, collection, onlyId), { includeMetadataChanges: true }, (snap) => publishServerDocument(snap, next), fail)
    return onSnapshot(campaignDocRef(db, campaign, collection, onlyId), (snap) => next(snap.exists() ? [snap] : []), fail)
  }
  if (metadata) return onSnapshot(campaignCollectionRef(db, campaign, collection), { includeMetadataChanges: true }, (snap) => publishServerCollection(snap, next), fail)
  return onSnapshot(campaignCollectionRef(db, campaign, collection), (snap) => next(snap.docs), fail)
}

function publishServerCollection(snapshot: QuerySnapshot, next: (docs: StoredCharacterDoc[]) => void) {
  if (!snapshot.metadata?.fromCache) next(snapshot.docs)
}
function publishServerDocument(snapshot: DocumentSnapshot, next: (docs: StoredCharacterDoc[]) => void) {
  if (!snapshot.metadata?.fromCache) next(snapshot.exists() ? [snapshot] : [])
}

type RosterSubscription = { active: boolean; publish: (docs: StoredCharacterDoc[]) => void; fail: (error: unknown) => void }
function publishIfActive(state: RosterSubscription, docs: StoredCharacterDoc[]) {
  if (state.active) state.publish(docs)
}
function failIfActive(state: RosterSubscription, error: unknown) {
  if (state.active) state.fail(error)
}
function receiveRosterDocs(state: RosterSubscription, docs: StoredCharacterDoc[], saves: CharacterStoreSaves, scope: CampaignScope & { collection: CharacterStoreCollection }, revisioned: boolean) {
  const received = revisioned ? receiveRevisionedStoreDocs(saves, scope, docs) : undefined
  if (received) { void received.then(() => publishIfActive(state, docs)).catch((error) => failIfActive(state, error)); return }
  publishIfActive(state, docs)
}
function subscribeRosterDocs(scope: CampaignScope, collection: CharacterStoreCollection, onlyId: string | undefined, revisioned: boolean, saves: CharacterStoreSaves, publish: RosterSubscription['publish'], fail: RosterSubscription['fail']) {
  const state = { active: true, publish, fail }
  const stop = listenToCharacterStoreDocs(scope, collection, onlyId, (docs) => receiveRosterDocs(state, docs, saves, { ...scope, collection }, revisioned), (error) => failIfActive(state, error), revisioned)
  return () => { state.active = false; stop() }
}

type RosterOptions<Character extends CharacterStoreRecord> = {
  ruleSet: CharacterStoreRuleSet<Character>
  collection: CharacterStoreCollection
  onlyId: string | undefined
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
  const { ruleSet, collection, onlyId, campaignId, groupId, userId, role, gmUserId, currentCharacterId, enabled, setError, savesRef } = options
  const [characters, setCharacters] = useState<Character[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const charactersRef = useRef<Character[]>([])
  const reportError = useEffectEvent(setError)

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
    const publish = (docs: StoredCharacterDoc[]) => {
      const all = readCharacterStoreSnapshot(ruleSet, docs, savesRef.current, charactersRef.current)
      const next = visibleCharacterStoreCharacters(all, role, gmUserId)
      charactersRef.current = next
      setCharacters(next)
      setCharactersLoading(false)
      setSelectedCharacterId((current) => nextSelectedCharacterStoreId(current, next, currentCharacterId, userId))
    }
    const fail = (err: unknown) => {
      reportError(errorMessage(err, `Unable to load ${ruleSet.label} characters`))
      setCharactersLoading(false)
    }
    const unsub = subscribeRosterDocs({ campaignId, groupId }, collection, onlyId, ruleSet.system === 'lubec', saves, publish, fail)
    return () => {
      sendCharacterStoreSavesNow(saves)
      unsub()
    }
  }, [campaignId, collection, currentCharacterId, enabled, gmUserId, groupId, onlyId, role, ruleSet, savesRef, userId])

  return {
    characters,
    setCharacters,
    charactersLoading,
    selectedCharacterId,
    setSelectedCharacterId,
    charactersRef,
  }
}

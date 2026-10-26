import { useCallback, useEffect, useMemo, useRef, type Dispatch } from 'react'
import type { ActiveToolAction, TokenPlacementState } from '../lib/activeToolState'
import {
  dropTokenPlacement,
  getTokenPlacementDisplay,
  startMonsterTokenPlacement,
  startOneAtATimeTokenPlacement,
  startWholePartyTokenPlacement,
  type MonsterTokenPlacementSource,
  type PartyCharacterTokenPlacementSource,
  type TokenPlacementCommand,
  type TokenPlacementQueueState,
  type TokenPlacementSource,
} from '../lib/tokenPlacementQueue'
import {
  buildWholePartyTokenPlacementSources,
  toGenericTokenPlacementSource,
  toMonsterTokenPlacementSource,
  toNpcTokenPlacementSource,
} from '../lib/tokenPlacementSources'
import type { CharacterTokenSummary, MonsterSummary, NpcSummary, TokenAssetRecord, TokenRecord } from '../lib/types'

type PlacementSourceData = {
  mapCharacters: CharacterTokenSummary[]
  mapMonsters: MonsterSummary[]
  mapNpcs: NpcSummary[]
  tokenAssets: TokenAssetRecord[]
}

// What the GM can place: the party, the campaign's monsters and NPCs, and the
// token assets that are not archived.
export function usePlacementSources({ mapCharacters, mapMonsters, mapNpcs, tokenAssets }: PlacementSourceData, gmUserId: string | null) {
  const partyPlacementSources = useMemo(
    () => buildWholePartyTokenPlacementSources(mapCharacters, gmUserId),
    [gmUserId, mapCharacters],
  )
  const monsterPlacementSources = useMemo(
    () => mapMonsters.map(toMonsterTokenPlacementSource),
    [mapMonsters],
  )
  const npcPlacementSources = useMemo(
    () => mapNpcs.map(toNpcTokenPlacementSource),
    [mapNpcs],
  )
  const genericPlacementSources = useMemo(
    () => tokenAssets.filter((asset) => !asset.archived).map(toGenericTokenPlacementSource),
    [tokenAssets],
  )
  return { partyPlacementSources, monsterPlacementSources, npcPlacementSources, genericPlacementSources }
}

export type PlacementSources = ReturnType<typeof usePlacementSources>

type PlacementQueueOptions = {
  setPlacementQueue: (queue: TokenPlacementQueueState | null) => void
  dispatchActiveTool: Dispatch<ActiveToolAction>
  tokenPlacement: TokenPlacementState | null
  partyPlacementSources: PartyCharacterTokenPlacementSource[]
}

// Starting and cancelling a placement. The queue and the active tool state's
// placement move together, and the queue empties whenever the placement ends.
export function usePlacementQueueActions({ setPlacementQueue, dispatchActiveTool, tokenPlacement, partyPlacementSources }: PlacementQueueOptions) {
  const startPlacement = useCallback((queue: TokenPlacementQueueState, placement: TokenPlacementState) => {
    setPlacementQueue(queue)
    dispatchActiveTool({ type: 'startTokenPlacement', placement })
  }, [dispatchActiveTool, setPlacementQueue])

  const startSinglePlacement = useCallback((source: Exclude<TokenPlacementSource, MonsterTokenPlacementSource>) => {
    startPlacement(startOneAtATimeTokenPlacement(source), { kind: source.kind, queueId: `${source.kind}-${source.id}` })
  }, [startPlacement])

  const startWholePartyPlacement = useCallback(() => {
    const queue = startWholePartyTokenPlacement(partyPlacementSources)
    if (queue) startPlacement(queue, { kind: 'wholeParty', queueId: 'whole-party' })
  }, [partyPlacementSources, startPlacement])

  const startMonsterPlacement = useCallback((source: MonsterTokenPlacementSource, count: number) => {
    const queue = startMonsterTokenPlacement(source, count)
    if (queue) startPlacement(queue, { kind: 'monster', queueId: `${source.kind}-${source.id}` })
  }, [startPlacement])

  const cancelPlacement = useCallback(() => {
    setPlacementQueue(null)
    dispatchActiveTool({ type: 'cancelTokenPlacement' })
  }, [dispatchActiveTool, setPlacementQueue])

  useEffect(() => {
    if (tokenPlacement) return
    setPlacementQueue(null)
  }, [setPlacementQueue, tokenPlacement])

  return { startSinglePlacement, startWholePartyPlacement, startMonsterPlacement, cancelPlacement }
}

export type PlacementQueueActions = ReturnType<typeof usePlacementQueueActions>

export function usePlacementDisplay(placementQueue: TokenPlacementQueueState | null) {
  return useMemo(() => getTokenPlacementDisplay(placementQueue), [placementQueue])
}

type PlacementDropOptions = {
  placementQueue: TokenPlacementQueueState | null
  setPlacementQueue: (queue: TokenPlacementQueueState | null) => void
  dispatchActiveTool: Dispatch<ActiveToolAction>
  tokens: TokenRecord[]
  placeQueuedToken: (command: TokenPlacementCommand) => Promise<unknown>
}

// Dropping the next queued token where the map was clicked. Names already handed
// out to tokens still being saved count as taken, so repeated placements are
// numbered apart; a name is released when its token arrives or its save fails.
export function usePlacementDrop({ placementQueue, setPlacementQueue, dispatchActiveTool, tokens, placeQueuedToken }: PlacementDropOptions) {
  const pendingPlacedTokenNamesRef = useRef<string[]>([])

  const runPlacementDrop = useCallback((point: { x: number; y: number }) => {
    const result = dropTokenPlacement(placementQueue, point, [
      ...tokens,
      ...pendingPlacedTokenNamesRef.current,
    ])
    if (result.command) {
      const { command } = result
      pendingPlacedTokenNamesRef.current = [...pendingPlacedTokenNamesRef.current, command.name]
      void placeQueuedToken(command).catch(() => {
        pendingPlacedTokenNamesRef.current = pendingPlacedTokenNamesRef.current.filter((name) => name !== command.name)
      })
    }
    setPlacementQueue(result.nextQueue)
    if (result.completed) dispatchActiveTool({ type: 'cancelTokenPlacement' })
  }, [dispatchActiveTool, placeQueuedToken, placementQueue, setPlacementQueue, tokens])

  useEffect(() => {
    pendingPlacedTokenNamesRef.current = pendingPlacedTokenNamesRef.current.filter(
      (pendingName) => !tokens.some((token) => token.name === pendingName),
    )
  }, [tokens])

  return {
    runPlacementDrop,
    forgetPendingNames: () => {
      pendingPlacedTokenNamesRef.current = []
    },
  }
}

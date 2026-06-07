import { describe, expect, it } from 'vitest'
import * as queueModule from './tokenPlacementQueue'
import {
  DEFAULT_PAWN_TOKEN_ICON,
  cancelTokenPlacementQueue,
  dropTokenPlacement,
  getTokenPlacementDisplay,
  startMonsterTokenPlacement,
  startOneAtATimeTokenPlacement,
  startWholePartyTokenPlacement,
  type MonsterTokenPlacementSource,
  type PartyCharacterTokenPlacementSource,
  type TokenPlacementQueueState,
} from './tokenPlacementQueue'

const point = { x: 0.4, y: 0.6 }

const goblin: MonsterTokenPlacementSource = {
  kind: 'monster',
  id: 'monster-goblin',
  name: 'Goblin',
  tokenIcon: { icon: 'pawn', color: '#46743b', size: 28 },
}

const aria: PartyCharacterTokenPlacementSource = {
  kind: 'partyCharacter',
  id: 'character-aria',
  name: 'Aria',
  tokenIcon: { icon: 'custom', color: '#ffffff', size: 34, customImageUrl: 'aria.png' },
}

const bram: PartyCharacterTokenPlacementSource = {
  kind: 'partyCharacter',
  id: 'character-bram',
  name: 'Bram',
  tokenIcon: { icon: 'pawn', color: '#7a2a2e', size: 34 },
}

describe('token placement queue', () => {
  it('places an NPC one at a time and completes immediately', () => {
    const queue = startOneAtATimeTokenPlacement({
      kind: 'npc',
      id: 'npc-1',
      name: 'Innkeeper',
      tokenIcon: { icon: 'pawn', color: '#a46a3f', size: 30 },
    })

    const result = dropTokenPlacement(queue, point, [])

    expect(result.command).toMatchObject({
      type: 'placeToken',
      sourceKind: 'npc',
      sourceId: 'npc-1',
      name: 'Innkeeper',
      point,
      party: false,
      revealName: true,
      npcId: 'npc-1',
    })
    expect(result.nextQueue).toBeNull()
    expect(result.completed).toBe(true)
    expect(result.display.active).toBe(false)
  })

  it('places generic token assets one at a time with asset image metadata', () => {
    const queue = startOneAtATimeTokenPlacement({
      kind: 'genericToken',
      id: 'asset-torch',
      name: 'Torch',
      imagePath: 'tokens/torch.webp',
      imageUrl: 'https://example.test/torch.webp',
      imageWidth: 96,
      imageHeight: 128,
    })

    const result = dropTokenPlacement(queue, point, ['Torch'])

    expect(result.command).toMatchObject({
      sourceKind: 'genericToken',
      sourceId: 'asset-torch',
      name: 'Torch (2)',
      tokenAssetId: 'asset-torch',
      tokenImagePath: 'tokens/torch.webp',
      tokenImageUrl: 'https://example.test/torch.webp',
      tokenImageWidth: 96,
      tokenImageHeight: 128,
      revealName: false,
    })
    expect(result.command?.tokenIcon.icon).toBe('custom')
    expect(result.nextQueue).toBeNull()
  })

  it('steps through Whole Party in character list order and exposes current plus remaining', () => {
    let queue = startWholePartyTokenPlacement([aria, bram])
    expect(getTokenPlacementDisplay(queue)).toMatchObject({
      active: true,
      kind: 'wholeParty',
      current: aria,
      remaining: 2,
      total: 2,
      canCancel: true,
      countdown: 2,
    })

    const first = dropTokenPlacement(queue, point, [])
    expect(first.command).toMatchObject({
      sourceKind: 'partyCharacter',
      sourceId: 'character-aria',
      characterId: 'character-aria',
      name: 'Aria',
      party: true,
      revealName: true,
    })
    expect(first.completed).toBe(false)
    expect(first.display).toMatchObject({
      active: true,
      current: bram,
      remaining: 1,
      total: 2,
    })

    queue = first.nextQueue
    const second = dropTokenPlacement(queue, { x: 0.7, y: 0.8 }, [])
    expect(second.command).toMatchObject({
      sourceKind: 'partyCharacter',
      sourceId: 'character-bram',
      characterId: 'character-bram',
      name: 'Bram',
      party: true,
    })
    expect(second.nextQueue).toBeNull()
    expect(second.completed).toBe(true)
  })

  it('does not expose a Whole Party skip path', () => {
    expect(Object.keys(queueModule)).not.toContain('skipTokenPlacement')
    expect(Object.keys(queueModule)).not.toContain('skipWholePartyToken')
  })

  it('Whole Party creates new numbered character tokens even when matching tokens already exist', () => {
    const queue = startWholePartyTokenPlacement([aria])
    const result = dropTokenPlacement(queue, point, [{ name: 'Aria' }])

    expect(result.command).toMatchObject({
      name: 'Aria (2)',
      characterId: 'character-aria',
    })
    expect(result.nextQueue).toBeNull()
  })

  it('falls back to the default pawn when a party character has no configured token art', () => {
    const queue = startWholePartyTokenPlacement([
      {
        kind: 'partyCharacter',
        id: 'character-no-art',
        name: 'No Art',
      },
    ])

    const result = dropTokenPlacement(queue, point, [])

    expect(result.command?.tokenIcon).toEqual(DEFAULT_PAWN_TOKEN_ICON)
    expect(result.command?.tokenImagePath).toBe('')
    expect(result.command?.tokenImageUrl).toBe('')
  })

  it('places monster counts one drop at a time, decrements countdown, and auto-completes at zero', () => {
    let queue = startMonsterTokenPlacement(goblin, 3)
    expect(getTokenPlacementDisplay(queue)).toMatchObject({
      active: true,
      kind: 'monster',
      current: goblin,
      remaining: 3,
      total: 3,
      countdown: 3,
    })

    const first = dropTokenPlacement(queue, point, [])
    expect(first.command).toMatchObject({ sourceKind: 'monster', name: 'Goblin', monsterId: 'monster-goblin' })
    expect(first.display.remaining).toBe(2)

    queue = first.nextQueue
    const second = dropTokenPlacement(queue, point, [])
    expect(second.command).toMatchObject({ sourceKind: 'monster', name: 'Goblin (2)' })
    expect(second.display.remaining).toBe(1)

    queue = second.nextQueue
    const third = dropTokenPlacement(queue, point, [])
    expect(third.command).toMatchObject({ sourceKind: 'monster', name: 'Goblin (3)' })
    expect(third.nextQueue).toBeNull()
    expect(third.completed).toBe(true)
    expect(third.display.active).toBe(false)
  })

  it('uses existing map token names when numbering monster placement', () => {
    const queue = startMonsterTokenPlacement(goblin, 2)

    const first = dropTokenPlacement(queue, point, ['Goblin', 'Goblin (2)'])
    expect(first.command?.name).toBe('Goblin (3)')

    const second = dropTokenPlacement(first.nextQueue, point, ['Goblin', 'Goblin (2)'])
    expect(second.command?.name).toBe('Goblin (4)')
  })

  it('supports cancel by clearing any queue state', () => {
    const queue = startMonsterTokenPlacement(goblin, 4)
    expect(cancelTokenPlacementQueue()).toBeNull()
    expect(getTokenPlacementDisplay(queue).canCancel).toBe(true)
  })

  it('does not start empty Whole Party or non-positive monster queues', () => {
    expect(startWholePartyTokenPlacement([])).toBeNull()
    expect(startMonsterTokenPlacement(goblin, 0)).toBeNull()
    expect(startMonsterTokenPlacement(goblin, -2)).toBeNull()
  })

  it('handles a null queue as already completed with no command', () => {
    const result = dropTokenPlacement(null, point, [])

    expect(result.command).toBeNull()
    expect(result.nextQueue).toBeNull()
    expect(result.completed).toBe(true)
  })

  it('retains reserved names inside queue state before persistence catches up', () => {
    let queue: TokenPlacementQueueState | null = startMonsterTokenPlacement(goblin, 2)
    const first = dropTokenPlacement(queue, point, [])

    queue = first.nextQueue
    expect(queue?.reservedNames).toEqual(['Goblin'])

    const second = dropTokenPlacement(queue, point, [])
    expect(second.command?.name).toBe('Goblin (2)')
  })
})

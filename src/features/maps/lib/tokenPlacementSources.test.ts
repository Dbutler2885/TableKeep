import { describe, expect, it } from 'vitest'
import {
  buildWholePartyTokenPlacementSources,
  toGenericTokenPlacementSource,
  toMonsterTokenPlacementSource,
  toNpcTokenPlacementSource,
  toPartyCharacterTokenPlacementSource,
} from './tokenPlacementSources'
import {
  DEFAULT_PAWN_TOKEN_ICON,
  dropTokenPlacement,
  startWholePartyTokenPlacement,
} from './tokenPlacementQueue'

const pawn = { icon: 'pawn' as const, color: '#2f5bbf', size: 34 }
const custom = {
  icon: 'custom' as const,
  color: '#ffffff',
  size: 38,
  customImagePath: 'characters/aria/token.webp',
  customImageUrl: 'https://example.test/aria.webp',
  customImageName: 'aria.webp',
}

describe('token placement sources', () => {
  it('maps NPC summaries to NPC placement sources', () => {
    expect(
      toNpcTokenPlacementSource({
        id: 'npc-1',
        name: 'Innkeeper',
        title: 'Owner',
        tags: ['town'],
        portraitUrl: null,
        portraitFocusX: 50,
        portraitFocusY: 50,
        tokenIcon: pawn,
        playerDescription: '',
        playerNotes: '',
      }),
    ).toEqual({
      kind: 'npc',
      id: 'npc-1',
      name: 'Innkeeper',
      tokenIcon: pawn,
    })
  })

  it('maps monster summaries to monster placement sources', () => {
    expect(
      toMonsterTokenPlacementSource({
        id: 'monster-goblin',
        name: 'Goblin',
        tokenIcon: pawn,
      }),
    ).toEqual({
      kind: 'monster',
      id: 'monster-goblin',
      name: 'Goblin',
      tokenIcon: pawn,
    })
  })

  it('maps party characters and preserves list order for Whole Party placement', () => {
    const aria = { id: 'character-aria', name: 'Aria', tokenIcon: custom }
    const bram = { id: 'character-bram', name: 'Bram', tokenIcon: pawn }

    expect(toPartyCharacterTokenPlacementSource(aria)).toEqual({
      kind: 'partyCharacter',
      id: 'character-aria',
      name: 'Aria',
      tokenIcon: custom,
    })
    expect(buildWholePartyTokenPlacementSources([aria, bram]).map((source) => source.id)).toEqual([
      'character-aria',
      'character-bram',
    ])
  })

  it('lets missing party token art fall back to the default pawn in the queue', () => {
    const source = toPartyCharacterTokenPlacementSource({
      id: 'character-no-art',
      name: 'No Art',
    } as Parameters<typeof toPartyCharacterTokenPlacementSource>[0])
    const queue = startWholePartyTokenPlacement([source])
    const result = dropTokenPlacement(queue, { x: 0.5, y: 0.5 }, [])

    expect(result.command?.tokenIcon).toEqual(DEFAULT_PAWN_TOKEN_ICON)
  })

  it('maps generic token assets with image metadata', () => {
    expect(
      toGenericTokenPlacementSource({
        id: 'asset-torch',
        name: 'Torch',
        imagePath: 'tokens/torch.webp',
        imageUrl: 'https://example.test/torch.webp',
        width: 96,
        height: 128,
        archived: false,
      }),
    ).toEqual({
      kind: 'genericToken',
      id: 'asset-torch',
      name: 'Torch',
      imagePath: 'tokens/torch.webp',
      imageUrl: 'https://example.test/torch.webp',
      imageWidth: 96,
      imageHeight: 128,
    })
  })
})

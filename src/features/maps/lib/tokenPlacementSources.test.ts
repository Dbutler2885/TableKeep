import { describe, expect, it } from 'vitest'
import {
  buildWholePartyTokenPlacementSources,
  partyPlacementControlsAvailable,
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
import type { CharacterTokenSummary } from './types'

const pawn = { icon: 'pawn' as const, color: '#2f5bbf', size: 34 }
const custom = {
  icon: 'custom' as const,
  color: '#ffffff',
  size: 38,
  customImagePath: 'characters/aria/token.webp',
  customImageUrl: 'https://example.test/aria.webp',
  customImageName: 'aria.webp',
}
const gmUserId = 'gm-user'

const character = (
  overrides: Partial<CharacterTokenSummary> & Pick<CharacterTokenSummary, 'id' | 'name'>,
): CharacterTokenSummary => ({
  tokenIcon: pawn,
  ownerUserId: 'player-user',
  system: 'ose',
  creationStatus: 'active',
  hpCurrent: 1,
  ...overrides,
})

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
    const aria = character({ id: 'character-aria', name: 'Aria', tokenIcon: custom })
    const bram = character({ id: 'character-bram', name: 'Bram', tokenIcon: pawn })

    expect(toPartyCharacterTokenPlacementSource(aria)).toEqual({
      kind: 'partyCharacter',
      id: 'character-aria',
      name: 'Aria',
      tokenIcon: custom,
    })
    expect(buildWholePartyTokenPlacementSources([aria, bram], gmUserId).map((source) => source.id)).toEqual([
      'character-aria',
      'character-bram',
    ])
  })

  it('includes only player-owned living characters for party placement sources', () => {
    const livingPlayer = character({
      id: 'living-player',
      name: 'Living Player',
      ownerUserId: 'player-user',
      hpCurrent: 4,
    })
    const deadPlayer = character({
      id: 'dead-player',
      name: 'Dead Player',
      ownerUserId: 'player-user',
      hpCurrent: 0,
    })
    const livingGm = character({
      id: 'living-gm',
      name: 'Living GM',
      ownerUserId: gmUserId,
      hpCurrent: 4,
    })
    const deadGm = character({
      id: 'dead-gm',
      name: 'Dead GM',
      ownerUserId: gmUserId,
      hpCurrent: 0,
    })
    const missingOwner = character({
      id: 'missing-owner',
      name: 'Missing Owner',
      ownerUserId: '',
      hpCurrent: 4,
    })

    expect(
      buildWholePartyTokenPlacementSources(
        [livingPlayer, deadPlayer, livingGm, deadGm, missingOwner],
        gmUserId,
      ).map((source) => source.id),
    ).toEqual(['living-player'])
  })

  it('includes active VtM player characters without OSE hit points', () => {
    const activeVampire = character({
      id: 'active-vampire',
      name: 'Active Vampire',
      system: 'vtm',
      hpCurrent: undefined,
      incapacitated: false,
    })
    const incapacitatedVampire = character({
      id: 'incapacitated-vampire',
      name: 'Incapacitated Vampire',
      system: 'vtm',
      hpCurrent: undefined,
      incapacitated: true,
    })
    const draftVampire = character({
      id: 'draft-vampire',
      name: 'Draft Vampire',
      system: 'vtm',
      creationStatus: 'draft',
      hpCurrent: undefined,
      incapacitated: false,
    })

    expect(buildWholePartyTokenPlacementSources(
      [activeVampire, incapacitatedVampire, draftVampire],
      gmUserId,
    ).map((source) => source.id)).toEqual(['active-vampire'])
  })

  it('keeps hidden, deleted, and incomplete characters out of party controls', () => {
    const active = character({ id: 'active', name: 'Active' })
    const hidden = character({ id: 'hidden', name: 'Hidden', hidden: true })
    const deleted = character({ id: 'deleted', name: 'Deleted', deleted: true })
    const draft = character({ id: 'draft', name: 'Draft', creationStatus: 'draft' })
    const sources = buildWholePartyTokenPlacementSources([active, hidden, deleted, draft], gmUserId)

    expect(sources.map((source) => source.id)).toEqual(['active'])
    expect(partyPlacementControlsAvailable(sources)).toBe(true)
    expect(partyPlacementControlsAvailable([])).toBe(false)
  })

  it('places VtM party sources as party tokens', () => {
    const vampire = character({
      id: 'vampire',
      name: 'Vampire',
      system: 'vtm',
      hpCurrent: undefined,
      incapacitated: false,
    })
    const queue = startWholePartyTokenPlacement(buildWholePartyTokenPlacementSources([vampire], gmUserId))
    const result = dropTokenPlacement(queue, { x: 0.25, y: 0.75 }, [])

    expect(result.command).toMatchObject({
      sourceKind: 'partyCharacter',
      characterId: 'vampire',
      party: true,
    })
  })

  it('does not treat missing ownership fields as player-owned', () => {
    const missingOwner = {
      id: 'missing-owner-field',
      name: 'Missing Owner Field',
      tokenIcon: pawn,
      hpCurrent: 5,
    } as CharacterTokenSummary

    expect(buildWholePartyTokenPlacementSources([missingOwner], gmUserId)).toEqual([])
  })

  it('lets missing party token art fall back to the default pawn in the queue', () => {
    const source = toPartyCharacterTokenPlacementSource({
      id: 'character-no-art',
      name: 'No Art',
      ownerUserId: 'player-user',
      hpCurrent: 1,
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

import { describe, expect, it } from 'vitest'
import { mapCharacterSummaryFromData } from './mapCharacterSummary'

describe('map character summary', () => {
  it('normalizes OSE hit points without changing living-party semantics', () => {
    const summary = mapCharacterSummaryFromData('ose-character', {
      name: 'Mirelda',
      ownerUserId: 'player',
      creationStatus: 'active',
      hpCurrent: 7,
      tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
    })

    expect(summary).toMatchObject({
      system: 'ose',
      creationStatus: 'active',
      hpCurrent: 7,
    })
    expect(summary).not.toHaveProperty('incapacitated')
  })

  it('normalizes VtM health instead of inventing zero OSE hit points', () => {
    const summary = mapCharacterSummaryFromData('vtm-character', {
      system: 'vtm',
      name: 'Connor',
      ownerUserId: 'player',
      creationStatus: 'active',
      vtm: { health: { Incapacitated: false } },
      tokenIcon: { icon: 'pawn', color: '#7a1a1f', size: 34 },
    })

    expect(summary).toMatchObject({
      system: 'vtm',
      creationStatus: 'active',
      incapacitated: false,
    })
    expect(summary).not.toHaveProperty('hpCurrent')
  })

  it('preserves a resolved VtM token URL while the same Storage path remains current', () => {
    const customImagePath = 'groups/group/campaigns/campaign/characters/connor/token-icons/connor.webp'
    const local = mapCharacterSummaryFromData('vtm-character', {
      system: 'vtm',
      name: 'Connor',
      ownerUserId: 'player',
      creationStatus: 'active',
      vtm: { health: {} },
      tokenIcon: {
        icon: 'custom',
        color: '#7a1a1f',
        size: 34,
        customImagePath,
        customImageUrl: 'https://firebasestorage.test/connor.webp?token=resolved',
      },
    })

    const next = mapCharacterSummaryFromData('vtm-character', {
      system: 'vtm',
      name: 'Connor',
      ownerUserId: 'player',
      creationStatus: 'active',
      vtm: { health: {} },
      tokenIcon: {
        icon: 'custom',
        color: '#7a1a1f',
        size: 34,
        customImagePath,
      },
    }, local)

    expect(next.tokenIcon.customImageUrl).toBe('https://firebasestorage.test/connor.webp?token=resolved')
  })

  it('marks explicit hidden and deleted records ineligible upstream', () => {
    expect(mapCharacterSummaryFromData('deleted-character', {
      name: 'Deleted',
      ownerUserId: 'player',
      creationStatus: 'active',
      hpCurrent: 5,
      hidden: true,
      deletedAt: { seconds: 1 },
    })).toMatchObject({ hidden: true, deleted: true })
  })
})

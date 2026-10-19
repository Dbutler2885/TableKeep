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

describe('map character summary fields', () => {
  it('reads blank identity fields when the document has none', () => {
    expect(mapCharacterSummaryFromData('bare', { name: 7, ownerUserId: null })).toEqual({
      id: 'bare',
      name: '',
      ownerUserId: '',
      system: 'ose',
      creationStatus: 'active',
      hpCurrent: 0,
      hidden: false,
      deleted: false,
      tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
    })
  })

  it('treats any system other than vtm as OSE', () => {
    expect(mapCharacterSummaryFromData('other', { system: 'lubec', hpCurrent: 4 })).toMatchObject({
      system: 'ose',
      hpCurrent: 4,
    })
  })

  it.each([
    [-3, 0],
    [0, 0],
    [2.5, 2.5],
    ['5', 0],
  ])('clamps OSE hit points %j to %j', (hpCurrent, expected) => {
    expect(mapCharacterSummaryFromData('ose', { hpCurrent }).hpCurrent).toBe(expected)
  })

  it.each([
    [{ creationStatus: 'draft' }, 'draft'],
    [{ creationStatus: 'active', creationMode: 'new', creationModeExplicit: true }, 'active'],
    [{ creationStatus: 'retired' }, 'active'],
    [{ creationModeExplicit: true, creationMode: 'established' }, 'active'],
    [{ creationModeExplicit: 'yes', creationMode: 'new' }, 'active'],
  ])('reads OSE creation status from %j as %s', (fields, expected) => {
    expect(mapCharacterSummaryFromData('ose', fields).creationStatus).toBe(expected)
  })

  it.each([
    [{ creationStatus: 'draft' }, 'draft'],
    [{ creationStatus: 'established_draft' }, 'established_draft'],
    [{ creationStatus: 'retired', creationMode: 'new' }, 'draft'],
    [{ creationMode: 'established' }, 'established_draft'],
  ])('reads VtM creation status from %j as %s', (fields, expected) => {
    expect(mapCharacterSummaryFromData('vtm', { system: 'vtm', ...fields }).creationStatus).toBe(expected)
  })

  it.each([
    [undefined, false],
    ['broken', false],
    [[], false],
    [{ health: 'broken' }, false],
    [{ health: [] }, false],
    [{ health: { Incapacitated: 'yes' } }, false],
    [{ health: { Incapacitated: true } }, true],
  ])('reads VtM health %j as incapacitated %s', (vtm, incapacitated) => {
    expect(mapCharacterSummaryFromData('vtm', { system: 'vtm', vtm }).incapacitated).toBe(incapacitated)
  })

  it.each([
    [{ deleted: true }, true],
    [{ deleted: 'yes' }, false],
    [{ deletedAt: null }, false],
    [{ deletedAt: 0 }, true],
    [{ hidden: 'yes' }, false],
  ])('reads hidden and deleted from %j', (fields, deleted) => {
    const summary = mapCharacterSummaryFromData('flags', fields)
    expect(summary.deleted).toBe(deleted)
    expect(summary.hidden).toBe(false)
  })
})

describe('map character token icon', () => {
  const customImagePath = 'groups/group/campaigns/campaign/characters/pc/token-icons/pc.webp'
  const localWith = (tokenIcon: Record<string, unknown>) =>
    mapCharacterSummaryFromData('pc', { tokenIcon })

  it.each([null, 'pawn', ['pawn']])('falls back to the default pawn when the stored icon is %j', (tokenIcon) => {
    expect(mapCharacterSummaryFromData('pc', { tokenIcon }).tokenIcon).toEqual({ icon: 'pawn', color: '#bf2f2a', size: 34 })
  })

  it('keeps a stored icon as it is', () => {
    const tokenIcon = { icon: 'skull', color: '#123456', size: 40 }
    expect(mapCharacterSummaryFromData('pc', { tokenIcon }).tokenIcon).toBe(tokenIcon)
  })

  it('keeps a stored custom URL even when a local one is resolved', () => {
    const local = localWith({ icon: 'custom', color: '#000', size: 34, customImagePath, customImageUrl: 'https://local.test/a.webp' })
    const tokenIcon = { icon: 'custom', color: '#000', size: 34, customImagePath, customImageUrl: 'https://stored.test/b.webp' }
    expect(mapCharacterSummaryFromData('pc', { tokenIcon }, local).tokenIcon).toEqual(tokenIcon)
  })

  it('carries an OSE local URL over for the same path', () => {
    const local = localWith({ icon: 'custom', color: '#000', size: 34, customImagePath, customImageUrl: 'data:image/webp;base64,AAAA' })
    const next = mapCharacterSummaryFromData('pc', { tokenIcon: { icon: 'custom', color: '#000', size: 34, customImagePath } }, local)
    expect(next.tokenIcon).toEqual({ icon: 'custom', color: '#000', size: 34, customImagePath, customImageUrl: 'data:image/webp;base64,AAAA' })
  })

  it.each([
    ['a different path', { customImagePath: 'other/path.webp', customImageUrl: 'https://local.test/a.webp' }],
    ['an unrenderable URL', { customImagePath, customImageUrl: 'blob:local' }],
    ['no URL', { customImagePath }],
  ])('drops a local URL with %s', (_label, localIcon) => {
    const local = localWith({ icon: 'custom', color: '#000', size: 34, ...localIcon })
    const tokenIcon = { icon: 'custom', color: '#000', size: 34, customImagePath }
    const next = mapCharacterSummaryFromData('pc', { tokenIcon }, local)
    expect(next.tokenIcon).toBe(tokenIcon)
  })

  it('carries nothing over when the stored icon has no path', () => {
    const local = localWith({ icon: 'custom', color: '#000', size: 34, customImageUrl: 'https://local.test/a.webp' })
    const tokenIcon = { icon: 'pawn', color: '#000', size: 34 }
    expect(mapCharacterSummaryFromData('pc', { tokenIcon }, local).tokenIcon).toBe(tokenIcon)
  })

  it('carries a local URL into the default icon only when both lack a path', () => {
    const next = mapCharacterSummaryFromData('pc', {}, localWith({ icon: 'pawn', color: '#000', size: 34 }))
    expect(next.tokenIcon).toEqual({ icon: 'pawn', color: '#bf2f2a', size: 34 })
  })
})

import type { CharacterGeneralItem, CharacterRecord } from '../../types/app'

export function generalItemFixture(overrides: Partial<CharacterGeneralItem> = {}): CharacterGeneralItem {
  return {
    id: 'rope', kind: 'general', typeId: 'gear-rope', typeName: 'Rope',
    costGp: 1, qty: 1, equipped: false, notes: '', stack: { stackable: false },
    ...overrides,
  }
}

export function characterFixture(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'hero', name: 'Mirelda', ownerUserId: 'player', ownerUsername: 'player1',
    creationMode: 'new', creationModeExplicit: true, creationStatus: 'draft',
    className: 'Fighter', level: 1, hpCurrent: 6, hpMax: 6, ac: 10, xp: 0,
    portraitPath: '', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50,
    tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
    ...overrides,
  }
}

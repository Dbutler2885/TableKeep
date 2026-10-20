import { describe, expect, it, vi } from 'vitest'
import { makeVtmCharacter } from '../vtmDefaults'

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))

const { canChooseCharacterStoreCharacter, canEditCharacterStoreCharacter } = await import('./characterStoreActions')

const owned = { ...makeVtmCharacter('user-1', 'player1'), id: 'a' }

describe('canEditCharacterStoreCharacter', () => {
  it('lets the GM edit any character and a player only their own', () => {
    expect(canEditCharacterStoreCharacter(owned, 'gm', 'gm-1')).toBe(true)
    expect(canEditCharacterStoreCharacter(owned, 'player', 'user-1')).toBe(true)
    expect(canEditCharacterStoreCharacter(owned, 'player', 'user-2')).toBe(false)
    expect(canEditCharacterStoreCharacter(owned, null, 'user-2')).toBe(false)
    expect(canEditCharacterStoreCharacter(undefined, 'gm', 'gm-1')).toBe(false)
  })
})

describe('canChooseCharacterStoreCharacter', () => {
  it('stops only a player choosing someone else\'s character', () => {
    expect(canChooseCharacterStoreCharacter(owned, 'gm', 'gm-1')).toBe(true)
    expect(canChooseCharacterStoreCharacter(owned, 'player', 'user-1')).toBe(true)
    expect(canChooseCharacterStoreCharacter(owned, 'player', 'user-2')).toBe(false)
    expect(canChooseCharacterStoreCharacter(undefined, 'gm', 'gm-1')).toBe(false)
  })
})

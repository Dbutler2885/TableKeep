import { describe, expect, it, vi } from 'vitest'
import { makeVtmCharacter } from './vtmDefaults'

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))

const { canChooseVtmCharacter, canEditVtmCharacter } = await import('./vtmCharacterActions')

const owned = { ...makeVtmCharacter('user-1', 'player1'), id: 'a' }

describe('canEditVtmCharacter', () => {
  it('lets the GM edit any character and a player only their own', () => {
    expect(canEditVtmCharacter(owned, 'gm', 'gm-1')).toBe(true)
    expect(canEditVtmCharacter(owned, 'player', 'user-1')).toBe(true)
    expect(canEditVtmCharacter(owned, 'player', 'user-2')).toBe(false)
    expect(canEditVtmCharacter(owned, null, 'user-2')).toBe(false)
    expect(canEditVtmCharacter(undefined, 'gm', 'gm-1')).toBe(false)
  })
})

describe('canChooseVtmCharacter', () => {
  it('stops only a player choosing someone else\'s character', () => {
    expect(canChooseVtmCharacter(owned, 'gm', 'gm-1')).toBe(true)
    expect(canChooseVtmCharacter(owned, 'player', 'user-1')).toBe(true)
    expect(canChooseVtmCharacter(owned, 'player', 'user-2')).toBe(false)
    expect(canChooseVtmCharacter(undefined, 'gm', 'gm-1')).toBe(false)
  })
})

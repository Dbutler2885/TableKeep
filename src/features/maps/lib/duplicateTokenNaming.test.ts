import { describe, expect, it } from 'vitest'
import { nextDuplicateTokenName, normalizeDuplicateTokenBaseName } from './duplicateTokenNaming'

describe('nextDuplicateTokenName', () => {
  it('keeps the first monster token unnumbered and numbers later duplicates', () => {
    expect(nextDuplicateTokenName('Goblin', [])).toBe('Goblin')
    expect(nextDuplicateTokenName('Goblin', ['Goblin'])).toBe('Goblin (2)')
    expect(nextDuplicateTokenName('Goblin', ['Goblin', 'Goblin (2)'])).toBe('Goblin (3)')
  })

  it('accounts for existing numbered monster names already on the map', () => {
    expect(nextDuplicateTokenName('Goblin', ['Goblin', 'Goblin (2)', 'Goblin (4)'])).toBe('Goblin (5)')
    expect(nextDuplicateTokenName('Goblin', ['Goblin (3)'])).toBe('Goblin (4)')
  })

  it('numbers duplicate player-character tokens by character name', () => {
    const existingCharacterTokens = [
      { name: 'Aria' },
      { name: 'Aria (2)' },
      { name: 'Bram' },
    ]

    expect(nextDuplicateTokenName('Aria', existingCharacterTokens)).toBe('Aria (3)')
    expect(nextDuplicateTokenName('Bram', existingCharacterTokens)).toBe('Bram (2)')
    expect(nextDuplicateTokenName('Cato', existingCharacterTokens)).toBe('Cato')
  })

  it('numbers duplicate NPC tokens independently by base NPC name', () => {
    const existingNpcTokens = [
      { name: 'New NPC' },
      { name: 'New NPC (2)' },
      { name: 'Innkeeper' },
    ]

    expect(nextDuplicateTokenName('New NPC', existingNpcTokens)).toBe('New NPC (3)')
    expect(nextDuplicateTokenName('Innkeeper', existingNpcTokens)).toBe('Innkeeper (2)')
  })

  it('numbers duplicate generic token assets by asset name', () => {
    const existingAssetTokens = ['Torch', 'Torch (2)', 'Torch (3)', 'Crate']

    expect(nextDuplicateTokenName('Torch', existingAssetTokens)).toBe('Torch (4)')
    expect(nextDuplicateTokenName('Crate', existingAssetTokens)).toBe('Crate (2)')
  })

  it('ignores partial name matches and escapes regex characters in base names', () => {
    expect(nextDuplicateTokenName('Goblin', ['Goblin Archer', 'Goblin King'])).toBe('Goblin')
    expect(nextDuplicateTokenName('Rat Swarm +1', ['Rat Swarm +1', 'Rat Swarm +1 (2)'])).toBe('Rat Swarm +1 (3)')
  })

  it('normalizes numbered source names and blank names before numbering', () => {
    expect(normalizeDuplicateTokenBaseName('Goblin (2)')).toBe('Goblin')
    expect(nextDuplicateTokenName('Goblin (2)', ['Goblin', 'Goblin (2)'])).toBe('Goblin (3)')
    expect(nextDuplicateTokenName('', [])).toBe('Token')
    expect(nextDuplicateTokenName('', ['Token'])).toBe('Token (2)')
  })
})

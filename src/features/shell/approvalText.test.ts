import { describe, expect, it } from 'vitest'
import type { CharacterInventoryItem } from '../../types/app'
import { approvalTitle, flagSuffix, itemDisplayName, numericSuffix } from './approvalText'

describe('approvalTitle', () => {
  it('titles each kind of request', () => {
    expect(approvalTitle('sell')).toBe('Sell Approval Request')
    expect(approvalTitle('learn_spell')).toBe('Spell Transcription Request')
    expect(approvalTitle('ability_reroll')).toBe('Ability Re-roll Request')
    expect(approvalTitle('create')).toBe('Item Approval Request')
  })
})

describe('itemDisplayName', () => {
  const item = (name: string | undefined) => ({ typeName: 'Sword', name }) as CharacterInventoryItem

  it('quotes a given name after the type', () => {
    expect(itemDisplayName(item('Fang'))).toBe('Sword "Fang"')
  })

  it('uses the type alone without a name', () => {
    expect(itemDisplayName(item(''))).toBe('Sword')
    expect(itemDisplayName(item(undefined))).toBe('Sword')
  })
})

describe('numericSuffix', () => {
  it('shows the text for a non-zero number only', () => {
    expect(numericSuffix('2', ' | Dmg +2')).toBe(' | Dmg +2')
    expect(numericSuffix('-1', ' | Atk +-1')).toBe(' | Atk +-1')
    expect(numericSuffix('0', ' | Dmg +0')).toBe('')
    expect(numericSuffix('', ' | Dmg +')).toBe('')
    expect(numericSuffix('x', ' | Dmg +x')).toBe('')
  })
})

describe('flagSuffix', () => {
  it('shows the text for a set flag only', () => {
    expect(flagSuffix(true, ' | Magic')).toBe(' | Magic')
    expect(flagSuffix(false, ' | Magic')).toBe('')
  })
})

/** The keys of the stock suggestions under the name. */
import { describe, expect, it } from 'vitest'
import { lubecSuggestKey } from './suggestKeys'

describe('the suggestions\' keys', () => {
  it('moves down and up through the rows and the "Browse all stock" row, round and round', () => {
    expect(lubecSuggestKey('ArrowDown', -1, 3)).toEqual({ act: 'move', at: 0 })
    expect(lubecSuggestKey('ArrowDown', 3, 3)).toEqual({ act: 'move', at: 0 })
    expect(lubecSuggestKey('ArrowUp', -1, 3)).toEqual({ act: 'move', at: 3 })
    expect(lubecSuggestKey('ArrowUp', 2, 3)).toEqual({ act: 'move', at: 1 })
  })

  it('picks with Enter only on a row, closes with Escape, and leaves every other key to the input', () => {
    expect(lubecSuggestKey('Enter', 1, 3)).toEqual({ act: 'pick', at: 1 })
    expect(lubecSuggestKey('Enter', -1, 3)).toBeNull()
    expect(lubecSuggestKey('Escape', 0, 3)).toEqual({ act: 'close' })
    expect(lubecSuggestKey('a', 0, 3)).toBeNull()
  })
})

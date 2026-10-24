import { describe, expect, it, vi } from 'vitest'
import { characterFixture, generalItemFixture } from '../characterTestFixtures'
import { deleteConfirmTargetFor, detailItemFor, selectCharacterFromList } from './characterTabHandlers'

describe('character list selection', () => {
  function selection(overrides: { effectiveGrantMode?: boolean, isSinglePane?: boolean } = {}) {
    const calls: string[] = []
    return {
      calls,
      effectiveGrantMode: false,
      isSinglePane: false,
      exitGrantModeForCharacterSelection: vi.fn(() => { calls.push('exit grant') }),
      resetLevelUpForCharacterSelection: vi.fn(() => { calls.push('reset level-up') }),
      setSelectedCharacterId: vi.fn((id: string) => { calls.push(`select ${id}`) }),
      setPaneView: vi.fn((view: string) => { calls.push(`pane ${view}`) }),
      ...overrides,
    }
  }

  it('leaves grant mode, resets level-up, selects, and shows the sheet on one pane, in that order', () => {
    const current = selection({ effectiveGrantMode: true, isSinglePane: true })
    selectCharacterFromList(current, 'hero')
    expect(current.calls).toEqual(['exit grant', 'reset level-up', 'select hero', 'pane detail'])
  })

  it('stays out of grant mode and keeps both panes when neither applies', () => {
    const current = selection()
    selectCharacterFromList(current, 'hero')
    expect(current.calls).toEqual(['reset level-up', 'select hero'])
  })
})

describe('delete confirmation target', () => {
  it('names the character, or "character" when it has no name', () => {
    expect(deleteConfirmTargetFor(characterFixture())).toEqual({ id: 'hero', name: 'Mirelda' })
    expect(deleteConfirmTargetFor(characterFixture({ name: '' }))).toEqual({ id: 'hero', name: 'character' })
  })
})

describe('detail item', () => {
  const rope = generalItemFixture()
  const torch = generalItemFixture({ id: 'torch', name: 'Torch' })

  it('finds the open item, or null for a closed or missing one', () => {
    expect(detailItemFor([rope, torch], 'torch')).toBe(torch)
    expect(detailItemFor([rope, torch], 'missing')).toBeNull()
    expect(detailItemFor([rope, torch], null)).toBeNull()
    expect(detailItemFor([rope, torch], '')).toBeNull()
  })
})

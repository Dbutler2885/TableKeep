import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { lubecCharacterSheet } from './sheetFixtures'
import { lubecWakingIntention } from './waking'

const unconscious = { id: 'wake', name: 'Knocked out', cause: 'Fisticuffs Head 9', cardKey: 'unconscious', wakeSave: 'severe-concussion', wound: { groupId: 'original', trauma: 2, minimumStress: 3, dice: { minutes: [4, 9] } }, steps: [{ modifiers: [], labels: ['13 minutes'], until: 'by-hand', restrictions: [{ kind: 'unconscious' }] }] }
const sibling = { id: 'sibling', name: 'Dazed', cause: 'Different injury', steps: [{ modifiers: [], labels: ['Keep'], until: 'rounds' }] }
const raw = (effects: object[] = [unconscious, sibling]) => ({ sheetRevision: 2, untouched: 'keep', lubec: { ...lubecCharacterSheet(), counters: { stress: 2, minimumStress: 3, trauma: 2 }, effects } })
const after = (before: ReturnType<typeof raw>, dice: number[]) => {
  const queue = [...dice]
  return planSheetIntention(before, lubecWakingIntention(before, 'wake', 'op', () => queue.shift()!)).mutation!.sheet as ReturnType<typeof raw>
}

describe('Head 9 waking aftermath', () => {
  it('success replaces only unconscious with -10 Handle, preserving the original wound, counters and sibling', () => {
    const next = after(raw(), [.01, .02])
    const card = next.lubec.effects.find((entry) => (entry as { id: string }).id === 'wake_aftermath')
    expect(card).toMatchObject({ cardKey: 'concussion', wound: unconscious.wound, steps: [{ until: 'long-rest', modifiers: [{ target: 'Handle', amount: -10 }] }], recoveryRoll: { advantage: 'disadvantage', dice: [2, 3], outcome: 'success', stressAdded: 0 } })
    expect(next.lubec.effects).toContainEqual(sibling)
    expect(next.lubec.counters).toEqual(raw().lubec.counters)
    expect(next.untouched).toBe('keep')
  })
  it('failure charges only one Save Stress and keeps the original rest schedule and lasting loss', () => {
    const next = after(raw(), [.01, .99])
    const card = next.lubec.effects.find((entry) => (entry as { id: string }).id === 'wake_aftermath') as { steps: { modifiers: object[]; labels: string[] }[] }
    expect(card.steps.map((step) => step.modifiers)).toEqual([[{ target: 'Handle', amount: -30 }], [{ target: 'Handle', amount: -10 }], [{ target: 'Intellect', amount: -10 }]])
    expect(card.steps[0].labels).toContain('Long Rests count from the original injury.')
    expect(next.lubec.counters).toEqual({ stress: 3, minimumStress: 3, trauma: 2 })
    expect(next.lubec.effects).toHaveLength(2)
  })
  it('combines an active Save Advantage with the fixed Disadvantage, and does not activate future steps', () => {
    const advantage = { id: 'mode', name: 'Focused', cause: '', steps: [{ modifiers: [], labels: [], rolls: [{ scope: 'saves', mode: 'advantage' }] }] }
    const next = after(raw([unconscious, advantage]), [.01])
    expect(next.lubec.effects[1]).toMatchObject({ recoveryRoll: { advantage: 'normal', dice: [2] } })
  })
  it('does not infer an aftermath from Neck 9 or an old card label', () => {
    const { wakeSave: ignored, ...neck } = unconscious
    expect(ignored).toBe('severe-concussion')
    expect(() => after(raw([neck]), [.01])).toThrow('no waking Save pending')
  })
})

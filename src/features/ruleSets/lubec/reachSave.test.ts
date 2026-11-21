import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { lubecCharacterSheet } from './sheetFixtures'
import { lubecReachSaveIntention, lubecReachSavePending } from './reachSave'

// Cutting Neck 5's speech card, as it lands: whisper only until 1 Long Rest, then the Body Save.
const speech = {
  id: 'op_speech', name: 'Windpipe opened', part: 'Speech', cause: 'Cutting, neck, Impact 5', cardKey: 'speech', wound: { groupId: 'op', trauma: 2 },
  steps: [
    { modifiers: [], labels: [], until: 'long-rest', restrictions: [{ kind: 'speech', words: 'Whisper only' }] },
    { modifiers: [], labels: ['Body Save: failure leaves Speech damaged, and the GM may call for Disadvantage on a relevant Charm Check'], until: 'by-hand', onReach: { save: 'Body', failure: 'Speech damaged' } },
  ],
}
const throat = { id: 'op_throat', name: 'Windpipe opened', part: 'Throat', cause: 'Cutting, neck, Impact 5', steps: [{ modifiers: [], labels: [], until: 'long-rest', rolls: [{ scope: 'physical', mode: 'disadvantage' }] }] }
const bleed = { id: 'op_bleed', name: 'Windpipe opened', part: 'Bleeding', cause: 'Cutting, neck, Impact 5', steps: [{ modifiers: [], labels: [], until: 'rounds' }] }
// Body 21 reads as the Save's number: 0.01 rolls 2, 0.99 rolls 100.
const raw = (effects: object[] = [speech, throat, bleed]) => ({ sheetRevision: 4, untouched: 'keep', lubec: { ...lubecCharacterSheet(), counters: { stress: 2, minimumStress: 1, trauma: 2 }, effects } })
const after = (before: ReturnType<typeof raw>, dice: number[]) => {
  const queue = [...dice]
  return planSheetIntention(before, lubecReachSaveIntention(before, 'op_speech', 'op_reach', () => queue.shift()!)).mutation!.sheet as ReturnType<typeof raw>
}
const ids = (sheet: ReturnType<typeof raw>) => sheet.lubec.effects.map((entry) => (entry as { id: string }).id)

describe('the delayed speech-recovery Save', () => {
  it('is pending only on the step before the Save, never once it is past', () => {
    expect(lubecReachSavePending(speech as never)).toBe(true)
    expect(lubecReachSavePending({ ...speech, steps: [speech.steps[1]] } as never)).toBe(false)
    expect(lubecReachSavePending(throat as never)).toBe(false)
  })

  it('success clears the speech card and leaves no reminder, Trauma, Minimum Stress or sibling touched', () => {
    const next = after(raw(), [0.01])
    expect(ids(next)).toEqual(['op_throat', 'op_bleed'])
    expect(next.lubec.counters).toEqual({ stress: 2, minimumStress: 1, trauma: 2 })
    expect(next.lubec.lastRoll).toMatchObject({ kind: 'save', against: 'Body', result: 2, outcome: 'success', stressAdded: 0 })
    expect(next.untouched).toBe('keep')
  })

  it('failure leaves Speech damaged as a lasting Charm reminder with the Save recorded, and its Stress once', () => {
    const next = after(raw(), [0.99])
    expect(ids(next)).toEqual(['op_throat', 'op_bleed', 'op_speech_recovered'])
    const card = next.lubec.effects[2] as typeof speech & { recoveryRoll: object }
    expect(card).toMatchObject({ part: 'Speech', wound: speech.wound, steps: [{ labels: ['Speech damaged'], until: 'lasting', charmReminder: true, modifiers: [] }] })
    expect(card.recoveryRoll).toMatchObject({ result: 100, outcome: 'failure', purpose: 'Windpipe opened recovery' })
    expect(next.lubec.counters).toEqual({ stress: 3, minimumStress: 1, trauma: 2 })
  })

  it('rolls with every active Body Save mode', () => {
    const shaky = { id: 'shaky', name: 'Fever', cause: '', steps: [{ modifiers: [], labels: [], until: 'long-rest', rolls: [{ scope: 'saves', mode: 'disadvantage' }] }] }
    const next = after(raw([speech, shaky]), [0.01, 0.99])
    expect(next.lubec.lastRoll).toMatchObject({ advantage: 'disadvantage', dice: [2, 100], outcome: 'failure', because: 'Disadvantage from Fever' })
  })

  it('refuses a card with no Save pending, so a retried Step down never rolls twice', () => {
    expect(() => lubecReachSaveIntention(raw([throat]), 'op_throat', 'op', () => 0.5)).toThrow('That card has no recovery Save pending.')
  })
})

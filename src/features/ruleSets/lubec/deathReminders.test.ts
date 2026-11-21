import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { lubecCharacterSheet } from './sheetFixtures'
import {
  LUBEC_DEATH_TABLE, lubecDeathAcknowledgementEdits, lubecDeathReasons, lubecDeathReminder, lubecDeathReminderEdits,
  lubecPendingDeathReminders, lubecWithTraumaEvent, parseLubecDeathReminders,
} from './deathReminders'

describe('why an event calls for a Death Save', () => {
  it('reminds the first time Trauma reaches the threshold, 4, or 5 for a Tough', () => {
    expect(lubecDeathReasons({ threshold: 4, before: 2, added: 2 })).toEqual(['Trauma reached 4, the Death Save threshold of 4'])
    expect(lubecDeathReasons({ threshold: 5, before: 2, added: 2 })).toEqual([])
    expect(lubecDeathReasons({ threshold: 5, before: 3, added: 2 })).toEqual(['Trauma reached 5, the Death Save threshold of 5'])
  })

  it('reminds again for each later event adding Trauma at or past it, never for a fall or no change', () => {
    expect(lubecDeathReasons({ threshold: 4, before: 4, added: 1 })).toEqual(['Trauma rose to 5, at or above the threshold of 4'])
    expect(lubecDeathReasons({ threshold: 4, before: 6, added: -2 })).toEqual([])
    expect(lubecDeathReasons({ threshold: 4, before: 5, added: 0 })).toEqual([])
    expect(lubecDeathReasons({ threshold: null, before: 9, added: 1 })).toEqual([])
  })

  it('puts an Immediate Death Save and the threshold into one reminder; a Tough does not delay the Immediate one', () => {
    expect(lubecDeathReasons({ threshold: 4, before: 0, added: 4, immediate: 'Shot through the heart' })).toEqual(['Immediate Death Save: Shot through the heart', 'Trauma reached 4, the Death Save threshold of 4'])
    expect(lubecDeathReasons({ threshold: 5, before: 0, added: 4, immediate: 'Shot through the heart' })).toEqual(['Immediate Death Save: Shot through the heart'])
  })
})

describe('reminders on the sheet', () => {
  const raw = (lubec: object = {}) => ({ sheetRevision: 1, lubec: { ...lubecCharacterSheet(), ...lubec } })

  it('starts the list on a sheet without one and inserts beside one that has it', () => {
    const first = lubecDeathReminder('a', ['Trauma reached 4'], 'event')
    const started = planSheetIntention(raw(), { operationId: 'o', baseRevision: 1, edits: lubecDeathReminderEdits(raw().lubec, first) }).mutation!.sheet as ReturnType<typeof raw>
    expect(started.lubec.deathReminders).toEqual(first)
    const more = lubecDeathReminder('b', ['Critical'], 'later')
    const added = planSheetIntention(started, { operationId: 'p', baseRevision: 2, edits: lubecDeathReminderEdits(started.lubec, more) }).mutation!.sheet as ReturnType<typeof raw>
    expect(parseLubecDeathReminders(added.lubec.deathReminders).map((reminder) => reminder.id)).toEqual(['a', 'b'])
    expect(lubecDeathReminderEdits(raw().lubec, lubecDeathReminder('c', [], 'nothing'))).toEqual([])
  })

  it('marks one handled without rolling or applying anything, and a second press changes nothing', () => {
    const stored = raw({ deathReminders: [{ id: 'a', reasons: ['r'], event: 'e' }, { id: 'b', reasons: ['r'], event: 'e' }] })
    const done = planSheetIntention(stored, { operationId: 'o', baseRevision: 1, edits: lubecDeathAcknowledgementEdits(stored.lubec, 'a') }).mutation!.sheet as ReturnType<typeof raw>
    expect(done.lubec.counters).toEqual(stored.lubec.counters)
    expect(lubecPendingDeathReminders(parseLubecDeathReminders(done.lubec.deathReminders)).map((reminder) => reminder.id)).toEqual(['b'])
    expect(lubecDeathAcknowledgementEdits(done.lubec, 'a')).toEqual([])
  })

  it('raises one for a Trauma increase by hand, none for a decrease, and never clears old ones', () => {
    const sheet = { ...lubecCharacterSheet(), counters: { stress: 2, minimumStress: 2, trauma: 3 }, deathReminders: [{ id: 'old', reasons: ['r'], event: 'e' }] }
    const raised = lubecWithTraumaEvent(sheet, { ...sheet.counters, trauma: 4 }, 'evt')
    expect(raised.deathReminders!.map((reminder) => reminder.id)).toEqual(['old', 'manual_evt'])
    expect(raised.deathReminders![1]).toEqual({ id: 'manual_evt', reasons: ['Trauma reached 4, the Death Save threshold of 4'], event: 'Trauma raised by hand' })
    const lowered = lubecWithTraumaEvent(raised, { ...raised.counters, trauma: 1 }, 'down')
    expect(lowered.deathReminders).toEqual(raised.deathReminders)
    expect(lowered.counters.trauma).toBe(1)
  })

  it('keeps the adapted Death table\'s four bands, with result 0\'s Minimum Stress', () => {
    expect(LUBEC_DEATH_TABLE.map((row) => row.roll)).toEqual(['0', '1-2', '3-4', '5-9'])
    expect(LUBEC_DEATH_TABLE[0].result).toBe('You are unconscious. You wake up in 2d10 minutes. Add 1d5 to your Minimum Stress.')
  })
})

import { describe, expect, it } from 'vitest'
import type { SessionNote } from '../../types/app'
import { applySessionNotePatch, sessionNumberBackfills } from './sessionNotePatch'

const note = (id: string, fields: Partial<SessionNote> = {}): SessionNote => ({
  id,
  title: '',
  sessionNumber: null,
  sourceType: 'manual',
  createdAt: null,
  updatedAt: null,
  summaryMarkdown: '',
  overallSummary: '',
  scenes: [],
  npcMentions: [],
  cliffhangers: [],
  calendar: [],
  generatedSnapshot: null,
  hasHumanEdits: false,
  editedAt: null,
  editedBy: null,
  ...fields,
})

describe('applySessionNotePatch', () => {
  it('changes only the patched note', () => {
    const other = note('other', { sessionNumber: 1 })
    const notes = applySessionNotePatch([note('edited', { sessionNumber: 2 }), other], 'edited', { overallSummary: 'New' })

    expect(notes.find((entry) => entry.id === 'edited')).toMatchObject({ overallSummary: 'New', sessionNumber: 2 })
    expect(notes.find((entry) => entry.id === 'other')).toBe(other)
  })

  it('takes the session number from an edited title when the note has none', () => {
    const [edited] = applySessionNotePatch([note('edited', { title: 'Old' })], 'edited', { title: 'Session 3: Found' })

    expect(edited).toMatchObject({ sessionNumber: 3, title: 'Found' })
  })

  it('takes the session number from the stored title when the note has none', () => {
    const [edited] = applySessionNotePatch([note('edited', { title: 'Session 6' })], 'edited', { overallSummary: 'New' })

    expect(edited).toMatchObject({ sessionNumber: 6, title: 'Session 6' })
  })

  it('leaves a note with no number anywhere unnumbered', () => {
    const [edited] = applySessionNotePatch([note('edited', { title: 'Loose' })], 'edited', { title: 'Still loose' })

    expect(edited).toMatchObject({ sessionNumber: null, title: 'Still loose' })
  })

  it('changes nothing for a note it does not hold', () => {
    const held = note('held', { sessionNumber: 1 })

    expect(applySessionNotePatch([held], 'missing', { title: 'Session 2' })).toEqual([held])
  })
})

describe('sessionNumberBackfills', () => {
  it('lists only the notes numbering gave a number they were stored without', () => {
    const stored = [note('kept', { sessionNumber: 1 }), note('gained'), note('still-loose')]
    const numbered = [
      stored[0],
      note('gained', { sessionNumber: 2 }),
      stored[2],
      note('unknown', { sessionNumber: 3 }),
    ]

    expect(sessionNumberBackfills(stored, numbered).map((entry) => entry.id)).toEqual(['gained'])
  })
})

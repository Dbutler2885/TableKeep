import { describe, expect, it } from 'vitest'
import type { SessionNote } from '../../types/app'
import { sortSessionNotes } from './sessionNoteSort'

const note = (id: string, sessionNumber: number | null, title: string, updatedAt: number): SessionNote =>
  ({ id, sessionNumber, title, updatedAt, createdAt: updatedAt }) as unknown as SessionNote

describe('sortSessionNotes', () => {
  it('puts the highest session number first, however recently the others were edited', () => {
    const legacy = Array.from({ length: 16 }, (_, index) => note(`legacy-${index + 1}`, index + 1, '', 2_000 + index))
    const recorded = note('recorded', 17, 'Session 17', 1_000)

    expect(sortSessionNotes([...legacy, recorded]).map((entry) => entry.id).slice(0, 3)).toEqual([
      'recorded',
      'legacy-16',
      'legacy-15',
    ])
  })

  it('reads the number from the title of a note saved without one', () => {
    const sorted = sortSessionNotes([note('numbered', 16, '', 1_000), note('titled', null, 'Session 17: The Wyrm Wakes', 1_000)])

    expect(sorted.map((entry) => entry.id)).toEqual(['titled', 'numbered'])
  })
})

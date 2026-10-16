import { describe, expect, it } from 'vitest'
import type { SessionNote } from '../../types/app'
import { sortSessionNotes, timestampToMillis } from './sessionNoteSort'

type NoteFields = { sessionNumber?: number | null; title?: string; createdAt?: unknown; updatedAt?: unknown }

const note = (id: string, { sessionNumber = null, title = '', createdAt = null, updatedAt = createdAt }: NoteFields): SessionNote =>
  ({ id, sessionNumber, title, createdAt, updatedAt }) as unknown as SessionNote

const ids = (notes: SessionNote[]) => notes.map((entry) => entry.id)

describe('sortSessionNotes', () => {
  it('puts the most recently generated note first, whatever its session number', () => {
    const legacy = Array.from({ length: 17 }, (_, index) =>
      note(`legacy-${index + 1}`, { sessionNumber: index + 1, createdAt: 1_000 + index }),
    )
    const recorded = note('recorded', { sessionNumber: 1, title: 'Session 1', createdAt: 5_000 })

    expect(ids(sortSessionNotes([...legacy, recorded])).slice(0, 3)).toEqual(['recorded', 'legacy-17', 'legacy-16'])
  })

  it('reads Firestore timestamps', () => {
    const timestamp = (millis: number) => ({ toMillis: () => millis })
    const sorted = sortSessionNotes([
      note('older', { sessionNumber: 17, createdAt: timestamp(1_000) }),
      note('newer', { sessionNumber: 1, createdAt: timestamp(2_000) }),
    ])

    expect(ids(sorted)).toEqual(['newer', 'older'])
  })

  it('does not move a note that was edited after a newer one was generated', () => {
    const sorted = sortSessionNotes([
      note('edited', { sessionNumber: 16, createdAt: 1_000, updatedAt: 9_000 }),
      note('newer', { sessionNumber: 17, createdAt: 2_000 }),
    ])

    expect(ids(sorted)).toEqual(['newer', 'edited'])
  })

  it('breaks a tie in date by session number, read from the title of a note saved without one', () => {
    const sorted = sortSessionNotes([
      note('numbered', { sessionNumber: 16, createdAt: 1_000 }),
      note('titled', { title: 'Session 17: The Wyrm Wakes', createdAt: 1_000 }),
    ])

    expect(ids(sorted)).toEqual(['titled', 'numbered'])
  })

  it('falls back to the title when date and session number are both the same', () => {
    const sorted = sortSessionNotes([
      note('session-2', { title: 'Session 2', createdAt: 1_000 }),
      note('session-10', { title: 'Session 10', createdAt: 1_000 }),
      note('loose-a', { title: 'A loose note', createdAt: 500 }),
      note('loose-b', { title: 'B loose note', createdAt: 500 }),
    ])

    expect(ids(sorted)).toEqual(['session-10', 'session-2', 'loose-b', 'loose-a'])
  })

  it('puts a note with no date below every dated note', () => {
    const sorted = sortSessionNotes([
      note('undated', { sessionNumber: 20 }),
      note('dated', { sessionNumber: 1, createdAt: 1_000 }),
    ])

    expect(ids(sorted)).toEqual(['dated', 'undated'])
  })
})

describe('timestampToMillis', () => {
  it('reads every form a stored or local date takes', () => {
    expect(timestampToMillis(1_500)).toBe(1_500)
    expect(timestampToMillis(new Date(2_000))).toBe(2_000)
    expect(timestampToMillis({ toMillis: () => 3_000 })).toBe(3_000)
    expect(timestampToMillis({ seconds: 4, nanoseconds: 0 })).toBe(4_000)
  })

  it('reads anything that is not a date as no date at all', () => {
    expect(timestampToMillis(null)).toBe(0)
    expect(timestampToMillis(Number.NaN)).toBe(0)
    expect(timestampToMillis('2026-10-16')).toBe(0)
    expect(timestampToMillis({})).toBe(0)
  })
})

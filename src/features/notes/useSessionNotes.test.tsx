// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { SessionNote } from '../../types/app'

type StoredDoc = { id: string; data: () => Record<string, unknown> }
type Snapshot = { docs: StoredDoc[] }

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }

const mocks = vi.hoisted(() => ({
  emit: null as ((snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => void) | null,
  fail: null as ((error: unknown) => void) | null,
  subscribedTo: [] as string[],
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
  onSnapshot: (
    ref: { path: string },
    onNext: (snap: Snapshot) => void,
    onError: (error: unknown) => void,
  ) => {
    mocks.subscribedTo.push(ref.path)
    mocks.emit = onNext
    mocks.fail = onError
    return () => {
      mocks.emit = null
      mocks.fail = null
    }
  },
  serverTimestamp: () => SERVER_TIMESTAMP,
  setDoc: mocks.setDoc,
}))

const { useSessionNotes } = await import('./useSessionNotes')

const NOTES_PATH = 'groups/group-1/campaigns/campaign-1/sessionSummaries'
const docPath = (id: string) => ({ path: `${NOTES_PATH}/${id}` })

const stored = (id: string, fields: Record<string, unknown>): StoredDoc => ({ id, data: () => fields })

const draft = (id: string, fields: Partial<SessionNote> = {}): SessionNote => ({
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

function renderNotes(docs: StoredDoc[], campaignId = 'campaign-1') {
  const hook = renderHook(() => useSessionNotes(campaignId, true, 'group-1'))
  act(() => mocks.emit?.({ docs }))
  return hook
}

const ids = (notes: SessionNote[]) => notes.map((note) => note.id)
const flushRejections = () => act(async () => { await Promise.resolve() })

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.emit = null
  mocks.fail = null
  mocks.subscribedTo = []
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  consoleError.mockRestore()
})

describe('useSessionNotes subscription', () => {
  it('does not subscribe while disabled, and reports no notes', () => {
    const { result } = renderHook(() => useSessionNotes('campaign-1', false, 'group-1'))

    expect(mocks.subscribedTo).toEqual([])
    expect(result.current.notes).toEqual([])
    expect(result.current.notesLoading).toBe(false)
  })

  it('does not subscribe without a campaign', () => {
    const { result } = renderHook(() => useSessionNotes('', true, 'group-1'))

    expect(mocks.subscribedTo).toEqual([])
    expect(result.current.notesLoading).toBe(false)
  })

  it('loads until the first snapshot arrives, then lists the campaign notes', () => {
    const { result } = renderHook(() => useSessionNotes('campaign-1', true, 'group-1'))

    expect(mocks.subscribedTo).toEqual([NOTES_PATH])
    expect(result.current.notesLoading).toBe(true)

    act(() => mocks.emit?.({ docs: [stored('one', { sessionNumber: 1, title: 'Session 1: Arrival' })] }))

    expect(result.current.notesLoading).toBe(false)
    expect(result.current.notes).toHaveLength(1)
    expect(result.current.notes[0]).toMatchObject({ id: 'one', sessionNumber: 1, title: 'Arrival' })
  })

  it('clears the notes and stops listening when it is disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useSessionNotes('campaign-1', enabled, 'group-1'),
      { initialProps: { enabled: true } },
    )
    act(() => mocks.emit?.({ docs: [stored('one', { sessionNumber: 1 })] }))
    expect(result.current.notes).toHaveLength(1)

    rerender({ enabled: false })

    expect(mocks.emit).toBeNull()
    expect(result.current.notes).toEqual([])
    expect(result.current.notesLoading).toBe(false)
  })

  it('fills in the fields a stored note leaves out', () => {
    const { result } = renderNotes([stored('bare', { sessionNumber: 3 })])

    expect(result.current.notes[0]).toEqual({
      generatedSnapshot: null,
      hasHumanEdits: false,
      editedAt: null,
      editedBy: null,
      id: 'bare',
      title: '',
      sessionNumber: 3,
      sourceType: 'manual',
      createdAt: null,
      updatedAt: null,
      summaryMarkdown: '',
      overallSummary: '',
      scenes: [],
      npcMentions: [],
      cliffhangers: [],
      calendar: [],
    })
  })

  it('reads the session number out of a title when the field is missing', () => {
    const { result } = renderNotes([stored('titled', { title: 'Session 7 - Into the Mire' })])

    expect(result.current.notes[0]).toMatchObject({ sessionNumber: 7, title: 'Into the Mire' })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('numbers stored notes that have no session number, oldest first, and writes the numbers back', () => {
    const { result } = renderNotes([
      stored('newer', { title: 'The Return', createdAt: 3_000 }),
      stored('numbered', { sessionNumber: 1, createdAt: 1_000 }),
      stored('older', { title: '', createdAt: 2_000 }),
    ])

    const byId = Object.fromEntries(result.current.notes.map((note) => [note.id, note.sessionNumber]))
    expect(byId).toEqual({ numbered: 1, older: 2, newer: 3 })
    expect(mocks.setDoc).toHaveBeenCalledTimes(2)
    expect(mocks.setDoc).toHaveBeenCalledWith(docPath('newer'), { sessionNumber: 3, title: 'The Return' }, { merge: true })
    expect(mocks.setDoc).toHaveBeenCalledWith(docPath('older'), { sessionNumber: 2, title: '' }, { merge: true })
  })

  it('logs a session number it could not write back', async () => {
    const failure = new Error('denied')
    mocks.setDoc.mockRejectedValueOnce(failure)

    renderNotes([stored('loose', { title: 'Loose' })])
    await flushRejections()

    expect(consoleError).toHaveBeenCalledWith('Failed to backfill session number', { noteId: 'loose', error: failure })
  })

  it('stops loading and logs when the subscription fails', () => {
    const { result } = renderHook(() => useSessionNotes('campaign-1', true, 'group-1'))
    const failure = new Error('offline')

    act(() => mocks.fail?.(failure))

    expect(result.current.notesLoading).toBe(false)
    expect(consoleError).toHaveBeenCalledWith('useSessionNotes snapshot error', failure)
  })
})

describe('useSessionNotes addNote', () => {
  it('numbers a new note after the highest existing session and saves it with server stamps', () => {
    const { result } = renderNotes([
      stored('one', { sessionNumber: 1, createdAt: 1_000 }),
      stored('four', { sessionNumber: 4, createdAt: 2_000 }),
    ])

    act(() => result.current.addNote(draft('made', { title: 'Session 5: The Wyrm Wakes' })))

    const made = result.current.notes.find((note) => note.id === 'made')
    expect(made).toMatchObject({ sessionNumber: 5, title: 'The Wyrm Wakes' })
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const [ref, payload, options] = mocks.setDoc.mock.calls[0]
    expect(ref).toEqual(docPath('made'))
    expect(payload).toMatchObject({ sessionNumber: 5, title: 'The Wyrm Wakes', createdAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP })
    expect(payload).not.toHaveProperty('id')
    expect(options).toBeUndefined()
  })

  it('keeps the session number a new note already carries', () => {
    const { result } = renderNotes([stored('four', { sessionNumber: 4 })])

    act(() => result.current.addNote(draft('made', { sessionNumber: 9, title: 'Session 9' })))

    expect(result.current.notes.find((note) => note.id === 'made')).toMatchObject({ sessionNumber: 9, title: '' })
  })

  it('adds a note locally without saving it when there is no campaign', () => {
    const { result } = renderHook(() => useSessionNotes('', true, 'group-1'))

    act(() => result.current.addNote(draft('made', { title: 'Scratch' })))

    expect(result.current.notes).toHaveLength(1)
    expect(result.current.notes[0]).toMatchObject({ id: 'made', sessionNumber: 1, title: 'Scratch' })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('logs a note it could not create', async () => {
    const failure = new Error('denied')
    const { result } = renderNotes([])
    mocks.setDoc.mockRejectedValueOnce(failure)

    act(() => result.current.addNote(draft('made')))
    await flushRejections()

    expect(consoleError).toHaveBeenCalledWith('Failed to create session note', { noteId: 'made', error: failure })
  })
})

describe('useSessionNotes updateNote', () => {
  it('applies an edit at once and saves the whole note half a second after the last edit', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5, overallSummary: 'Old', createdAt: 1_000 })])

    act(() => result.current.updateNote('note', { overallSummary: 'First' }))
    act(() => vi.advanceTimersByTime(300))
    act(() => result.current.updateNote('note', { overallSummary: 'Second' }))
    act(() => vi.advanceTimersByTime(499))

    expect(result.current.notes[0].overallSummary).toBe('Second')
    expect(mocks.setDoc).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const [ref, payload, options] = mocks.setDoc.mock.calls[0]
    expect(ref).toEqual(docPath('note'))
    expect(payload).toMatchObject({ overallSummary: 'Second', sessionNumber: 5, createdAt: 1_000, updatedAt: SERVER_TIMESTAMP })
    expect(payload).not.toHaveProperty('id')
    expect(options).toEqual({ merge: true })
  })

  it('strips the default session label from an edited title', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5, title: 'Old' })])

    act(() => result.current.updateNote('note', { title: 'Session 5: Fresh' }))

    expect(result.current.notes[0]).toMatchObject({ title: 'Fresh', sessionNumber: 5 })
  })

  it('keeps the stored title when an edit does not change it', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5, title: 'Kept' })])

    act(() => result.current.updateNote('note', { overallSummary: 'Edited' }))

    expect(result.current.notes[0]).toMatchObject({ title: 'Kept', sessionNumber: 5, overallSummary: 'Edited' })
  })

  it('takes a session number the edit sets', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5, title: 'Session 8: Moved' })])

    act(() => result.current.updateNote('note', { sessionNumber: 8, title: 'Session 8: Moved' }))

    expect(result.current.notes[0]).toMatchObject({ title: 'Moved', sessionNumber: 8 })
  })

  it('keeps the newest local edit when a snapshot arrives before it is saved', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5, overallSummary: 'Old' })])

    act(() => result.current.updateNote('note', { overallSummary: 'Local' }))
    act(() => mocks.emit?.({ docs: [stored('note', { sessionNumber: 5, overallSummary: 'Server' })] }))

    expect(result.current.notes[0].overallSummary).toBe('Local')

    act(() => vi.advanceTimersByTime(500))
    act(() => mocks.emit?.({ docs: [stored('note', { sessionNumber: 5, overallSummary: 'Server' })] }))

    expect(result.current.notes[0].overallSummary).toBe('Server')
  })

  it('takes the snapshot for a note with a pending save that it no longer holds locally', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5, overallSummary: 'Old' })])

    act(() => result.current.updateNote('ghost', { overallSummary: 'Lost' }))
    act(() => mocks.emit?.({
      docs: [stored('note', { sessionNumber: 5 }), stored('ghost', { sessionNumber: 6, overallSummary: 'Server' })],
    }))

    expect(result.current.notes.find((note) => note.id === 'ghost')?.overallSummary).toBe('Server')
  })

  it('does not save an edit to a note that is gone when the save comes due', () => {
    const { result } = renderNotes([stored('note', { sessionNumber: 5 })])

    act(() => result.current.updateNote('note', { overallSummary: 'Edited' }))
    act(() => mocks.emit?.({ docs: [] }))
    act(() => vi.advanceTimersByTime(500))

    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('edits locally without saving when there is no campaign', () => {
    const { result } = renderHook(() => useSessionNotes('', true, 'group-1'))
    act(() => result.current.addNote(draft('made', { title: 'Scratch' })))

    act(() => result.current.updateNote('made', { overallSummary: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.notes[0].overallSummary).toBe('Edited')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('logs an edit it could not save', async () => {
    const failure = new Error('denied')
    const { result } = renderNotes([stored('note', { sessionNumber: 5 })])
    mocks.setDoc.mockRejectedValueOnce(failure)

    act(() => result.current.updateNote('note', { overallSummary: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))
    await flushRejections()

    expect(consoleError).toHaveBeenCalledWith('Failed to update session note', { noteId: 'note', error: failure })
  })

  it('drops pending saves when it unmounts', () => {
    const { result, unmount } = renderNotes([stored('note', { sessionNumber: 5 })])

    act(() => result.current.updateNote('note', { overallSummary: 'Edited' }))
    unmount()
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('useSessionNotes deleteNote', () => {
  it('removes the note, deletes it from the campaign, and drops its pending save', () => {
    const { result } = renderNotes([stored('keep', { sessionNumber: 1 }), stored('gone', { sessionNumber: 2 })])

    act(() => result.current.updateNote('gone', { overallSummary: 'Edited' }))
    act(() => result.current.deleteNote('gone'))
    act(() => vi.advanceTimersByTime(500))

    expect(ids(result.current.notes)).toEqual(['keep'])
    expect(mocks.deleteDoc).toHaveBeenCalledWith(docPath('gone'))
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('deletes a note that has no pending save', () => {
    const { result } = renderNotes([stored('gone', { sessionNumber: 2 })])

    act(() => result.current.deleteNote('gone'))

    expect(result.current.notes).toEqual([])
    expect(mocks.deleteDoc).toHaveBeenCalledWith(docPath('gone'))
  })

  it('does nothing without a campaign', () => {
    const { result } = renderHook(() => useSessionNotes('', true, 'group-1'))
    act(() => result.current.addNote(draft('made')))

    act(() => result.current.deleteNote('made'))

    expect(ids(result.current.notes)).toEqual(['made'])
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })

  it('logs a note it could not delete', async () => {
    const failure = new Error('denied')
    mocks.deleteDoc.mockRejectedValueOnce(failure)
    const { result } = renderNotes([stored('gone', { sessionNumber: 2 })])

    act(() => result.current.deleteNote('gone'))
    await flushRejections()

    expect(consoleError).toHaveBeenCalledWith('Failed to delete session note', { noteId: 'gone', error: failure })
  })
})

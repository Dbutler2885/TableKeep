// @vitest-environment jsdom
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionNote } from '../../types/app'
import { NotesTab } from './NotesTab'

const mocks = vi.hoisted(() => ({
  notes: [] as SessionNote[],
  updateNote: vi.fn(),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' }, functions: { name: 'functions-stub' } }))
vi.mock('firebase/firestore', () => ({ onSnapshot: vi.fn(() => () => {}) }))
vi.mock('../campaign/firestorePaths', () => ({ campaignCollectionRef: vi.fn() }))
vi.mock('./useSessionNotes', () => ({
  useSessionNotes: () => ({
    notes: mocks.notes,
    notesLoading: false,
    addNote: vi.fn(),
    updateNote: mocks.updateNote,
    deleteNote: vi.fn(),
  }),
}))
vi.mock('../sessions/useRecordedSessions', () => ({ useRecordedSessions: () => ({ sessions: [] }) }))
vi.mock('../sessions/RecordedSessionDetail', () => ({ RecordedSessionDetail: () => null }))

const note = (id: string, title: string): SessionNote => ({
  id,
  title,
  sessionNumber: null,
  sourceType: 'api',
  createdAt: 1_000,
  updatedAt: 1_000,
  summaryMarkdown: '',
  overallSummary: `Summary of ${title}`,
  scenes: [{ name: '', summary: `Scene of ${title}`, details: [`Detail of ${title}`] }],
  npcMentions: [],
  cliffhangers: [],
  calendar: [],
  generatedSnapshot: null,
  hasHumanEdits: false,
  editedAt: null,
  editedBy: null,
})

const noteA = note('note-a', 'Note A')
const noteB = note('note-b', 'Note B')

const click = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const titleEditor = () => screen.queryByPlaceholderText('Optional custom session title') as HTMLInputElement | null

const desktopWidth = window.innerWidth

beforeEach(() => {
  mocks.updateNote.mockClear()
})

afterEach(() => {
  cleanup()
  window.innerWidth = desktopWidth
})

// These pin how the tab itself moves between notes, which is not the same as `SessionNoteDetail` being given a
// different note: on both paths below the tab removes the detail first, so no editing state survives either way.
describe('NotesTab note lifecycle', () => {
  it('shows no detail for a moment when the selected note is deleted elsewhere during an edit, then the next note closed', () => {
    mocks.notes = [noteA, noteB]
    const commits: { heading: string | null; editor: string | null; sceneOpen: boolean }[] = []
    const tab = () => (
      <Profiler
        id="tab"
        onRender={() => commits.push({
          heading: document.querySelector('h2.session-note-title')?.textContent ?? null,
          editor: titleEditor()?.value ?? null,
          sceneOpen: document.querySelector('.session-scene-card ul') !== null,
        })}
      >
        <NotesTab campaignId="campaign-1" groupId="group-1" role="gm" />
      </Profiler>
    )
    const { rerender } = render(tab())

    click('Scene 1')
    click('Edit title')
    fireEvent.change(titleEditor()!, { target: { value: 'Draft for A' } })
    commits.length = 0
    mocks.notes = [noteB]
    rerender(tab())

    expect(commits[0]).toEqual({ heading: null, editor: null, sceneOpen: false })
    expect(commits.filter((commit) => commit.heading === 'Note B' && commit.editor !== null)).toEqual([])
    expect(screen.getByRole('heading', { level: 2, name: 'Note B' })).toBeTruthy()
    expect(screen.queryByText('Detail of Note B')).toBeNull()
    expect(mocks.updateNote).not.toHaveBeenCalled()
  })

  it('on a phone, going back to the list closes the open editor and scenes before the next note is chosen', () => {
    window.innerWidth = 390
    mocks.notes = [noteA, noteB]
    const { container } = render(<NotesTab campaignId="campaign-1" groupId="group-1" role="gm" />)

    click('Note A')
    click('Scene 1')
    click('Edit title')
    fireEvent.change(titleEditor()!, { target: { value: 'Draft for A' } })
    fireEvent.click(container.querySelector('.monster-mobile-back')!)
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
    expect(container.querySelector('.session-note-detail')).toBeNull()

    click('Note B')

    expect(screen.getByRole('heading', { level: 2, name: 'Note B' })).toBeTruthy()
    expect(titleEditor()).toBeNull()
    expect(screen.queryByText('Detail of Note B')).toBeNull()
    expect(mocks.updateNote).not.toHaveBeenCalled()
  })
})

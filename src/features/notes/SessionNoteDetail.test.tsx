// @vitest-environment jsdom
import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Role, SessionNote, SessionNoteGeneratedSnapshot } from '../../types/app'
import { SessionNoteDetail } from './SessionNoteDetail'

const note = (fields: Partial<SessionNote> = {}): SessionNote => ({
  id: 'note-1',
  title: '',
  sessionNumber: 4,
  sourceType: 'api',
  createdAt: 1_000,
  updatedAt: 1_000,
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

const fullNote = (fields: Partial<SessionNote> = {}) => note({
  title: 'The Wyrm Wakes',
  overallSummary: 'The party arrived.\n\nThe wyrm stirred.',
  scenes: [
    { name: 'The Gate', summary: 'They knocked.', details: ['A guard answered.', 'The guard lied.'] },
    { name: '', summary: 'They slept.', details: [] },
  ],
  cliffhangers: ['Who sent the letter?', 'Where is the key?'],
  npcMentions: [{ npcKey: 'mira', name: 'Mira', title: 'Guard', action: 'new', facts: ['Lies'], linkedNpcId: null }],
  calendar: [{ key: 'day-1', action: 'new', label: 'Day 1', dayComplete: true, entries: ['Arrived'] }],
  ...fields,
})

function renderDetail(sessionNote: SessionNote, role: Role | null = 'gm') {
  const onUpdate = vi.fn()
  const view = render(<SessionNoteDetail note={sessionNote} role={role} onUpdate={onUpdate} />)
  return { ...view, onUpdate }
}

const section = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement
const click = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } })

afterEach(cleanup)

describe('SessionNoteDetail reading', () => {
  it('shows the title, session number, summary paragraphs, scenes and cliffhangers', () => {
    renderDetail(fullNote(), 'player')

    expect(screen.getByRole('heading', { level: 2, name: 'The Wyrm Wakes' })).toBeTruthy()
    expect(screen.getByText('Session 4')).toBeTruthy()
    expect(within(section('Summary')).getAllByText(/./, { selector: 'p' }).map((p) => p.textContent))
      .toEqual(['The party arrived.', 'The wyrm stirred.'])
    expect(screen.getByRole('button', { name: 'The Gate' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scene 2' })).toBeTruthy()
    expect(screen.getByText('They knocked.')).toBeTruthy()
    expect(within(section('Cliffhangers')).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Who sent the letter?', 'Where is the key?'])
  })

  it('leaves out every section the note has nothing for', () => {
    renderDetail(note({ sessionNumber: null, title: 'Loose notes' }), 'player')

    expect(screen.getByRole('heading', { level: 2, name: 'Loose notes' })).toBeTruthy()
    expect(screen.queryByText(/^Session \d/)).toBeNull()
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([])
  })

  it('names an untitled session once, in its heading', () => {
    renderDetail(note({ title: '', sessionNumber: 4 }), 'player')

    expect(screen.getByRole('heading', { level: 2, name: 'Session 4' })).toBeTruthy()
    expect(screen.getAllByText('Session 4')).toHaveLength(1)
  })

  it('shows the session number of a note saved without one, read from its title', () => {
    renderDetail(note({ title: 'Session 7: Into the Mire', sessionNumber: null }), 'player')

    expect(screen.getByRole('heading', { level: 2, name: 'Into the Mire' })).toBeTruthy()
    expect(screen.getByText('Session 7')).toBeTruthy()
  })

  it('falls back to the markdown summary only when there is no overall summary', () => {
    const { rerender } = renderDetail(note({ summaryMarkdown: 'Markdown line one\nMarkdown line two' }), 'player')

    expect(within(section('Summary')).getAllByText(/Markdown/).map((p) => p.textContent))
      .toEqual(['Markdown line one', 'Markdown line two'])

    rerender(<SessionNoteDetail note={note({ summaryMarkdown: 'Markdown', overallSummary: 'Overall' })} role="player" onUpdate={vi.fn()} />)

    expect(screen.getAllByRole('heading', { name: 'Summary' })).toHaveLength(1)
    expect(screen.getByText('Overall')).toBeTruthy()
    expect(screen.queryByText('Markdown')).toBeNull()
  })

  it('opens and closes a scene to show its details', () => {
    renderDetail(fullNote(), 'player')

    expect(screen.queryByText('A guard answered.')).toBeNull()

    click('The Gate')
    expect(screen.getByText('A guard answered.')).toBeTruthy()
    expect(screen.getByText('The guard lied.')).toBeTruthy()

    click('Scene 2')
    expect(screen.getByText('They slept.').parentElement?.querySelector('ul')).toBeNull()

    click('The Gate')
    expect(screen.queryByText('A guard answered.')).toBeNull()
  })

  it('offers no editing to a player or a viewer with no role', () => {
    renderDetail(fullNote(), 'player')
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    cleanup()

    renderDetail(fullNote(), null)
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
  })

  it('offers the GM an edit button for every section', () => {
    renderDetail(fullNote())

    expect(screen.getAllByRole('button', { name: /^Edit / }).map((button) => button.getAttribute('aria-label')))
      .toEqual(['Edit title', 'Edit summary', 'Edit The Gate', 'Edit scene 2', 'Edit cliffhangers'])
  })
})

describe('SessionNoteDetail editing', () => {
  it('saves an edited title with the session label stripped, and marks the note as edited by the GM', () => {
    const original = fullNote()
    const { onUpdate } = renderDetail(original)

    click('Edit title')
    const input = screen.getByPlaceholderText('Optional custom session title') as HTMLInputElement
    expect(input.value).toBe('The Wyrm Wakes')
    expect(document.activeElement).toBe(input)
    type(input, 'Session 4: The Wyrm Sleeps')
    click('Save edit')

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [noteId, patch] = onUpdate.mock.calls[0]
    expect(noteId).toBe('note-1')
    expect(patch).toMatchObject({ title: 'The Wyrm Sleeps', hasHumanEdits: true, editedBy: 'gm' })
    expect(patch.editedAt).toBeInstanceOf(Date)
    expect(patch.generatedSnapshot).toEqual({
      title: original.title,
      summaryMarkdown: original.summaryMarkdown,
      overallSummary: original.overallSummary,
      scenes: original.scenes,
      npcMentions: original.npcMentions,
      cliffhangers: original.cliffhangers,
      calendar: original.calendar,
    })
    expect(patch.generatedSnapshot.scenes[0].details).not.toBe(original.scenes[0].details)
    expect(screen.queryByPlaceholderText('Optional custom session title')).toBeNull()
  })

  it('keeps the snapshot of the generated note once one exists', () => {
    const generatedSnapshot = { title: 'Generated' } as SessionNoteGeneratedSnapshot
    const { onUpdate } = renderDetail(fullNote({ generatedSnapshot }))

    click('Edit title')
    click('Save edit')

    expect(onUpdate.mock.calls[0][1].generatedSnapshot).toBe(generatedSnapshot)
  })

  it('discards an edit that is cancelled', () => {
    const { onUpdate } = renderDetail(fullNote())

    click('Edit title')
    type(screen.getByPlaceholderText('Optional custom session title'), 'Changed')
    click('Cancel edit')

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'The Wyrm Wakes' })).toBeTruthy()
  })

  it('saves an edited overall summary', () => {
    const { onUpdate } = renderDetail(fullNote())

    click('Edit summary')
    const textarea = within(section('Summary')).getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('The party arrived.\n\nThe wyrm stirred.')
    expect(textarea.rows).toBe(4)
    type(textarea, 'One\nTwo\nThree\nFour\nFive')
    expect(textarea.rows).toBe(5)
    click('Save edit')

    expect(onUpdate.mock.calls[0][1]).toMatchObject({ overallSummary: 'One\nTwo\nThree\nFour\nFive' })
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('summaryMarkdown')
  })

  it('saves an edited markdown summary', () => {
    const { onUpdate } = renderDetail(note({ summaryMarkdown: 'Markdown' }))

    click('Edit summary')
    const textarea = within(section('Summary')).getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Markdown')
    type(textarea, 'Rewritten')
    click('Save edit')

    expect(onUpdate.mock.calls[0][1]).toMatchObject({ summaryMarkdown: 'Rewritten' })
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('overallSummary')
  })

  it('edits only a collapsed scene summary, and saves it without touching the other scenes', () => {
    const original = fullNote()
    const { onUpdate } = renderDetail(original)

    click('Edit The Gate')
    const editors = within(section('Scenes')).getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(editors.map((editor) => editor.value)).toEqual(['They knocked.'])
    expect(editors[0].rows).toBe(3)
    type(editors[0], 'They knocked twice.')
    click('Save edit')

    const scenes = onUpdate.mock.calls[0][1].scenes
    expect(scenes[0]).toEqual({ name: 'The Gate', summary: 'They knocked twice.', details: ['A guard answered.', 'The guard lied.'] })
    expect(scenes[1]).toBe(original.scenes[1])
  })

  it('edits the details of an open scene', () => {
    const { onUpdate } = renderDetail(fullNote())

    click('The Gate')
    click('Edit The Gate')
    const editors = within(section('Scenes')).getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(editors.map((editor) => editor.value)).toEqual(['They knocked.', 'A guard answered.', 'The guard lied.'])
    expect(editors[1].rows).toBe(2)
    type(editors[2], 'The guard told the truth.')
    click('Save edit')

    expect(onUpdate.mock.calls[0][1].scenes[0].details).toEqual(['A guard answered.', 'The guard told the truth.'])
  })

  it('shows no detail editors for an open scene without details', () => {
    renderDetail(fullNote())

    click('Scene 2')
    click('Edit scene 2')

    expect((within(section('Scenes')).getAllByRole('textbox') as HTMLTextAreaElement[]).map((editor) => editor.value))
      .toEqual(['They slept.'])
  })

  it('saves edited cliffhangers, focusing the first', () => {
    const { onUpdate } = renderDetail(fullNote())

    click('Edit cliffhangers')
    const editors = within(section('Cliffhangers')).getAllByRole('textbox') as HTMLTextAreaElement[]
    expect(editors.map((editor) => editor.value)).toEqual(['Who sent the letter?', 'Where is the key?'])
    expect(document.activeElement).toBe(editors[0])
    type(editors[1], 'Where is the second key?')
    click('Save edit')

    expect(onUpdate.mock.calls[0][1]).toMatchObject({ cliffhangers: ['Who sent the letter?', 'Where is the second key?'] })
  })

  it('edits one section at a time', () => {
    renderDetail(fullNote())

    click('Edit title')
    click('Edit cliffhangers')

    expect(screen.queryByPlaceholderText('Optional custom session title')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Save edit' })).toHaveLength(1)
  })

  it('closes an open editor when a different note is shown, but keeps scenes open', () => {
    const { rerender, onUpdate } = renderDetail(fullNote())

    click('The Gate')
    click('Edit title')
    rerender(<SessionNoteDetail note={fullNote({ id: 'note-2', title: 'Another' })} role="gm" onUpdate={onUpdate} />)

    expect(screen.queryByPlaceholderText('Optional custom session title')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Another' })).toBeTruthy()
    expect(screen.getByText('A guard answered.')).toBeTruthy()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('keeps an open editor and its exact draft when the same note is updated, and saves against the updated note', () => {
    const { rerender, onUpdate } = renderDetail(fullNote())

    click('Edit title')
    type(screen.getByPlaceholderText('Optional custom session title'), 'Unsaved draft title')
    const updated = fullNote({ overallSummary: 'Updated elsewhere', cliffhangers: ['Changed elsewhere'] })
    rerender(<SessionNoteDetail note={updated} role="gm" onUpdate={onUpdate} />)

    const input = screen.getByPlaceholderText('Optional custom session title') as HTMLInputElement
    expect(input.value).toBe('Unsaved draft title')

    click('Save edit')
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [noteId, patch] = onUpdate.mock.calls[0]
    expect(noteId).toBe('note-1')
    expect(patch.title).toBe('Unsaved draft title')
    expect(patch.generatedSnapshot).toMatchObject({ overallSummary: 'Updated elsewhere', cliffhangers: ['Changed elsewhere'] })
  })
})

describe('SessionNoteDetail switching notes', () => {
  // Two notes of the same shape, so every section that has an editor on the first also has one on the second.
  const noteA = (fields: Partial<SessionNote> = {}) => fullNote({ id: 'note-a', title: 'Note A', ...fields })
  const noteB = (fields: Partial<SessionNote> = {}) => fullNote({
    id: 'note-b',
    title: 'Note B',
    overallSummary: 'B arrived.',
    scenes: [
      { name: 'The Bridge', summary: 'They crossed.', details: ['The rope held.'] },
      { name: '', summary: 'They rested.', details: [] },
    ],
    cliffhangers: ['What waits across?'],
    ...fields,
  })
  const detail = (sessionNote: SessionNote, onUpdate: ReturnType<typeof vi.fn>) => (
    <SessionNoteDetail note={sessionNote} role="gm" onUpdate={onUpdate} />
  )
  const textboxValues = () => (screen.queryAllByRole('textbox') as (HTMLInputElement | HTMLTextAreaElement)[])
    .map((box) => box.value)

  // Every variant of `EditingSection`; each begins an edit on note A and leaves a draft no stored note holds.
  const sections: { name: string; a: SessionNote; b: SessionNote; edit: () => void }[] = [
    {
      name: 'the title',
      a: noteA(),
      b: noteB(),
      edit: () => {
        click('Edit title')
        type(screen.getByPlaceholderText('Optional custom session title'), 'Draft for A')
      },
    },
    {
      name: 'the overall summary',
      a: noteA(),
      b: noteB(),
      edit: () => {
        click('Edit summary')
        type(within(section('Summary')).getByRole('textbox'), 'Draft for A')
      },
    },
    {
      name: 'the fallback markdown summary',
      a: noteA({ overallSummary: '', summaryMarkdown: 'Markdown A' }),
      b: noteB({ overallSummary: '', summaryMarkdown: 'Markdown B' }),
      edit: () => {
        click('Edit summary')
        type(within(section('Summary')).getByRole('textbox'), 'Draft for A')
      },
    },
    {
      name: 'the details of an open scene',
      a: noteA(),
      b: noteB(),
      edit: () => {
        click('The Gate')
        click('Edit The Gate')
        type(within(section('Scenes')).getAllByRole('textbox')[2], 'Draft for A')
      },
    },
    {
      name: 'the cliffhangers',
      a: noteA(),
      b: noteB(),
      edit: () => {
        click('Edit cliffhangers')
        type(within(section('Cliffhangers')).getAllByRole('textbox')[0], 'Draft for A')
      },
    },
  ]

  it.each(sections)('abandons an edit to $name when a different note is shown', ({ a, b, edit }) => {
    const onUpdate = vi.fn()
    const { rerender } = render(detail(a, onUpdate))

    edit()
    expect(textboxValues()).toContain('Draft for A')
    rerender(detail(b, onUpdate))

    expect(screen.getByRole('heading', { level: 2, name: 'Note B' })).toBeTruthy()
    expect(screen.queryAllByRole('textbox')).toEqual([])
    expect(screen.queryByText('Draft for A')).toBeNull()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('does not bring back an abandoned edit when returning to its note', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(detail(noteA(), onUpdate))

    click('Edit title')
    type(screen.getByPlaceholderText('Optional custom session title'), 'Draft for A')
    rerender(detail(noteB(), onUpdate))
    rerender(detail(noteA(), onUpdate))

    expect(screen.getByRole('heading', { level: 2, name: 'Note A' })).toBeTruthy()
    click('Edit title')
    expect((screen.getByPlaceholderText('Optional custom session title') as HTMLInputElement).value).toBe('Note A')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('saves a fresh edit begun after a switch only to the note now shown', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(detail(noteA(), onUpdate))

    click('Edit title')
    type(screen.getByPlaceholderText('Optional custom session title'), 'Draft for A')
    rerender(detail(noteB(), onUpdate))

    click('Edit title')
    const input = screen.getByPlaceholderText('Optional custom session title') as HTMLInputElement
    expect(input.value).toBe('Note B')
    type(input, 'Draft for B')
    click('Save edit')

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [noteId, patch] = onUpdate.mock.calls[0]
    expect(noteId).toBe('note-b')
    expect(patch.title).toBe('Draft for B')
    expect(patch.generatedSnapshot).toMatchObject({ title: 'Note B', overallSummary: 'B arrived.', cliffhangers: ['What waits across?'] })
  })

  it('never commits the next note with the previous note\'s open editor', () => {
    const onUpdate = vi.fn()
    const commits: { heading: string | null; textboxes: string[] }[] = []
    // Profiler's onRender runs once per commit, after React has applied it to the DOM.
    const profiled = (sessionNote: SessionNote) => (
      <Profiler
        id="detail"
        onRender={() => commits.push({ heading: document.querySelector('h2')?.textContent ?? null, textboxes: textboxValues() })}
      >
        {detail(sessionNote, onUpdate)}
      </Profiler>
    )
    const { rerender } = render(profiled(noteA()))

    click('Edit title')
    type(screen.getByPlaceholderText('Optional custom session title'), 'Draft for A')
    commits.length = 0
    rerender(profiled(noteB()))

    expect(commits.length).toBeGreaterThan(0)
    expect(commits).toEqual(commits.map(() => ({ heading: 'Note B', textboxes: [] })))
  })
})

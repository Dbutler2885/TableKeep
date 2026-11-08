// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyHandout, type Handout, type HandoutKind } from './handoutModel'

vi.mock('./HandoutViewer', () => ({ HandoutViewer: () => <div data-testid="handout-content" /> }))
import { HandoutEditor } from './HandoutEditor'
import { HandoutDetail } from './HandoutPanels'
import { HandoutLibrary } from './HandoutLibrary'

const kinds: HandoutKind[] = ['text', 'image', 'pdf']
const original = (kind: HandoutKind): Handout => ({
  ...emptyHandout('letters', 'gm'), kind, title: 'Harbour clue', text: 'The original extract.',
  storagePath: kind === 'text' ? '' : 'groups/g/campaigns/c/handouts/h/original',
})
const folders = [{ id: 'letters', name: 'Letters', parentId: '' }]
afterEach(cleanup)

describe('optional handout descriptions', () => {
  it.each(kinds)('lets the GM add and clear a description on a %s handout', async (kind) => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const handout = original(kind)
    delete handout.description
    render(<HandoutEditor handout={handout} folders={folders} characters={[]} onSave={onSave} onClose={vi.fn()} />)
    const field = screen.getByLabelText('Description (optional)') as HTMLTextAreaElement
    expect(field.value).toBe('')
    expect(field.required).toBe(false)
    fireEvent.change(field, { target: { value: 'A faded clue recovered from the harbour office.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save handout' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind, description: 'A faded clue recovered from the harbour office.' }), null))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save handout' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save handout' }))
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind, description: '' }), null))
  })

  it.each(kinds)('shows a revealed %s description in details and both library views', (kind) => {
    const handout = { ...original(kind), visibility: 'all' as const, description: 'A faded clue recovered from the harbour office.' }
    const libraryProps = { folders, handouts: [handout], selectedId: handout.id, folderId: '', onSelect: vi.fn(), onFolder: vi.fn() }
    const details = <section aria-label="Handout details"><HandoutDetail handout={handout} folders={folders} isGm={false} onEdit={vi.fn()} onDelete={vi.fn()} /></section>
    const view = render(<><HandoutLibrary {...libraryProps} flat={false} />{details}</>)
    expect(within(screen.getByRole('region', { name: 'Handout details' })).getByText(handout.description)).toBeTruthy()
    expect(view.container.querySelector('.handout-row-description')?.textContent).toBe(handout.description)
    expect(screen.queryByRole('button', { name: 'Edit handout' })).toBeNull()
    view.rerender(<><HandoutLibrary {...libraryProps} flat />{details}</>)
    expect(view.container.querySelector('.handout-row-description')?.textContent).toBe(handout.description)
    expect(view.container.querySelector('.handout-row small')?.textContent).toBe('Letters')
  })

  it('keeps older handouts without a description readable without an empty description block', () => {
    const handout = original('text')
    delete handout.description
    const view = render(<HandoutDetail handout={handout} folders={folders} isGm onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('heading', { name: handout.title })).toBeTruthy()
    expect(view.container.querySelector('.handout-description')).toBeNull()
  })
})

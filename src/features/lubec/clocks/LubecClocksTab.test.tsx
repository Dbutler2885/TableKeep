// @vitest-environment jsdom
/**
 * The Clocks tab, over `firebase/firestore` stubbed with documents kept by
 * path and every listener told of each write, as Firestore's own snapshots
 * are. A clock is made through the form, its pieces filled and emptied one at
 * a time in any order, shows its result when full and once drained, is edited
 * through the same form and deleted from it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

type Fields = Record<string, unknown>
type Ref = { path: string }

const mocks = vi.hoisted(() => ({
  database: {} as Record<string, Record<string, unknown>>,
  listeners: [] as { path: string; next: (snap: unknown) => void }[],
  refuse: null as null | string,
  nextId: 0,
}))

const isSentinel = (value: unknown, kind: string) => typeof value === 'object' && value !== null && (value as Fields).sentinel === kind

const listOf = (value: unknown) => (Array.isArray(value) ? value : [])

// One field as the server writes it: a stamp for a timestamp, a union or removal for an array change.
function appliedField(was: unknown, value: unknown): unknown {
  if (isSentinel(value, 'serverTimestamp')) return { toMillis: () => ++mocks.nextId }
  if (isSentinel(value, 'arrayUnion')) return [...new Set([...listOf(was), (value as Fields).item])]
  if (isSentinel(value, 'arrayRemove')) return listOf(was).filter((item) => item !== (value as Fields).item)
  return value
}

const applied = (was: Fields, payload: Fields): Fields =>
  ({ ...was, ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, appliedField(was[key], value)])) })

function emitAll() {
  for (const listener of mocks.listeners) {
    const prefix = `${listener.path}/`
    const docs = Object.entries(mocks.database)
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }))
    listener.next({ docs })
  }
}

async function write(path: string, change: () => void) {
  if (mocks.refuse === path) throw new Error('permission-denied')
  change()
  emitAll()
}

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (parent: unknown, path?: string) => (path === undefined ? { path: `${(parent as Ref).path}/new-${++mocks.nextId}` } : { path }),
  onSnapshot: (ref: Ref, next: (snap: unknown) => void) => {
    const listener = { path: ref.path, next }
    mocks.listeners.push(listener)
    queueMicrotask(emitAll)
    return () => { mocks.listeners = mocks.listeners.filter((l) => l !== listener) }
  },
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  arrayUnion: (item: unknown) => ({ sentinel: 'arrayUnion', item }),
  arrayRemove: (item: unknown) => ({ sentinel: 'arrayRemove', item }),
  setDoc: (ref: Ref, data: Fields) => write(ref.path, () => { mocks.database[ref.path] = applied({}, data) }),
  updateDoc: (ref: Ref, data: Fields) => write(ref.path, () => {
    if (!mocks.database[ref.path]) throw new Error('not-found')
    mocks.database[ref.path] = applied(mocks.database[ref.path], data)
  }),
  deleteDoc: (ref: Ref) => write(ref.path, () => { delete mocks.database[ref.path] }),
}))

const { LubecClocksTab } = await import('./LubecClocksTab')

const CLOCKS = 'groups/group-1/campaigns/campaign-1/clocks'
const setError = vi.fn()

const stored = (id: string, over: Fields = {}) => {
  mocks.database[`${CLOCKS}/${id}`] = {
    name: 'Sheriff', description: '', pieces: 4, filled: [], started: false, increase: '', decrease: '', whenFull: '', whenEmpty: '',
    createdAt: { toMillis: () => 1 }, ...over,
  }
}

const mount = () => render(<div className="shell-root" data-theme="lubec"><LubecClocksTab campaignId="campaign-1" groupId="group-1" setError={setError} /></div>)
const card = (name: string) => screen.getByRole('article', { name })
const docOf = (id: string) => mocks.database[`${CLOCKS}/${id}`]

beforeEach(() => {
  mocks.database = {}
  mocks.listeners = []
  mocks.refuse = null
  setError.mockClear()
})
afterEach(cleanup)

describe('the Clocks tab', () => {
  it('starts with no clocks and a + to make one', async () => {
    mount()
    expect(await screen.findByText('No clocks yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create a clock' })).toBeTruthy()
  })

  it('makes a clock through the form, empty, with its notes', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Create a clock' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a clock' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '  The Sheriff  ' } })
    fireEvent.change(within(dialog).getByLabelText(/Description/), { target: { value: 'He keeps an eye on the kids.' } })
    fireEvent.click(within(dialog).getByLabelText('6 pieces'))
    fireEvent.change(within(dialog).getByLabelText('Fills when'), { target: { value: 'Someone is seen sneaking out' } })
    fireEvent.change(within(dialog).getByLabelText('Empties when'), { target: { value: 'A week of lying low' } })
    fireEvent.change(within(dialog).getByLabelText('When full'), { target: { value: 'He calls the parents' } })
    fireEvent.change(within(dialog).getByLabelText('When empty'), { target: { value: 'He stops watching' } })
    expect(within(dialog).getByText('6 pieces')).toBeTruthy()
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Create clock' })) })

    expect(screen.queryByRole('dialog')).toBeNull()
    const sheriff = card('The Sheriff')
    expect(within(sheriff).getByText('He keeps an eye on the kids.')).toBeTruthy()
    expect(within(sheriff).getByText('Someone is seen sneaking out')).toBeTruthy()
    expect(within(sheriff).getByText('He stops watching')).toBeTruthy()
    expect(within(sheriff).getByLabelText('0 of 6 filled')).toBeTruthy()
    expect(within(sheriff).queryByText('Empty')).toBeNull()
    expect(Object.values(mocks.database)[0]).toMatchObject({ name: 'The Sheriff', pieces: 6, filled: [], started: false, whenFull: 'He calls the parents' })
  })

  it('refuses a clock without a name and keeps the form open', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Create a clock' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create clock' }))
    expect(screen.getByRole('alert').textContent).toBe('Give the clock a name.')
    expect(Object.keys(mocks.database)).toEqual([])
  })

  it('closes the form on Cancel, the close button and Escape without saving', async () => {
    mount()
    const add = await screen.findByRole('button', { name: 'Create a clock' })
    for (const close of [() => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })), () => fireEvent.click(screen.getByRole('button', { name: 'Close' })), () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })]) {
      fireEvent.click(add)
      close()
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    expect(Object.keys(mocks.database)).toEqual([])
  })

  it('fills and empties any piece on its own, in any order, by click and by key', async () => {
    stored('c1')
    mount()
    const sheriff = await screen.findByRole('article', { name: 'Sheriff' })
    const piece = (label: string) => within(sheriff).getByRole('button', { name: `Sheriff: ${label}` })
    await act(async () => { fireEvent.click(piece('fill piece 3')) })
    expect(docOf('c1')).toMatchObject({ filled: [2], started: true })
    expect(piece('empty piece 3').getAttribute('aria-pressed')).toBe('true')
    expect(piece('fill piece 1').getAttribute('aria-pressed')).toBe('false')
    await act(async () => { fireEvent.keyDown(piece('fill piece 1'), { key: 'Enter' }) })
    expect(docOf('c1').filled).toEqual([2, 0])
    expect(within(sheriff).getByLabelText('2 of 4 filled')).toBeTruthy()
    await act(async () => { fireEvent.keyDown(piece('empty piece 3'), { key: ' ' }) })
    expect(docOf('c1').filled).toEqual([0])
    fireEvent.keyDown(piece('fill piece 4'), { key: 'a' })
    expect(docOf('c1').filled).toEqual([0])
  })

  it('shows the full result whatever order the pieces were filled in, then the empty one once drained', async () => {
    stored('c1', { pieces: 3, whenFull: 'He calls the parents', whenEmpty: 'He stops watching' })
    mount()
    const sheriff = await screen.findByRole('article', { name: 'Sheriff' })
    const press = async (label: string) => act(async () => { fireEvent.click(within(sheriff).getByRole('button', { name: `Sheriff: ${label}` })) })
    expect(within(sheriff).queryByText('Empty')).toBeNull()
    await press('fill piece 3')
    await press('fill piece 1')
    expect(within(sheriff).queryByText('Full')).toBeNull()
    await press('fill piece 2')
    expect(docOf('c1')).toMatchObject({ filled: [2, 0, 1], started: true })
    expect(within(sheriff).getByText('Full')).toBeTruthy()
    expect(within(sheriff).getAllByText('He calls the parents')).toHaveLength(1)
    await press('empty piece 2')
    expect(within(sheriff).queryByText('Full')).toBeNull()
    await press('empty piece 1')
    await press('empty piece 3')
    expect(within(sheriff).getByText('Empty')).toBeTruthy()
    expect(within(sheriff).getAllByText('He stops watching')).toHaveLength(1)
  })

  it('says so when a piece is refused, and leaves the clock as it was', async () => {
    stored('c1')
    mocks.refuse = `${CLOCKS}/c1`
    mount()
    const sheriff = await screen.findByRole('article', { name: 'Sheriff' })
    await act(async () => { fireEvent.click(within(sheriff).getByRole('button', { name: 'Sheriff: fill piece 2' })) })
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save that. Nothing changed.')
    expect(docOf('c1').filled).toEqual([])
  })

  it('edits a clock through the same form and keeps only the pieces that fit', async () => {
    stored('c1', { pieces: 6, filled: [0, 2, 4, 5], started: true })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sheriff' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit clock' })
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Sheriff')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Deputy' } })
    fireEvent.click(within(dialog).getByLabelText('3 pieces'))
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })) })
    expect(docOf('c1')).toMatchObject({ name: 'Deputy', pieces: 3, filled: [0, 2] })
    expect(card('Deputy')).toBeTruthy()
  })

  it('saves an edit without undoing a piece filled while the form was open', async () => {
    stored('c1', { pieces: 6, filled: [1] })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sheriff' }))
    await act(async () => {
      mocks.database[`${CLOCKS}/c1`] = { ...docOf('c1'), filled: [1, 4] }
      emitAll()
    })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(docOf('c1').filled).toEqual([1, 4])
  })

  it('keeps the form open with an error when the save is refused', async () => {
    stored('c1')
    mocks.refuse = `${CLOCKS}/c1`
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sheriff' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Could not save that. Nothing changed.')
  })

  it('deletes a clock from its form after asking once more', async () => {
    stored('c1')
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sheriff' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(docOf('c1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('group', { name: 'Delete Sheriff?' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })) })
    expect(docOf('c1')).toBeUndefined()
    await waitFor(() => expect(screen.getByText('No clocks yet.')).toBeTruthy())
  })

  it('keeps the form open when a delete is refused', async () => {
    stored('c1')
    mocks.refuse = `${CLOCKS}/c1`
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sheriff' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })) })
    expect(screen.getByRole('alert').textContent).toBe('Could not delete that. Nothing changed.')
  })
})

// @vitest-environment jsdom
/**
 * The clock popup over a stubbed listener that hands out snapshots the test
 * builds, each document carrying `hasPendingWrites` as Firestore's do. A piece
 * someone else fills or empties brings up the clock's card with that piece
 * animating; the popup goes when its own fade ends or when clicked; this
 * browser's own change brings nothing; and a player listens only to the
 * clocks shown to them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

type Fields = Record<string, unknown>
type Doc = { id: string; data: Fields; pending?: boolean }

// jsdom has no AnimationEvent, so React would listen for the prefixed `webkitAnimationEnd`;
// defining it before React loads gives the plain `animationend` every browser sends.
vi.hoisted(() => {
  if (!('AnimationEvent' in window)) Object.assign(window, { AnimationEvent: class AnimationEvent extends Event {} })
})

const mocks = vi.hoisted(() => ({
  next: null as null | ((snap: unknown) => void),
  fail: null as null | (() => void),
  ref: null as unknown,
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: Fields, filter: Fields) => ({ ...ref, filter }),
  or: (...anyOf: unknown[]) => ({ anyOf }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  onSnapshot: (ref: unknown, next: (snap: unknown) => void, fail: () => void) => {
    mocks.ref = ref
    mocks.next = next
    mocks.fail = fail
    return () => { mocks.next = null }
  },
}))

const { LubecClockAlerts } = await import('./LubecClockAlerts')

const clockData = (filled: number[], over: Fields = {}): Fields => ({
  name: 'Sheriff', description: 'He is watching.', pieces: 4, filled, started: true, increase: 'Seen out late', decrease: '',
  whenFull: 'He calls the parents', whenEmpty: '', visibility: 'all', characterIds: [], viewerUids: [], ...over,
})

const read = (docs: Doc[]) => act(async () => {
  mocks.next?.({ docs: docs.map(({ id, data, pending = false }) => ({ id, data: () => data, metadata: { hasPendingWrites: pending } })) })
})

const mount = (role: 'gm' | 'player' = 'player') =>
  render(<div className="shell-root" data-theme="lubec"><LubecClockAlerts campaignId="campaign-1" groupId="group-1" role={role} userId="alice" /></div>)

beforeEach(() => {
  mocks.next = null
  mocks.ref = null
})
afterEach(cleanup)

describe('the clock popup', () => {
  it('shows nothing for the clocks as they first load', async () => {
    mount()
    await read([{ id: 'c1', data: clockData([0]) }])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the clock\'s card with the piece someone else filled, then goes when its fade ends', async () => {
    mount()
    await read([{ id: 'c1', data: clockData([0]) }])
    await read([{ id: 'c1', data: clockData([0, 2]) }])
    const popup = screen.getByRole('status', { name: 'Sheriff: Piece 3 filled' })
    const card = within(popup).getByRole('article', { name: 'Sheriff' })
    expect(within(card).getByText('He is watching.')).toBeTruthy()
    expect(within(card).getByLabelText('2 of 4 filled')).toBeTruthy()
    expect(within(card).queryByRole('button')).toBeNull()
    expect(card.querySelector('.piece.arriving')).toBe(card.querySelectorAll('.piece')[2])

    fireEvent.animationEnd(card.querySelector('.piece.arriving') as Element)
    expect(screen.getByRole('status')).toBeTruthy()
    fireEvent.animationEnd(popup)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows an emptied piece leaving, and the full result once the clock is full', async () => {
    mount()
    await read([{ id: 'c1', data: clockData([0, 1, 2]) }, { id: 'c2', data: clockData([0, 1, 2], { name: 'Fog' }) }])
    await read([{ id: 'c1', data: clockData([1, 2]) }, { id: 'c2', data: clockData([0, 1, 2, 3], { name: 'Fog' }) }])
    const first = screen.getByRole('status', { name: 'Sheriff: Piece 1 emptied' })
    expect(first.querySelector('.piece.leaving')).toBe(first.querySelectorAll('.piece')[0])
    fireEvent.click(first)
    const second = screen.getByRole('status', { name: 'Fog: Piece 4 filled' })
    expect(within(second).getByText('Full')).toBeTruthy()
    expect(within(second).getByText('He calls the parents')).toBeTruthy()
  })

  it('shows nothing for this browser\'s own change', async () => {
    mount()
    await read([{ id: 'c1', data: clockData([0]) }])
    await read([{ id: 'c1', data: clockData([0, 1]), pending: true }])
    await read([{ id: 'c1', data: clockData([0, 1]) }])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('listens to every clock for the GM, and only to the clocks shown to a player', () => {
    mount('gm')
    expect(mocks.ref).toEqual({ path: 'groups/group-1/campaigns/campaign-1/clocks' })
    cleanup()
    mount('player')
    expect(mocks.ref).toMatchObject({ filter: { anyOf: [{ field: 'visibility', op: '==', value: 'all' }, { field: 'viewerUids', op: 'array-contains', value: 'alice' }] } })
  })

  it('drops what is waiting when the clocks can no longer be read', async () => {
    mount()
    await read([{ id: 'c1', data: clockData([0]) }])
    await read([{ id: 'c1', data: clockData([0, 1]) }])
    await act(async () => { mocks.fail?.() })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

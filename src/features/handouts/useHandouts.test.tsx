// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  subscriptions: [] as { source: unknown; next: (value: unknown) => void; error: (reason: Error) => void; stop: ReturnType<typeof vi.fn> }[],
  setDoc: vi.fn(), deleteDoc: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, path: string) => path, doc: (_: unknown, path: string) => path,
  query: (source: unknown, filter: unknown) => ({ source, filter }), or: (...filters: unknown[]) => filters, where: (...parts: unknown[]) => parts,
  onSnapshot: (source: unknown, next: (value: unknown) => void, error: (reason: Error) => void) => { const stop = vi.fn(); mocks.subscriptions.push({ source, next, error, stop }); return stop },
  setDoc: mocks.setDoc, deleteDoc: mocks.deleteDoc,
}))
vi.mock('./handoutStorage', () => ({ uploadHandoutFile: mocks.upload, removeHandoutFile: mocks.remove }))
import { deleteHandout, deleteHandoutFolder, saveHandout, saveHandoutFolder, useHandouts } from './useHandouts'
import { emptyHandout } from './handoutModel'
const scope = { groupId: 'g', campaignId: 'c' }
const oldPath = 'groups/g/campaigns/c/handouts/h/old.pdf'
beforeEach(() => { vi.clearAllMocks(); mocks.subscriptions = []; mocks.setDoc.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined) })
afterEach(cleanup)

describe('campaign handout subscription', () => {
  it('subscribes a player only to all-player and their own grants, then releases listeners', () => {
    const view = renderHook(() => useHandouts(scope, false, 'alice'))
    expect(mocks.subscriptions[0].source).toEqual({ source: 'groups/g/campaigns/c/handouts', filter: [['visibility', '==', 'all'], ['viewerUids', 'array-contains', 'alice']] })
    expect(mocks.subscriptions).toHaveLength(2)
    act(() => mocks.subscriptions[0].next({ docs: [{ id: 'h', data: () => ({ title: 'Clue' }) }] }))
    act(() => mocks.subscriptions[1].next({ docs: [{ id: 'f', data: () => ({ name: 'Letters', parentId: '' }) }] }))
    expect(view.result.current.handouts[0]).toEqual({ id: 'h', title: 'Clue' })
    expect(view.result.current.folders[0].name).toBe('Letters')
    expect(view.result.current.loading).toBe(false)
    view.unmount()
    for (const sub of mocks.subscriptions) expect(sub.stop).toHaveBeenCalled()
  })
  it('loads the GM character roster and clears content if the subscription fails', () => {
    const view = renderHook(() => useHandouts(scope, true, 'gm'))
    expect(mocks.subscriptions[0].source).toBe('groups/g/campaigns/c/handouts')
    act(() => mocks.subscriptions[2].next({ docs: [{ id: 'm', data: () => ({ name: 'Mirelda', ownerUserId: 'alice' }) }, { id: 'u', data: () => ({}) }] }))
    expect(view.result.current.characters).toEqual([{ id: 'm', name: 'Mirelda', ownerUserId: 'alice' }, { id: 'u', name: 'Unnamed character', ownerUserId: '' }])
    act(() => mocks.subscriptions[0].error(new Error('Access revoked')))
    expect(view.result.current.handouts).toEqual([])
    expect(view.result.current.error).toBe('Access revoked')
  })
})

describe('handout persistence and file cleanup', () => {
  it('saves a new uploaded file and deletes the replaced file only after persistence', async () => {
    const handout = { ...emptyHandout('', 'gm'), kind: 'pdf' as const, storagePath: oldPath, text: 'stale extract', description: 'An original document.' }
    mocks.upload.mockResolvedValue({ kind: 'pdf', storagePath: 'new', fileName: 'new.pdf' })
    const file = {} as File
    const saved = await saveHandout(scope, handout, file)
    expect(saved.text).toBe('')
    expect(saved.description).toBe('An original document.')
    expect(mocks.setDoc).toHaveBeenCalledWith(`groups/g/campaigns/c/handouts/${handout.id}`, expect.objectContaining({ storagePath: 'new', text: '' }))
    expect(mocks.remove).toHaveBeenCalledWith(oldPath)
    expect(mocks.setDoc.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0])
  })
  it('cleans a newly uploaded orphan if the document write fails', async () => {
    mocks.upload.mockResolvedValue({ kind: 'image', storagePath: 'orphan', fileName: 'clue.png' })
    mocks.setDoc.mockRejectedValue(new Error('Offline'))
    await expect(saveHandout(scope, emptyHandout('', 'gm'), {} as File)).rejects.toThrow('Offline')
    expect(mocks.remove).toHaveBeenCalledWith('orphan')
  })
  it('removes old file references and bytes when switching to pasted text', async () => {
    const saved = await saveHandout(scope, { ...emptyHandout('', 'gm'), storagePath: oldPath, fileName: 'old.pdf' }, null)
    expect(saved).toMatchObject({ storagePath: '', fileName: '' })
    expect(mocks.remove).toHaveBeenCalledWith(oldPath)
  })
  it('persists plain text and folder changes, and deletes handout metadata before its bytes', async () => {
    const handout = emptyHandout('', 'gm')
    await saveHandout(scope, handout, null)
    expect(mocks.remove).not.toHaveBeenCalled()
    await saveHandoutFolder(scope, { id: 'f', name: 'Letters', parentId: '' })
    expect(mocks.setDoc).toHaveBeenLastCalledWith('groups/g/campaigns/c/handoutFolders/f', { name: 'Letters', parentId: '' })
    await deleteHandoutFolder(scope, 'f')
    expect(mocks.deleteDoc).toHaveBeenLastCalledWith('groups/g/campaigns/c/handoutFolders/f')
    await deleteHandout(scope, { ...handout, storagePath: oldPath })
    expect(mocks.remove).toHaveBeenLastCalledWith(oldPath)
  })
  it('preserves shared template art when a cloned handout is edited or deleted', async () => {
    const handout = { ...emptyHandout('', 'gm'), kind: 'pdf' as const, storagePath: 'groups/demo-template/campaigns/demo-campaign/handouts/h/original.pdf' }
    await saveHandout(scope, handout, null)
    await deleteHandout(scope, handout)
    expect(mocks.remove).not.toHaveBeenCalled()
    mocks.upload.mockResolvedValue({ kind: 'pdf', storagePath: 'groups/g/campaigns/c/handouts/h/replacement.pdf', fileName: 'replacement.pdf' })
    await saveHandout(scope, handout, {} as File)
    expect(mocks.remove).not.toHaveBeenCalled()
  })

})

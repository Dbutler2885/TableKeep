import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), token: vi.fn(), ref: vi.fn((_: unknown, path: string) => path), upload: vi.fn(), getBlob: vi.fn(), remove: vi.fn(), user: {} as { currentUser: { getIdToken: ReturnType<typeof vi.fn> } | null } }))
vi.mock('../../firebase', () => ({ auth: { authStateReady: mocks.ready, get currentUser() { return mocks.user.currentUser } }, storage: {} }))
vi.mock('firebase/storage', () => ({ ref: mocks.ref, uploadBytes: mocks.upload, getBlob: mocks.getBlob, deleteObject: mocks.remove }))
import { loadHandoutFile, removeHandoutFile, uploadHandoutFile } from './handoutStorage'

beforeEach(() => { vi.clearAllMocks(); mocks.user.currentUser = { getIdToken: mocks.token }; mocks.remove.mockResolvedValue(undefined) })
describe('authenticated handout files', () => {
  it('uploads an original file with a unique campaign path and correct content type', async () => {
    const file = { name: 'Old letter.pdf', type: 'application/pdf', size: 10 } as File
    const result = await uploadHandoutFile({ groupId: 'g', campaignId: 'c' }, 'h', file)
    expect(result).toMatchObject({ kind: 'pdf', fileName: 'Old letter.pdf' })
    expect(result.storagePath).toMatch(/^groups\/g\/campaigns\/c\/handouts\/h\/.+-Old_letter.pdf$/)
    expect(mocks.upload).toHaveBeenCalledWith(result.storagePath, file, { contentType: 'application/pdf' })
    expect(mocks.token).toHaveBeenCalledWith(true)
  })
  it('fetches authenticated bytes with a size ceiling and no download URL cache', async () => {
    mocks.getBlob.mockResolvedValue('bytes')
    expect(await loadHandoutFile('path')).toBe('bytes')
    await loadHandoutFile('path')
    expect(mocks.getBlob).toHaveBeenCalledTimes(2)
    expect(mocks.getBlob).toHaveBeenCalledWith('path', 20 * 1024 * 1024)
  })
  it('refuses reads and uploads after signout', async () => {
    mocks.user.currentUser = null
    await expect(loadHandoutFile('path')).rejects.toThrow('Sign in')
    await expect(uploadHandoutFile({ groupId: 'g', campaignId: 'c' }, 'h', { name: 'a.png', size: 1, type: 'image/png' } as File)).rejects.toThrow('Sign in')
    expect(mocks.getBlob).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('ignores already removed files and propagates other deletion failures', async () => {
    await removeHandoutFile('')
    expect(mocks.remove).not.toHaveBeenCalled()
    mocks.remove.mockRejectedValueOnce({ code: 'storage/object-not-found' })
    await expect(removeHandoutFile('missing')).resolves.toBeUndefined()
    mocks.remove.mockRejectedValueOnce(new Error('Permission denied'))
    await expect(removeHandoutFile('protected')).rejects.toThrow('Permission denied')
  })
})

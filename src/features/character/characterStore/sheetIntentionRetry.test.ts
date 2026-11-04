import { beforeEach, expect, it, vi } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { getDocFromServer, type DocumentReference } from 'firebase/firestore'
import { withSheetRevisionRetry } from './sheetIntentionRetry'

vi.mock('firebase/firestore', () => ({ getDocFromServer: vi.fn() }))
const reference = (path: string) => ({ path, withConverter() { return this } }) as DocumentReference
beforeEach(() => vi.resetAllMocks())

it('resolves the attempted sheet after the write discovers its target and retries only proven contention', async () => {
  const denied = new FirebaseError('permission-denied', 'revision fence')
  let attempted: DocumentReference | undefined
  const target = reference('npcSheets/roy')
  const write = vi.fn().mockImplementationOnce(async () => { attempted = target; throw denied }).mockResolvedValue('acknowledged')
  vi.mocked(getDocFromServer).mockResolvedValue({ exists: () => true, data: () => ({ sheetRevision: 7 }) } as never)
  expect(await withSheetRevisionRetry(() => attempted, write, () => 7)).toBe('acknowledged')
  expect(write).toHaveBeenCalledTimes(2)
  expect(getDocFromServer).toHaveBeenCalledWith(target)
})

it('does not guess a reference or retry when a failed callback no longer has an attempted sheet', async () => {
  const denied = new FirebaseError('permission-denied', 'read revoked')
  const write = vi.fn().mockRejectedValue(denied)
  await expect(withSheetRevisionRetry(() => undefined, write, () => 7)).rejects.toBe(denied)
  expect(write).toHaveBeenCalledOnce()
  expect(getDocFromServer).not.toHaveBeenCalled()
})

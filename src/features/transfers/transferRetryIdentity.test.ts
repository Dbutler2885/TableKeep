// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { retainTransferIdentity } from './transferRetryIdentity'
const scope = { groupId: 'g', campaignId: 'c' }
const identity = { fromCharacterId: 'sender', toCharacterId: 'receiver' }
beforeEach(() => sessionStorage.clear())
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('retains identities independently of the live offer list and isolates campaign scopes', () => {
  expect(retainTransferIdentity(scope, 'retained', identity)).toEqual(identity)
  expect(retainTransferIdentity(scope, 'retained')).toEqual(identity)
  expect(retainTransferIdentity({ ...scope, campaignId: 'other' }, 'retained')).toBeUndefined()
})
it('recovers a retained identity after a reload and rejects malformed storage', () => {
  sessionStorage.setItem('tablekeep-transfer:g:c:reloaded', JSON.stringify(identity))
  expect(retainTransferIdentity(scope, 'reloaded')).toEqual(identity)
  for (const [id, value] of [['bad-json', '{'], ['bad-type', '{"fromCharacterId":7,"toCharacterId":"to"}'], ['no-to', '{"fromCharacterId":"from"}']]) {
    sessionStorage.setItem(`tablekeep-transfer:g:c:${id}`, value)
    expect(retainTransferIdentity(scope, id)).toBeUndefined()
  }
})
it('retains the live identity even when browser storage is disabled', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled') })
  expect(retainTransferIdentity(scope, 'disabled', identity)).toEqual(identity)
  expect(retainTransferIdentity(scope, 'missing-disabled')).toBeUndefined()
})

import { describe, expect, it } from 'vitest'
import { isTransferSourceAuthorized } from '../../../functions/src/transferAuthorization'

describe('acceptPendingTransfer source authorization', () => {
  it('rejects a transfer whose source character belongs to another user', () => {
    expect(isTransferSourceAuthorized('victim-uid', 'attacker-uid')).toBe(false)
  })

  it('allows a transfer whose authenticated sender owns the source character', () => {
    expect(isTransferSourceAuthorized('sender-uid', 'sender-uid')).toBe(true)
  })
})

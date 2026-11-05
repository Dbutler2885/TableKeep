import { describe, expect, it, vi } from 'vitest'
import type { PreparedSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { requireFreshWoundRead, retryStaleWoundRead, StaleWoundRead } from './woundStaleRead'

const committed = { status: 'committed', operationId: 'wound_op', revision: 1 } as const
const prepared = (plan: Partial<PreparedSheetIntention>) => ({ outcome: committed, ...plan }) as PreparedSheetIntention

describe('requireFreshWoundRead', () => {
  it('passes a plan that writes the wound', () => {
    expect(() => requireFreshWoundRead(prepared({ mutation: { sheet: {}, receipt: { intention: { operationId: 'wound_op', baseRevision: 0, edits: [] }, outcome: committed } } }))).not.toThrow()
  })

  it('passes a sheet repair that no receipt caused, for delivery to report', () => {
    expect(() => requireFreshWoundRead(prepared({ outcome: { status: 'repair', code: 'sheet-deleted' } }))).not.toThrow()
  })

  it.each([
    ['a replayed receipt', prepared({})],
    ['a receipt planned from an older base revision', prepared({ outcome: { status: 'repair', code: 'operation-id-reused' } })],
  ])('calls %s a stale fight read', (_, plan) => {
    expect(() => requireFreshWoundRead(plan)).toThrow(StaleWoundRead)
  })
})

describe('retryStaleWoundRead', () => {
  it('returns the first result without retrying', async () => {
    const run = vi.fn().mockResolvedValue('done')
    await expect(retryStaleWoundRead(run)).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reads again after a torn read and returns the fresh result', async () => {
    const run = vi.fn().mockRejectedValueOnce(new StaleWoundRead()).mockResolvedValue('fresh')
    await expect(retryStaleWoundRead(run)).resolves.toBe('fresh')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('lets any other error stand at once', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Wound target is not in this fight.'))
    await expect(retryStaleWoundRead(run)).rejects.toThrow('not in this fight')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('gives up after its bounded attempts', async () => {
    const run = vi.fn().mockRejectedValue(new StaleWoundRead())
    await expect(retryStaleWoundRead(run, 3)).rejects.toBeInstanceOf(StaleWoundRead)
    expect(run).toHaveBeenCalledTimes(3)
  })
})

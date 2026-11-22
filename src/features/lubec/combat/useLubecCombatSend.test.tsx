// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { CombatCommand } from './engine/types'

const mocks = vi.hoisted(() => ({ commits: [] as { command: CombatCommand; userId: string; journal: unknown }[] }))
vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('./combatTransaction', () => ({
  commitCombatCommand: async (_db: unknown, command: CombatCommand, options: { userId: string; journal: unknown }) => {
    mocks.commits.push({ command, ...options })
    return { ok: true, fightId: 'f', generatedIds: [], rolls: [] }
  },
}))

const { useLubecCombatSend, COMBAT_UNCERTAIN } = await import('./useLubecCombatSend')

const command = { envelope: { id: 'c', groupId: 'g', campaignId: 'c', fightId: 'f' }, seed: 's', payload: { type: 'end' } } as unknown as CombatCommand
afterEach(() => {
  cleanup()
  mocks.commits = []
})

describe('the viewer\'s combat sender', () => {
  it('journals under the viewer and commits as them', async () => {
    const { result, rerender } = renderHook(({ userId }) => useLubecCombatSend(userId), { initialProps: { userId: 'gm' } })
    expect(await result.current('key', () => command)).toMatchObject({ ok: true })
    await result.current('key', () => command)
    rerender({ userId: 'other' })
    await result.current('key', () => command)
    expect(mocks.commits.map((commit) => commit.userId)).toEqual(['gm', 'gm', 'other'])
  })

  it('refuses to send when this browser refuses storage, keeping the command for a retry', async () => {
    const blocked = () => { throw new Error('storage blocked') }
    const { result } = renderHook(() => useLubecCombatSend('gm', blocked))
    expect(await result.current('key', () => command)).toEqual({ ok: false, reason: COMBAT_UNCERTAIN })
    expect(mocks.commits).toEqual([])
  })
})

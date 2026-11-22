// @vitest-environment jsdom
/** The sheet's Fight shortcuts go to the Combat tab only while the live fight has that sheet. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LubecCombatContext, type LubecCombatWatch } from './combatWatch'
import { useCombatRoute } from './useCombatRoute'

afterEach(cleanup)

const live = { id: 'fight', fight: { status: 'live', participantUserIds: [], state: { combatants: [{ kind: 'character', sheetId: 'tommy', key: 'character:tommy' }] } } } as never
const route = (watch: LubecCombatWatch, sheetId: string | undefined) =>
  renderHook(() => useCombatRoute(sheetId), { wrapper: ({ children }: { children: ReactNode }) => <LubecCombatContext value={watch}>{children}</LubecCombatContext> }).result.current

describe('useCombatRoute', () => {
  it('routes a sheet in the live fight to the Combat tab, and nothing else', () => {
    const openCombat = vi.fn()
    expect(route({ enabled: true, ready: true, live, openCombat }, 'tommy')).toBe(openCombat)
    expect(route({ enabled: true, ready: true, live, openCombat }, 'wayne')).toBeNull()
    expect(route({ enabled: true, ready: true, live: null, openCombat }, 'tommy')).toBeNull()
    expect(route({ enabled: true, ready: true, live }, 'tommy')).toBeNull()
    expect(route({ enabled: true, ready: true, live, openCombat }, undefined)).toBeNull()
  })
})

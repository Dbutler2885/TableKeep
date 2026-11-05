// @vitest-environment jsdom
/** The Gear page's way back to the fight. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LubecLiveFight } from './combatWatch'
import { LubecCombatContext } from './combatWatch'
import { LubecCombatGearNotice } from './LubecCombatGearNotice'

afterEach(cleanup)

const live = (sheetIds: string[]): LubecLiveFight => ({
  id: 'fight',
  fight: { status: 'live', participantUserIds: [], state: { combatants: sheetIds.map((sheetId) => ({ kind: 'character', sheetId, key: `character:${sheetId}` })) } } as never,
})

const show = (fight: LubecLiveFight | null, openCombat: (() => void) | undefined) =>
  render(<LubecCombatContext value={{ enabled: true, ready: true, live: fight, openCombat }}><LubecCombatGearNotice sheetId="wayne" /></LubecCombatContext>)

describe('the Gear page\'s way back to Combat', () => {
  it('says combat is running and goes back to the same fight', () => {
    const openCombat = vi.fn()
    show(live(['wayne']), openCombat)
    expect(screen.getByText(/You opened your inventory from the Combat tab/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Combat' }))
    expect(openCombat).toHaveBeenCalledOnce()
  })

  it('says nothing once the fight has ended, no longer has this sheet, or outside the workspace', () => {
    show(null, vi.fn())
    expect(screen.queryByRole('button', { name: 'Back to Combat' })).toBeNull()
    cleanup()
    show(live(['dottie']), vi.fn())
    expect(screen.queryByRole('button', { name: 'Back to Combat' })).toBeNull()
    cleanup()
    show(live(['wayne']), undefined)
    expect(screen.queryByRole('button', { name: 'Back to Combat' })).toBeNull()
  })
})

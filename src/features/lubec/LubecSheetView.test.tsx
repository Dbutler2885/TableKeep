// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../ruleSets/lubec/directEntry'
import { requestOpen } from '../navigation/openRequest'
import { LubecCombatContext } from './combat/combatWatch'
import { LubecSheetView, type LubecSheetViewProps } from './LubecSheetView'

const character: LubecCharacterRecord = {
  ...makeLubecDirectEntryCharacter('tommy', { userId: 'gm-1', username: 'gamemas' }),
  name: 'Tommy Eves',
  creationStatus: 'active',
}

const editing = { update: vi.fn(), uploadPortrait: vi.fn(), uploadToken: vi.fn() }

function renderSheet(props: Partial<LubecSheetViewProps>) {
  return render(
    <LubecSheetView
      character={character}
      editing={editing}
      onCountersChange={vi.fn()}
      onSkillsChange={null}
      onDraftEdit={null}
      onDelete={null}
      onAssign={null}
      onFinalize={null}
      onRollUp={null}
      corrections={null}
      onGearChange={null}
      {...props}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('LubecSheetView identity', () => {
  it('lets the viewer edit the name band and the token by default', () => {
    renderSheet({})

    expect(screen.getByRole('button', { name: 'Edit name band' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit map token' })).toBeTruthy()
  })

  it('shows the name band and the token as they are when the identity is edited elsewhere', () => {
    renderSheet({ identityEditable: false })

    expect(screen.queryByRole('button', { name: 'Edit name band' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit map token' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Tommy Eves map token' })).toBeTruthy()
    // The rest of the sheet still takes the viewer's edits.
    expect(screen.getByRole('button', { name: 'Add effect' })).toBeTruthy()
  })
})

describe('LubecSheetView pages', () => {
  const pageTabs = () => screen.getAllByRole('button').filter((button) => button.closest('.lubec-page-tabs')).map((tab) => tab.textContent)

  it('offers the Core sheet, Skills and Gear pages by default', () => {
    renderSheet({})

    expect(pageTabs()).toEqual(['Core sheet', 'Skills', 'Gear'])
  })
})

describe('LubecSheetView sent from the Combat tab', () => {
  const live = { id: 'fight', fight: { status: 'live', participantUserIds: [], state: { combatants: [{ kind: 'character', sheetId: 'tommy', key: 'character:tommy' }] } } } as never
  const sheetProps = { character, editing, onCountersChange: vi.fn(), onSkillsChange: null, onDraftEdit: null, onDelete: null, onAssign: null, onFinalize: null, onRollUp: null, corrections: null, onGearChange: null }

  it('opens on the real Gear page with the way back to the fight, once', () => {
    window.sessionStorage.clear()
    requestOpen('character', 'tommy', 'gear')
    const openCombat = vi.fn()
    render(<LubecCombatContext value={{ enabled: true, ready: true, live, openCombat }}><LubecSheetView {...sheetProps} /></LubecCombatContext>)
    expect(screen.getByRole('button', { name: 'Gear' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('tablist', { name: 'Gear views' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Combat' }))
    expect(openCombat).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Core sheet' }))
    expect(screen.queryByRole('button', { name: 'Back to Combat' })).toBeNull()
    cleanup()
    render(<LubecCombatContext value={{ enabled: true, ready: true, live, openCombat }}><LubecSheetView {...sheetProps} /></LubecCombatContext>)
    expect(screen.queryByRole('button', { name: 'Back to Combat' })).toBeNull()
  })
})

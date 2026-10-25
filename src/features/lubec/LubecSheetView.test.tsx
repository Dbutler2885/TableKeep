// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../ruleSets/lubec/directEntry'
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

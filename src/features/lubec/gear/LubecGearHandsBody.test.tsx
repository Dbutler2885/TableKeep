// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LubecGearHandsBody } from './LubecGearHandsBody'
import { LubecHandsContext } from './lubecHandsContext'

afterEach(cleanup)

const lamp = { id: 'lamp', kind: 'thing', carrier: 'hands', slot: 0, name: 'Lamp', size: 1, qty: 1, weight: 'normal', note: '' } as LubecItem
const hands = { unusable: [{ slot: 1 as const, why: 'Right arm unusable (Dislocated shoulder, Shoulder)' }], noTwoHanded: null }

describe('the Hands panel under an unusable arm', () => {
  it('shows the empty hand out of use with the card that says why, and offers nothing to add there', () => {
    render(
      <LubecHandsContext.Provider value={hands}>
        <LubecGearHandsBody gear={{ ...emptyLubecGear(), items: [lamp] }} supplyName={() => ''} onAdd={() => {}} onOpen={null} />
      </LubecHandsContext.Provider>,
    )
    expect(screen.getByText('Right arm unusable (Dislocated shoulder, Shoulder)')).toBeTruthy()
    expect(screen.getByText('Right hand · out of use')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Right hand, empty/ })).toBeNull()
  })
})

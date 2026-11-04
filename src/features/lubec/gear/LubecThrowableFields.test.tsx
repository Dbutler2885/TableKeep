// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { emptyLubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecDraftOf, lubecNewFields, type LubecItemFields } from './itemForm'
import { LubecItemFormKind } from './LubecItemFormKind'

afterEach(cleanup)

function Editor() {
  const [fields, setFields] = useState<LubecItemFields>({ ...lubecNewFields('hands'), kind: 'weapon', name: 'Knife' })
  return <>
    <LubecItemFormKind fields={fields} onFields={setFields} supplies={[]} onMakeSupply={() => {}} gear={emptyLubecGear()} editId={null} />
    <output data-testid="draft">{JSON.stringify(lubecDraftOf(fields))}</output>
  </>
}

const draft = () => JSON.parse(screen.getByTestId('draft').textContent ?? '{}')
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('throwable form controls', () => {
  it('edits one thrown damage type, catch rules and optional ranges with independent distances and modifiers', () => {
    render(<Editor />)
    expect(screen.queryByLabelText('Thrown Impact')).toBeNull()
    fireEvent.click(screen.getByLabelText('Can be thrown'))
    change('Thrown Impact', '-1')
    change('Thrown damage type', 'pierce')
    change('Catch chance (%)', '10')
    fireEvent.click(screen.getByLabelText('Catching this puts the thrower out'))
    fireEvent.click(screen.getByText('Weapon ranges'))
    fireEvent.click(screen.getByLabelText('Short'))
    change('Short distance', 'Across the kitchen')
    change('Short Handle modifier', '13')
    fireEvent.click(screen.getByLabelText('Extreme'))
    change('Short Handle modifier', '-13')
    expect(draft()).toMatchObject({ canThrow: true, thrownImpact: -1, thrownWound: 'pierce', catchChance: 10, catchPutsThrowerOut: true, ranges: [{ band: 'short', distance: 'Across the kitchen', modifier: -13 }, { band: 'extreme' }] })
    fireEvent.click(screen.getByLabelText('Short'))
    expect(draft().ranges).toEqual([{ band: 'extreme' }])
    fireEvent.click(screen.getByLabelText('Can be thrown'))
    expect(screen.queryByLabelText('Thrown Impact')).toBeNull()
    expect(draft()).not.toHaveProperty('ranges')
    expect(draft()).not.toHaveProperty('thrownWound')
  })

  it('uses ordinary damage for thrown mode, exposes Dodgeball, and hides catch controls on a firearm', () => {
    render(<Editor />)
    fireEvent.click(screen.getByRole('radio', { name: /Thrown.*Strength/ }))
    expect(screen.queryByLabelText('Can be thrown')).toBeNull()
    expect(screen.queryByLabelText('Thrown damage type')).toBeNull()
    change('Base Impact', '-2')
    change('Results table', 'dodgeball')
    fireEvent.click(screen.getByRole('radio', { name: 'Pierce' }))
    expect(draft()).toMatchObject({ mode: 'thrown', impact: -2, table: 'dodgeball', wounds: ['pierce'] })
    expect(screen.getByRole('radio', { name: 'Blunt' })).toHaveProperty('checked', false)
    fireEvent.click(screen.getByRole('radio', { name: /Firearm.*no Strength/ }))
    expect(screen.queryByLabelText('Catch chance (%)')).toBeNull()
    expect(screen.getByText('Weapon ranges')).toBeTruthy()
  })
})

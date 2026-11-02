// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeLubecDirectEntryCharacter } from '../../ruleSets/lubec/directEntry'
import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LubecFightModal } from './LubecFightModal'
import { LUBEC_FISTICUFFS_ID, type LubecCombatant, type LubecFightRequest } from './lubecFightRequest'

const knife: LubecItem = { id: 'knife', kind: 'weapon', carrier: 'hands', slot: 0, name: 'Hunting knife', size: 1, qty: 1, weight: 'normal', note: '', mode: 'melee', impact: 1 }
const thermos: LubecItem = { ...knife, id: 'thermos', kind: 'thing', name: 'Thermos', slot: 1 }

function kid(id: string, items: LubecItem[] = []): LubecCombatant {
  const character = makeLubecDirectEntryCharacter(id, { userId: id, username: id })
  return { kind: 'character', character: { ...character, name: id, lubec: { ...character.lubec, gear: { ...emptyLubecGear(), items } } } }
}

const attacker = kid('Tommy', [knife])
const wayne = kid('Wayne')
const rene: LubecCombatant = { kind: 'npc', npc: { id: 'Rene', name: 'Rene', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#000000', size: 34 } }, sheet: null }
const request: LubecFightRequest = { attacker, target: null }
const targets = [attacker, wayne, rene]
const props = { request, targets, onDrop: null, onClose: () => {} }
const weaponTrail = () => screen.queryByRole('button', { name: /^Weapon/ })
const who = () => screen.getByRole('combobox', { name: 'Who' }) as HTMLSelectElement
const currentStep = () => screen.getByRole('list', { name: 'Steps' }).querySelector('[aria-current="step"]')?.textContent
const chooseKnife = () => fireEvent.click(screen.getByRole('button', { name: /Left hand.*Hunting knife/ }))

afterEach(cleanup)

describe('fight flow through the modal', () => {
  it('starts at Weapon without a preselection and choosing a weapon advances to Target', () => {
    render(<LubecFightModal {...props} />)
    expect(currentStep()).toBe('1Weapon')
    expect(weaponTrail()).toBeNull()
    expect(screen.getByRole('button', { name: 'Next: target' })).toHaveProperty('disabled', true)
    chooseKnife()
    expect(currentStep()).toBe('2Target')
    expect(weaponTrail()?.textContent).toBe('WeaponHunting knife')
    expect(who().value).toBe('')
    expect(screen.getByRole('button', { name: 'Next: attack' })).toHaveProperty('disabled', true)
  })

  it('opens with a preselected weapon and target, and retains both while navigating', () => {
    render(<LubecFightModal {...props} request={{ ...request, target: rene, weaponItemId: knife.id }} />)
    expect(currentStep()).toBe('2Target')
    expect(weaponTrail()?.textContent).toBe('WeaponHunting knife')
    expect(who().value).toBe('npc:Rene')
    expect(screen.getByRole('heading', { name: 'Rene' })).toBeTruthy()
    fireEvent.change(who(), { target: { value: 'character:Wayne' } })
    fireEvent.click(weaponTrail() as HTMLElement)
    expect(currentStep()).toBe('1Weapon')
    expect(screen.getByRole('button', { name: /Left hand.*Hunting knife/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Next: target' })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: /^Target/ }))
    expect(who().value).toBe('character:Wayne')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next: target' }))
    expect(who().value).toBe('character:Wayne')
  })

  it.each(['missing', 'thermos'])('starts at Weapon when the preselected %s is not an eligible held weapon', (weaponItemId) => {
    render(<LubecFightModal {...props} request={{ attacker: kid('Tommy', [knife, thermos]), target: wayne, weaponItemId }} />)
    expect(currentStep()).toBe('1Weapon')
    expect(weaponTrail()).toBeNull()
    expect(screen.getByRole('button', { name: 'Next: target' })).toHaveProperty('disabled', true)
    chooseKnife()
    expect(who().value).toBe('character:Wayne')
  })

  it('offers the named target first even outside the roster, excludes the attacker and distinguishes NPCs from characters', () => {
    const sameId = kid('Rene')
    render(<LubecFightModal {...props} request={{ ...request, target: rene, weaponItemId: knife.id }} targets={[attacker, wayne, sameId, rene]} />)
    expect([...who().options].map((option) => option.value)).toEqual(['', 'npc:Rene', 'character:Wayne', 'character:Rene'])
    fireEvent.change(who(), { target: { value: 'character:Rene' } })
    expect(who().value).toBe('character:Rene')
    expect(screen.getByText('Nothing that stops a wound.')).toBeTruthy()
    fireEvent.change(who(), { target: { value: '' } })
    expect(screen.queryByRole('heading', { name: 'Rene' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Target/ })).toBeNull()
  })

  it('clears a selected target that leaves the eligible roster and reads its current sheet when it returns', () => {
    const view = render(<LubecFightModal {...props} request={{ ...request, weaponItemId: knife.id }} />)
    fireEvent.change(who(), { target: { value: 'character:Wayne' } })
    view.rerender(<LubecFightModal {...props} request={{ ...request, weaponItemId: knife.id }} targets={[attacker, rene]} />)
    expect(who().value).toBe('')
    expect(screen.queryByRole('heading', { name: 'Wayne' })).toBeNull()
    const jacket: LubecItem = { ...thermos, id: 'jacket', name: 'Leather jacket', kind: 'armor', carrier: 'worn', locs: ['torso'], armor: { cut: 2 } }
    view.rerender(<LubecFightModal {...props} request={{ ...request, weaponItemId: knife.id }} targets={[attacker, kid('Wayne', [jacket])]} />)
    expect(who().value).toBe('character:Wayne')
    expect(screen.getByText('Leather jacket')).toBeTruthy()
  })

  it('returns to Weapon while a chosen weapon is packed and resumes Target when held again', () => {
    const view = render(<LubecFightModal {...props} />)
    chooseKnife()
    fireEvent.change(who(), { target: { value: 'character:Wayne' } })
    view.rerender(<LubecFightModal {...props} request={{ attacker: kid('Tommy', [{ ...knife, carrier: 'dropped' }]), target: null }} />)
    expect(currentStep()).toBe('1Weapon')
    expect(weaponTrail()).toBeNull()
    view.rerender(<LubecFightModal {...props} request={{ attacker: kid('Tommy', [{ ...knife, slot: 1, name: 'Renamed knife' }]), target: null }} />)
    expect(currentStep()).toBe('2Target')
    expect(weaponTrail()?.textContent).toBe('WeaponRenamed knife')
    expect(who().value).toBe('character:Wayne')
  })

  it('invalidates Fisticuffs with full hands and restores the choice when a hand is free again', () => {
    const view = render(<LubecFightModal {...props} request={{ ...request, weaponItemId: LUBEC_FISTICUFFS_ID }} />)
    expect(currentStep()).toBe('2Target')
    expect(weaponTrail()?.textContent).toBe('WeaponFisticuffs')
    view.rerender(<LubecFightModal {...props} request={{ attacker: kid('Tommy', [knife, thermos]), target: null }} />)
    expect(currentStep()).toBe('1Weapon')
    expect(screen.getByRole('button', { name: /Fisticuffs/ })).toHaveProperty('disabled', true)
    expect(weaponTrail()).toBeNull()
    view.rerender(<LubecFightModal {...props} />)
    expect(currentStep()).toBe('2Target')
    expect(weaponTrail()?.textContent).toBe('WeaponFisticuffs')
  })

  it('keeps local choices when the open request changes and resets them on a fresh mount', () => {
    const view = render(<LubecFightModal {...props} />)
    chooseKnife()
    fireEvent.change(who(), { target: { value: 'character:Wayne' } })
    const next = { ...request, weaponItemId: LUBEC_FISTICUFFS_ID, target: rene }
    view.rerender(<LubecFightModal {...props} request={next} />)
    expect(weaponTrail()?.textContent).toBe('WeaponHunting knife')
    expect(who().value).toBe('character:Wayne')
    view.unmount()
    render(<LubecFightModal {...props} request={next} />)
    expect(weaponTrail()?.textContent).toBe('WeaponFisticuffs')
    expect(who().value).toBe('npc:Rene')
  })

  it('drops from full hands and reopens without the former weapon, target or drop message', async () => {
    function Host() {
      const [items, setItems] = useState([knife, thermos])
      const [open, setOpen] = useState(true)
      return <>
        <button onClick={() => setOpen(true)}>Reopen fight</button>
        {open && <LubecFightModal {...props} request={{ attacker: kid('Tommy', items), target: null }} onClose={() => setOpen(false)} onDrop={async (item) => {
          setItems((held) => held.filter((entry) => entry.id !== item.id))
          return { ok: true }
        }} />}
      </>
    }
    render(<Host />)
    chooseKnife()
    fireEvent.change(who(), { target: { value: 'character:Wayne' } })
    fireEvent.click(weaponTrail() as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Drop Hunting knife, free' }))
    expect((await screen.findByRole('status')).textContent).toContain('It goes to the GM.')
    expect(currentStep()).toBe('1Weapon')
    expect(weaponTrail()).toBeNull()
    expect(screen.queryByRole('button', { name: /Left hand.*Hunting knife/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen fight' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Target/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Fisticuffs/ }))
    expect(who().value).toBe('')
  })
})

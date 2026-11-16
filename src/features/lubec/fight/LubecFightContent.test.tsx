// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeLubecDirectEntryCharacter } from '../../ruleSets/lubec/directEntry'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LubecFightWeaponContent } from './LubecFightWeaponContent'
import { LubecFightTargetContent } from './LubecFightTargetContent'
import { LubecFightWindowContent } from './LubecFightWindowContent'
import { LUBEC_FISTICUFFS_ID, lubecCombatantFightingTraining, type LubecCombatant, type LubecFightRequest } from './lubecFightRequest'

const knife: LubecItem = { id: 'knife', kind: 'weapon', carrier: 'hands', slot: 0, name: 'Knife', size: 1, qty: 1, weight: 'normal', note: '', mode: 'melee', wounds: ['cut', 'pierce'], canThrow: true }
const thing: LubecItem = { ...knife, id: 'radio', kind: 'thing', name: 'Radio', slot: 1 }
function kid(items: LubecItem[] = [], free: string | null = null, picked: string[] = []): LubecCombatant {
  const character = makeLubecDirectEntryCharacter('wayne', { userId: 'wayne', username: 'waynerg' })
  character.name = 'Wayne Gardner'
  character.lubec.gear.items = items
  character.lubec.skills = { free, picked }
  return { kind: 'character', character }
}
const roy: LubecCombatant = { kind: 'npc', npc: { id: 'roy', name: 'Roy Carver', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#000000', size: 34 } }, sheet: null }
const publicRoy: LubecCombatant = { ...roy, summary: { woundLevel: 'Hurt', armor: [{ locs: ['torso'], armor: { blunt: 2, cut: 1, pierce: 0, gun: 0 } }] } }
const request: LubecFightRequest = { attacker: kid([knife, thing]), target: publicRoy, weaponItemId: knife.id, attackId: 'slash' }
const props = { request, targets: [roy], onWeapon: vi.fn(), onAttack: vi.fn(), onTarget: vi.fn(), onInventory: vi.fn() }
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('host-neutral content', () => {
  it('renders Weapon and Target directly in a page with no dialog, focus grab or close handler', () => {
    const choose = vi.fn()
    const drop = vi.fn()
    render(<main><button autoFocus>Keep focus</button><LubecFightWeaponContent attacker={request.attacker} chosen={null} onChoose={choose} drop={drop} busy={false} said="Dropped" /><LubecFightTargetContent target={publicRoy} choices={[roy]} onTarget={choose} /></main>)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep focus' }))
    fireEvent.click(screen.getByRole('button', { name: /Left hand.*Knife/ }))
    expect(choose).toHaveBeenCalledWith('knife')
    fireEvent.click(screen.getByRole('button', { name: 'Drop Knife, free' }))
    expect(drop).toHaveBeenCalledWith('knife')
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('Dropped')
    expect(screen.getByText('Torso')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Who' }), { target: { value: '' } })
    expect(choose).toHaveBeenLastCalledWith('')
  })

  it('uses public target armor in-page and calls the host with combatant keys', () => {
    render(<LubecFightWindowContent {...props} />)
    expect(screen.getByText('Torso')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Roy Carver/ }))
    expect(props.onTarget).toHaveBeenCalledWith('npc:roy')
    fireEvent.click(screen.getByRole('radio', { name: /Stab/ }))
    expect(props.onAttack).toHaveBeenCalledWith('stab')
    fireEvent.click(screen.getByRole('button', { name: /Left hand/ }))
    expect(props.onWeapon).not.toHaveBeenCalled()
    expect(props.onInventory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Right hand/ }))
    expect(screen.getByRole('button', { name: /Right hand/ })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(props.onInventory).toHaveBeenCalledWith('left')
    expect(screen.getByRole('radio', { name: /Slash/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('does not reveal private NPC sheet data when there is only a public summary', () => {
    render(<LubecFightWindowContent {...props} request={{ ...request, target: roy }} />)
    expect(screen.getByText(/No sheet to read here/)).toBeTruthy()
    expect(screen.queryByText('Torso')).toBeNull()
  })

  it('offers only Kick for trained full hands and nothing to an untrained fighter', () => {
    const view = render(<LubecFightWindowContent {...props} request={{ ...request, attacker: kid([knife, thing], null, ['Boxing']), weaponItemId: LUBEC_FISTICUFFS_ID, attackId: 'kick' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kick with full hands' }))
    expect(props.onWeapon).toHaveBeenCalledWith(LUBEC_FISTICUFFS_ID)
    const attacks = () => within(screen.getByRole('radiogroup', { name: 'Attack' }))
    expect(attacks().getAllByRole('radio').map((button) => button.textContent)).toEqual(['KickDefense works in a fight up close'])
    view.rerender(<LubecFightWindowContent {...props} request={{ ...request, weaponItemId: LUBEC_FISTICUFFS_ID }} />)
    expect(attacks().queryAllByRole('radio')).toEqual([])
    expect(screen.queryByRole('button', { name: /Fisticuffs/ })).toBeNull()
    expect(screen.getByText(/free a hand/)).toBeTruthy()
  })

  it('offers Punch and Kick with a free hand and does not select an invalid prior Punch', () => {
    const view = render(<LubecFightWindowContent {...props} request={{ ...request, attacker: kid(), weaponItemId: LUBEC_FISTICUFFS_ID, attackId: undefined }} />)
    expect(screen.queryByRole('button', { name: /Fisticuffs/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /^Punch/ }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: /^Kick/ }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /Left hand.*Empty/ }))
    expect(props.onWeapon).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Right hand.*Empty/ }))
    expect(props.onWeapon).not.toHaveBeenCalled()
    expect(props.onInventory).not.toHaveBeenCalled()
    view.rerender(<LubecFightWindowContent {...props} request={{ ...request, attacker: kid([knife, thing], 'Scrapping'), weaponItemId: LUBEC_FISTICUFFS_ID, attackId: 'punch' }} />)
    expect(screen.queryByRole('radio', { name: /^Punch/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /^Kick/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('shows both hands as one inventory entry and selects a sole ranged attack', () => {
    const bat = { ...knife, size: 2, mode: 'thrown' as const, catchPutsThrowerOut: true }
    render(<LubecFightWindowContent {...props} request={{ ...request, attacker: kid([bat]), attackId: undefined }} />)
    fireEvent.click(screen.getByRole('button', { name: /Both hands/ }))
    expect(props.onWeapon).not.toHaveBeenCalled()
    expect(props.onInventory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(props.onInventory).toHaveBeenCalledWith('both')
    expect(screen.getByRole('radio', { name: /Throw/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('A thrown object: Defense works against it')).toBeTruthy()
    expect(screen.getByText('Catching this puts the thrower out')).toBeTruthy()
  })

  it('lets the host choose between two held weapons and offers firearm metadata', () => {
    const gun = { ...knife, id: 'gun', name: 'Pistol', slot: 1, mode: 'firearm' as const }
    render(<LubecFightWindowContent {...props} request={{ ...request, attacker: kid([knife, gun]), weaponItemId: gun.id, attackId: 'shoot' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Left hand.*Knife/ }))
    expect(props.onWeapon).toHaveBeenCalledWith(knife.id)
    expect(screen.getByText('A firearm: no Defense')).toBeTruthy()
  })

  it('keeps a spectator read-only with the same selections and armor', () => {
    render(<LubecFightWindowContent {...props} request={{ ...request, attacker: kid([knife, thing], 'Scrapping') }} readOnly />)
    for (const button of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) expect(button).toHaveProperty('disabled', true)
    expect(screen.getByText('Torso')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('uses a character target key and the same public wearing content for a GM host', () => {
    const target = kid()
    render(<LubecFightWindowContent {...props} request={{ ...request, target }} targets={[target, roy]} />)
    fireEvent.click(screen.getByRole('radio', { name: /Wayne Gardner.*Character/ }))
    expect(props.onTarget).toHaveBeenCalledWith('character:wayne')
    expect(screen.getByText('Nothing that stops a wound.')).toBeTruthy()
  })

  it('handles an unselected target without inventing armor', () => {
    render(<LubecFightWindowContent {...props} request={{ ...request, target: null, weaponItemId: undefined }} />)
    expect(screen.queryByText(/is wearing/)).toBeNull()
    expect(within(screen.getByRole('radiogroup', { name: 'Attack' })).queryAllByRole('radio')).toEqual([])
    expect(screen.getByRole('radio', { name: /Roy Carver/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('offers several prominent target choices, retains exactly one selection, and supports a sole target', () => {
    const dale: LubecCombatant = { ...roy, npc: { ...roy.npc, id: 'dale', name: 'Dale Ricker' } }
    const tommy: LubecCombatant = { ...roy, npc: { ...roy.npc, id: 'tommy', name: 'Tommy Lyle' } }
    const view = render(<LubecFightWindowContent {...props} focusTarget targets={[roy, dale, tommy]} />)
    expect(screen.getByText('Who are you attacking?')).toBeTruthy()
    expect(screen.getByText('3 available')).toBeTruthy()
    const choices = () => within(screen.getByRole('radiogroup', { name: 'Target' }))
    const originalCards = choices().getAllByRole('radio')
    expect(choices().getAllByRole('radio')).toHaveLength(3)
    expect(choices().getAllByRole('radio', { checked: true })).toHaveLength(1)
    fireEvent.click(choices().getByRole('radio', { name: /Dale Ricker/ }))
    expect(props.onTarget).toHaveBeenCalledWith('npc:dale')
    view.rerender(<LubecFightWindowContent {...props} focusTarget targets={[roy, dale, tommy]} request={{ ...request, target: dale }} />)
    expect(choices().getByRole('radio', { name: /Dale Ricker/ }).getAttribute('aria-checked')).toBe('true')
    expect(choices().getByRole('radio', { name: /Roy Carver/ }).getAttribute('aria-checked')).toBe('false')
    choices().getAllByRole('radio').forEach((card, index) => expect(card).toBe(originalCards[index]))
    view.rerender(<LubecFightWindowContent {...props} focusTarget targets={[roy, dale, tommy]} request={{ ...request, target: tommy }} />)
    expect(choices().getByRole('radio', { name: /Tommy Lyle/ }).getAttribute('aria-checked')).toBe('true')
    choices().getAllByRole('radio').forEach((card, index) => expect(card).toBe(originalCards[index]))
    view.rerender(<LubecFightWindowContent {...props} focusTarget />)
    expect(screen.getByText('1 available')).toBeTruthy()
    expect(choices().getAllByRole('radio')).toHaveLength(1)
    expect(choices().getByRole('radio', { name: /Roy Carver/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('selects an individual free hand for unarmed attacks without opening Inventory', () => {
    const unarmed = { ...request, attacker: kid(), weaponItemId: LUBEC_FISTICUFFS_ID }
    const view = render(<LubecFightWindowContent {...props} request={unarmed} />)
    expect(screen.getByRole('button', { name: /Left hand.*Empty/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Right hand.*Empty/ }))
    expect(props.onWeapon).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Right hand.*Empty/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Left hand.*Empty/ }).getAttribute('aria-pressed')).toBe('false')
    expect(props.onInventory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }))
    expect(props.onInventory).toHaveBeenCalledWith('right')
    view.rerender(<LubecFightWindowContent {...props} request={{ ...unarmed, attacker: kid([knife]) }} />)
    expect(screen.getByRole('button', { name: /Right hand.*Empty/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('preserves Stab when its already selected weapon hand is pressed again', () => {
    render(<LubecFightWindowContent {...props} request={{ ...request, attackId: 'stab' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Left hand.*Knife/ }))
    expect(props.onWeapon).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /^Stab/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the armor region beside the target list as selected armor changes', () => {
    const view = render(<LubecFightWindowContent {...props} focusTarget />)
    const pane = screen.getByRole('region', { name: 'Target armor' })
    expect(pane.parentElement?.className).toBe('target-layout')
    expect(within(pane).getByText('Torso')).toBeTruthy()
    const unarmored = kid()
    view.rerender(<LubecFightWindowContent {...props} focusTarget request={{ ...request, target: unarmored }} targets={[unarmored, roy]} />)
    expect(screen.getByRole('region', { name: 'Target armor' })).toBe(pane)
    expect(within(pane).getByText('Nothing that stops a wound.')).toBeTruthy()
  })
})

describe('fighting training reads', () => {
  it('recognizes either fighting skill in either slot, including an NPC sheet', () => {
    expect(lubecCombatantFightingTraining(kid([], 'Scrapping'))).toBe(true)
    expect(lubecCombatantFightingTraining(kid([], null, ['Boxing']))).toBe(true)
    expect(lubecCombatantFightingTraining(kid([], 'Athletics', ['Throwing Arm']))).toBe(false)
    expect(lubecCombatantFightingTraining(roy)).toBe(false)
    const character = kid([], 'Boxing')
    if (character.kind !== 'character') throw new Error('Expected a character')
    expect(lubecCombatantFightingTraining({ ...roy, sheet: character.character })).toBe(true)
  })
})

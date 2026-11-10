import { useState } from 'react'
import { lubecFreeHands, type LubecHands } from '../../ruleSets/lubec/gear/held'
import { lubecCatchRule } from '../gear/catchLabels'
import { LubecFightPicture } from './LubecFightPicture'
import { LubecFightCardWords, LubecFightGlyph } from './LubecFightWeaponContent'
import { lubecFightCells, lubecFightFists, type LubecFightCell } from './lubecFightWeapons'
import { LUBEC_FISTICUFFS_ID, lubecCombatantFightingTraining, lubecCombatantGear, lubecCombatantWielder, type LubecFightRequest } from './lubecFightRequest'

type HandsProps = { request: LubecFightRequest; onInventory: (hands: LubecHands) => void; onWeapon: (id: string) => void; readOnly?: boolean }
type HandOption = { cell: LubecFightCell; hands: LubecHands; weaponId: string | null }

const FREE_GLYPH = 'M7 11V7.5a1.5 1.5 0 0 1 3 0V10M10 9.5V6.5a1.5 1.5 0 0 1 3 0V10M13 9.5V7a1.5 1.5 0 0 1 3 0v3.5M16 10V9a1.5 1.5 0 0 1 3 0v4.5c0 3.6-2.6 6.5-6.2 6.5h-1.1c-2.2 0-4-1-5.2-2.8L5 15.2a1.6 1.6 0 0 1 2.3-2.1L9 14.5'

const heldWeapon = (cell: LubecFightCell): boolean => cell.kind === 'held' && cell.held.weapon
const weaponOf = (cell: LubecFightCell): string | null => cell.kind === 'free' ? LUBEC_FISTICUFFS_ID : cell.held.weapon ? cell.held.itemId : null
const handOption = (cell: LubecFightCell, index: number): HandOption => ({ cell, hands: cell.kind === 'held' ? cell.held.hands : index === 0 ? 'left' : 'right', weaponId: weaponOf(cell) })

function selectedHand(option: HandOption, weaponId: string | undefined, freeHand: HandOption | undefined): boolean {
  if (option.weaponId !== weaponId) return false
  return option.cell.kind === 'held' || option.hands === freeHand?.hands
}

function HeldWords({ cell }: { cell: Extract<LubecFightCell, { kind: 'held' }> }) {
  return <span>
    <LubecFightCardWords name={cell.held.name} line={cell.line} attack={null} />
    {lubecCatchRule(cell.item).map((rule) => <small className="catch-rule" key={rule}>{rule}</small>)}
  </span>
}

function HandCard({ option, selected, readOnly, onPick }: { option: HandOption; selected: boolean; readOnly?: boolean; onPick: (option: HandOption) => void }) {
  const { cell } = option
  const held = cell.kind === 'held'
  return <button type="button" className={`pick${held ? '' : ' empty'}`} aria-pressed={selected} data-selected={selected} data-weapon={heldWeapon(cell)} disabled={readOnly || option.weaponId === null} onClick={() => onPick(option)}>
    <span className="where">{cell.where}{selected ? ' · attacking with' : ''}</span>
    {held ? <LubecFightPicture item={cell.item} /> : <LubecFightGlyph d={FREE_GLYPH} />}
    {held ? <HeldWords cell={cell} /> : <span><span className="name">Empty</span><small>Unarmed · Punch or kick</small></span>}
  </button>
}

/** A trained fighter's existing Kick remains available even when no hand can select unarmed. */
function FullHandsKick({ request, onWeapon, readOnly }: Omit<HandsProps, 'onInventory'>) {
  const attacker = request.attacker
  const fists = lubecFightFists(lubecCombatantGear(attacker), lubecCombatantWielder(attacker), lubecCombatantFightingTraining(attacker))
  if (!fists.offered || lubecFreeHands(lubecCombatantGear(attacker)) > 0) return null
  return <button className="btn line small" type="button" disabled={readOnly} aria-pressed={request.weaponItemId === LUBEC_FISTICUFFS_ID} onClick={() => onWeapon(LUBEC_FISTICUFFS_ID)}>Kick with full hands</button>
}

/** Hand cards choose an attack source. Inventory is a separate, explicit navigation action. */
export function LubecFightHands({ request, onInventory, onWeapon, readOnly }: HandsProps) {
  const [pickedHand, setPickedHand] = useState<LubecHands>('left')
  const options = lubecFightCells(lubecCombatantGear(request.attacker), lubecCombatantWielder(request.attacker)).map(handOption)
  const free = options.filter((option) => option.cell.kind === 'free')
  const freeHand = free.find((option) => option.hands === pickedHand) ?? free[0]
  const inventoryHand = options.find((option) => selectedHand(option, request.weaponItemId, freeHand)) ?? options[0]
  const pick = (option: HandOption) => {
    if (option.weaponId === null) return
    setPickedHand(option.hands)
    onWeapon(option.weaponId)
  }
  return <div>
    <span className="label">Weapon</span>
    <div className="picks">{options.map((option) => <HandCard key={option.hands} option={option} selected={selectedHand(option, request.weaponItemId, freeHand)} readOnly={readOnly} onPick={pick} />)}</div>
    <div className="weapon-choice">
      <button className="btn line small" type="button" disabled={readOnly} onClick={() => onInventory(inventoryHand.hands)}>Inventory</button>
      <FullHandsKick request={request} onWeapon={onWeapon} readOnly={readOnly} />
    </div>
    <p className="note inventory-hint">Select a hand to attack with it. Use Inventory to change what you hold.</p>
  </div>
}

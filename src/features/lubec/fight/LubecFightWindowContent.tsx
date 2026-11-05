import type { LubecAttackChoice } from '../../ruleSets/lubec/gear/weaponAttacks'
import type { LubecHands } from '../../ruleSets/lubec/gear/held'
import { lubecCatchRule } from '../gear/catchLabels'
import { LubecFightPicture } from './LubecFightPicture'
import { LubecFightCardWords, LubecFightGlyph } from './LubecFightWeaponContent'
import { LubecFightWearingContent } from './LubecFightTargetContent'
import { lubecFightAttacks, lubecFightCells, lubecFightFists, type LubecFightCell } from './lubecFightWeapons'
import { LUBEC_FISTICUFFS_ID, lubecCombatantFace, lubecCombatantFightingTraining, lubecCombatantGear, lubecCombatantKey, lubecCombatantWielder, lubecTargetChoices, type LubecFightRequest, type LubecCombatant } from './lubecFightRequest'
import './lubecFightWindowContent.css'

type WindowProps = {
  request: LubecFightRequest
  targets: readonly LubecCombatant[]
  onTarget: (key: string) => void
  onAttack: (id: string) => void
  /** The host opens the full inventory, with its own return path. */
  onInventory: (hands: LubecHands) => void
  onWeapon: (id: string) => void
  readOnly?: boolean
  /** The words under a target's name; the Combat tab adds Speed, as the mock-up does. */
  targetNote?: (target: LubecCombatant) => string
  /** A badge beside a target's name, such as the Combat tab's "Throws at you". */
  targetBadge?: (target: LubecCombatant) => string | null
}

const kindNote = (target: LubecCombatant): string => (target.kind === 'npc' ? 'NPC' : 'Character')

const TargetBadge = ({ words }: { words: string | null }) => (words ? <span className="badge must">{words}</span> : null)

const noBadge = (): null => null

function WindowTarget({ request, targets, onTarget, readOnly, targetNote = kindNote, targetBadge = noBadge }: WindowProps) {
  const choices = lubecTargetChoices(request, targets)
  return <div>
    <span className="label">Target</span>
    <div className="tlist" role="radiogroup" aria-label="Target">
      {choices.map((target) => <div className="tcell" key={lubecCombatantKey(target)}>
        <button type="button" className="trow" role="radio" aria-checked={request.target !== null && lubecCombatantKey(request.target) === lubecCombatantKey(target)} disabled={readOnly} onClick={() => onTarget(lubecCombatantKey(target))}>
          <span>{lubecCombatantFace(target).name}<br /><small>{targetNote(target)}</small></span>
          <TargetBadge words={targetBadge(target)} />
        </button>
      </div>)}
    </div>
    {request.target ? <LubecFightWearingContent target={request.target} /> : null}
  </div>
}

const FREE_GLYPH = 'M7 11V7.5a1.5 1.5 0 0 1 3 0V10M10 9.5V6.5a1.5 1.5 0 0 1 3 0V10M13 9.5V7a1.5 1.5 0 0 1 3 0v3.5M16 10V9a1.5 1.5 0 0 1 3 0v4.5c0 3.6-2.6 6.5-6.2 6.5h-1.1c-2.2 0-4-1-5.2-2.8L5 15.2a1.6 1.6 0 0 1 2.3-2.1L9 14.5'

function WindowHand({ cell, onInventory, readOnly, selected, hands }: { cell: LubecFightCell; hands: LubecHands; selected: boolean } & Pick<WindowProps, 'onInventory' | 'readOnly'>) {
  const held = cell.kind === 'held'
  return <button type="button" className={`pick${held ? '' : ' empty'}`} data-selected={selected} data-weapon={weaponCell(cell)} disabled={readOnly} onClick={() => onInventory(hands)}>
    <span className="where">{cell.where}{selected ? ' · attacking with' : ''}</span>
    {held ? <LubecFightPicture item={cell.item} /> : <LubecFightGlyph d={FREE_GLYPH} />}
    {held ? <WindowHeldWords cell={cell} /> : <span><span className="name">Empty</span><small>A free hand</small></span>}
  </button>
}

function WindowWeapons({ request, onInventory, onWeapon, readOnly }: WindowProps) {
  const cells = lubecFightCells(lubecCombatantGear(request.attacker), lubecCombatantWielder(request.attacker))
  const weapons = selectableWeapons(cells, request.weaponItemId)
  return <div>
    <span className="label">Weapon</span>
    <div className="picks">
      {cells.map((cell, index) => <WindowHand key={cell.where} cell={cell} hands={cellHands(cell, index)} selected={cell.kind === 'held' && cell.held.itemId === request.weaponItemId} onInventory={onInventory} readOnly={readOnly} />)}
    </div>
    <div className="weapon-choice" aria-label="Attack with">{weapons.map((cell) => <button className="btn line small" type="button" key={cell.held.itemId} aria-pressed={cell.held.itemId === request.weaponItemId} disabled={readOnly} onClick={() => onWeapon(cell.held.itemId)}>{cell.where}</button>)}<WindowFisticuffs request={request} onWeapon={onWeapon} readOnly={readOnly} /></div>
    <p className="note inventory-hint">Tap a hand to open your inventory.</p>
  </div>
}

const cellHands = (cell: LubecFightCell, index: number): LubecHands => cell.kind === 'held' ? cell.held.hands : (index === 0 ? 'left' : 'right')

function WindowAttacks({ request, onAttack, readOnly }: WindowProps) {
  const attacks = lubecFightAttacks(lubecCombatantGear(request.attacker), request.weaponItemId ?? null, lubecCombatantFightingTraining(request.attacker))
  return <div>
    <span className="label">Attack</span>
    <div className="modes" role="radiogroup" aria-label="Attack">
      {attacks.map((attack) => <button className="mode" type="button" role="radio" key={attack.id} aria-checked={attackChecked(request, attacks, attack.id)} disabled={readOnly} onClick={() => onAttack(attack.id)}>
        <b>{attack.name}</b><small>{attackWords(attack)}</small>
      </button>)}
    </div>
    {!attacks.length ? <p className="note">Choose a weapon or free a hand to use Fisticuffs.</p> : null}
  </div>
}

/** Shared selection content only: the host owns Declare, Roll, split and result flow. */
export function LubecFightWindowContent(props: WindowProps) {
  return <div className="lubec-fight-content win-grid">
    <WindowTarget {...props} />
    <WindowWeapons {...props} />
    <WindowAttacks {...props} />
  </div>
}

const attackChecked = (request: LubecFightRequest, attacks: readonly LubecAttackChoice[], id: string): boolean =>
  attackId(request, attacks) === id

const attackId = (request: LubecFightRequest, attacks: readonly LubecAttackChoice[]): string | undefined =>
  request.attackId ?? (attacks.length === 1 ? attacks[0].id : undefined)

function attackWords(attack: LubecAttackChoice): string {
  if (attack.firearm) return 'A firearm: no Defense'
  return attack.ranged ? 'A thrown object: Defense works against it' : 'Defense works in a fight up close'
}

const weaponCell = (cell: LubecFightCell): boolean => cell.kind === 'held' && cell.held.weapon

function WindowHeldWords({ cell }: { cell: Extract<LubecFightCell, { kind: 'held' }> }) {
  return <span>
    <LubecFightCardWords name={cell.held.name} line={cell.line} attack={null} />
    {lubecCatchRule(cell.item).map((rule) => <small className="catch-rule" key={rule}>{rule}</small>)}
  </span>
}

type HeldWeaponCell = Extract<LubecFightCell, { kind: 'held' }>
const heldWeaponCell = (cell: LubecFightCell): cell is HeldWeaponCell => cell.kind === 'held' && cell.held.weapon

function selectableWeapons(cells: readonly LubecFightCell[], selected: string | undefined): HeldWeaponCell[] {
  const weapons = cells.filter(heldWeaponCell)
  return weapons.length > 1 || selected === LUBEC_FISTICUFFS_ID ? weapons : []
}

function WindowFisticuffs({ request, onWeapon, readOnly }: Pick<WindowProps, 'request' | 'onWeapon' | 'readOnly'>) {
  const attacker = request.attacker
  const fists = lubecFightFists(lubecCombatantGear(attacker), lubecCombatantWielder(attacker), lubecCombatantFightingTraining(attacker))
  if (!fists.offered) return null
  return <button className="btn line small" type="button" disabled={readOnly} aria-pressed={request.weaponItemId === LUBEC_FISTICUFFS_ID} onClick={() => onWeapon(LUBEC_FISTICUFFS_ID)}>Fisticuffs · {fists.line}</button>
}

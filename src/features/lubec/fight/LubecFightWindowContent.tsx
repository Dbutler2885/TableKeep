import type { LubecAttackChoice } from '../../ruleSets/lubec/gear/weaponAttacks'
import type { LubecHands } from '../../ruleSets/lubec/gear/held'
import { LubecFightWearingContent } from './LubecFightTargetContent'
import { lubecFightAttacks } from './lubecFightWeapons'
import { LubecFightHands } from './LubecFightHands'
import { lubecCombatantFace, lubecCombatantGear, lubecCombatantHands, lubecCombatantKey, lubecMayKick, lubecTargetChoices, type LubecFightRequest, type LubecCombatant } from './lubecFightRequest'
import { lubecTargetTiles } from './lubecTargetTiles'
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
  /** A declared attack can change only a target or weapon that has gone. */
  targetLocked?: boolean
  weaponLocked?: boolean
  /** Put target selection across the page before weapon and attack choices. */
  focusTarget?: boolean
  /** The words under a target's name; the Combat tab adds Speed, as the mock-up does. */
  targetNote?: (target: LubecCombatant) => string
  /** A badge beside a target's name, such as the Combat tab's "Throws at you". */
  targetBadge?: (target: LubecCombatant) => string | null
}

const kindNote = (target: LubecCombatant): string => (target.kind === 'npc' ? 'NPC' : 'Character')

const noBadge = (): null => null

function TargetTile({ target, chosen, disabled, onTarget, note, badge }: { target: LubecCombatant; chosen: boolean; disabled: boolean; onTarget: (key: string) => void; note: string; badge: string | null }) {
  const name = lubecCombatantFace(target).name
  return <div className="tcell">
    <button type="button" className="trow" role="radio" aria-checked={chosen} disabled={disabled} title={`${name} · ${note}`} onClick={() => onTarget(lubecCombatantKey(target))}>
      {/* A tile's badge takes its second line, the more pressing of the two; the note stays in the title. */}
      <span className="target-words"><b className="target-name">{name}</b>{badge ? <small className="target-badge">{badge}</small> : <small>{note}</small>}</span>
      <span className="target-status" aria-hidden="true">✓ Selected</span>
    </button>
  </div>
}

function MoreTargets({ rest, disabled, onTarget }: { rest: readonly LubecCombatant[]; disabled: boolean; onTarget: (key: string) => void }) {
  if (!rest.length) return null
  return <div className="tcell more">
    <select aria-label="More targets" value="" disabled={disabled} onChange={(event) => { if (event.target.value) onTarget(event.target.value) }}>
      <option value="">+{rest.length} more</option>
      {rest.map((target) => <option key={lubecCombatantKey(target)} value={lubecCombatantKey(target)}>{lubecCombatantFace(target).name}</option>)}
    </select>
  </div>
}

function WindowTarget({ request, targets, onTarget, readOnly, targetLocked, targetNote = kindNote, targetBadge = noBadge, focusTarget }: WindowProps) {
  const choices = lubecTargetChoices(request, targets)
  const chosen = request.target ? lubecCombatantKey(request.target) : null
  const { tiles, rest } = focusTarget ? lubecTargetTiles(choices, chosen) : { tiles: choices, rest: [] }
  const disabled = Boolean(readOnly || targetLocked)
  return <div className="target-section">
    <div className="target-heading"><span className="label">Target</span><p className="target-prompt">Who are you attacking?</p><span className="target-count">{choices.length} available</span></div>
    <div className="target-layout"><div className="tlist" role="radiogroup" aria-label="Target">
      {tiles.map((target) => <TargetTile key={lubecCombatantKey(target)} target={target} chosen={lubecCombatantKey(target) === chosen} disabled={disabled} onTarget={onTarget} note={targetNote(target)} badge={targetBadge(target)} />)}
      <MoreTargets rest={rest} disabled={disabled} onTarget={onTarget} />
    </div><div className="target-armor" role="region" aria-label="Target armor">
      {request.target ? <LubecFightWearingContent target={request.target} limit={focusTarget ? WEAR_ROWS : undefined} /> : <p className="note">Choose a target to see armor.</p>}
    </div></div>
  </div>
}

/** Armor lines the fixed box has room for; the rest open over it. */
const WEAR_ROWS = 3

function WindowAttacks({ request, onAttack, readOnly, weaponLocked }: WindowProps) {
  const attacks = lubecFightAttacks(lubecCombatantGear(request.attacker), request.weaponItemId ?? null, lubecMayKick(request), lubecCombatantHands(request.attacker))
  return <div>
    <span className="label">Attack</span>
    <div className="modes" role="radiogroup" aria-label="Attack">
      {attacks.map((attack) => <button className="mode" type="button" role="radio" key={attack.id} aria-checked={attackChecked(request, attacks, attack.id)} disabled={readOnly || weaponLocked} onClick={() => onAttack(attack.id)}>
        <b>{attack.name}</b><small>{attackWords(attack)}</small>
      </button>)}
    </div>
    {!attacks.length ? <p className="note">Choose a weapon or free a hand to use Fisticuffs. Kicking takes Scrapping or Boxing, or a target on the ground.</p> : null}
  </div>
}

/** Shared selection content only: the host owns Declare, Roll, split and result flow. */
export function LubecFightWindowContent(props: WindowProps) {
  return <div className={`lubec-fight-content win-grid${props.focusTarget ? ' focus-target' : ''}`}>
    <WindowTarget {...props} />
    <LubecFightHands {...props} />
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

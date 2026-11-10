import type { LubecAttackChoice } from '../../ruleSets/lubec/gear/weaponAttacks'
import type { LubecHands } from '../../ruleSets/lubec/gear/held'
import { LubecFightWearingContent } from './LubecFightTargetContent'
import { lubecFightAttacks } from './lubecFightWeapons'
import { LubecFightHands } from './LubecFightHands'
import { lubecCombatantFace, lubecCombatantFightingTraining, lubecCombatantGear, lubecCombatantKey, lubecTargetChoices, type LubecFightRequest, type LubecCombatant } from './lubecFightRequest'
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
  /** Put target selection across the page before weapon and attack choices. */
  focusTarget?: boolean
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
  return <div className="target-section">
    <div className="target-heading"><span className="label">Target</span><p className="target-prompt">Who are you attacking?</p><span className="target-count">{choices.length} available</span></div>
    <div className="target-layout"><div className="tlist" role="radiogroup" aria-label="Target">
      {choices.map((target) => <div className="tcell" key={lubecCombatantKey(target)}>
        <button type="button" className="trow" role="radio" aria-checked={request.target !== null && lubecCombatantKey(request.target) === lubecCombatantKey(target)} disabled={readOnly} onClick={() => onTarget(lubecCombatantKey(target))}>
          <span className="target-words"><b className="target-name">{lubecCombatantFace(target).name}</b><small>{targetNote(target)}</small></span>
          <span className="target-status" aria-hidden="true">✓ Selected</span>
          <TargetBadge words={targetBadge(target)} />
        </button>
      </div>)}
    </div><div className="target-armor" role="region" aria-label="Target armor">
      {request.target ? <LubecFightWearingContent target={request.target} /> : <p className="note">Choose a target to see armor.</p>}
    </div></div>
  </div>
}

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

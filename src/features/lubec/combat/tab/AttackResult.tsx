import type { CombatAttack, CombatAttackRoll, CombatFrozenAim, CombatState } from '../engine/types'
import { aimDefense } from '../engine/attackAim'
import { AttackBar, QualityCall } from './AttackBar'
import { attackSegments, segmentMiddle } from './attackDraft'
import { attackVerdict, combatantName, isThrow, laterSteps, missWords, resultFoot } from './attackWords'
import { CombatStepper, CombatWindow } from './CombatParts'

type Rolled = CombatAttack & { frozen: CombatFrozenAim; roll: CombatAttackRoll }

function RollQuality({ roll, at }: { roll: CombatAttackRoll; at: number }) {
  return roll.quality === null ? null : <QualityCall at={at} quality={roll.quality} />
}

/** The result sequence's first step: the locked split, the roll on it, and what it means. */
function AttackRollStep({ attack, attacker }: { attack: Rolled; attacker: string }) {
  const segments = attackSegments(attack.frozen.total, aimDefense(attack.aim!), attack.range)
  const at = segmentMiddle(segments.attackFrom, segments.attackWidth)
  return (
    <div className="st">
      <div className="sh"><span><span className="no">1</span>Attack roll</span><span>{attacker}</span></div>
      <div className="sb">
        <AttackBar segments={segments} roll={attack.roll} controls={<RollQuality roll={attack.roll} at={at} />} />
        <p className={`verdict ${attack.roll.hit ? 'ok' : 'bad'}`}>{attackVerdict(attack.roll)}</p>
      </div>
    </div>
  )
}

/** A hit names what is still to come; a miss closes with the mock-up's banner. */
function ResultEnd({ attack, attacker }: { attack: Rolled; attacker: string }) {
  if (attack.roll.hit) return <p className="later">{laterSteps(attack.frozen)}</p>
  return <div className="outcome"><h4>A miss</h4><p>{missWords(attacker, attack.frozen)}</p></div>
}

const STEP_NAMES = ['Throw', 'Defense', 'Catch / Location', 'Wound']
const rolled = (attack: CombatAttack): attack is Rolled => attack.frozen != null && attack.roll != null

/**
 * Moment 8, watched by everyone: the attack roll lands, then a miss closes the
 * attack and a hit names the steps still to come. Nobody but the step's owner
 * has a control here.
 */
export function AttackResult({ state, attack }: { state: CombatState; attack: CombatAttack }) {
  if (!rolled(attack)) return null
  const attacker = combatantName(state, attack.attackerKey)
  return (
    <CombatWindow title="Result" stepper={<CombatStepper steps={STEP_NAMES} now={attack.closed ? STEP_NAMES.length : 1} />} foot={<span className="note">{resultFoot(attack)}</span>}>
      <div className="trail">
        <span className="who"><small>{isThrow(attack.frozen) ? 'Thrower' : 'Attacker'}</small>{attacker}</span>
        <span className="who"><small>Target</small>{combatantName(state, attack.aim?.targetKey)}</span>
        <span className="who"><small>{attack.frozen.choice.name}</small>{attack.frozen.weaponName}</span>
      </div>
      <div className="seq">
        <AttackRollStep attack={attack} attacker={attacker} />
        <ResultEnd attack={attack} attacker={attacker} />
      </div>
    </CombatWindow>
  )
}

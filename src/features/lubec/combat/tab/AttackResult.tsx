import type { ReactNode } from 'react'
import { aimDefense } from '../engine/attackAim'
import type { CombatAttack, CombatAttackRoll, CombatFrozenAim, CombatState } from '../engine/types'
import { AttackBar, QualityCall } from './AttackBar'
import { attackSegments, segmentMiddle } from './attackDraft'
import { attackVerdict, combatantName, isThrow, resultFoot } from './attackWords'
import { CombatStepper, CombatWindow } from './CombatParts'
import { OutcomeBanner } from './OutcomeBanner'
import { CatchStep, DefenseStep, LocationStep, WoundStep, type StepControls, type StepProps } from './ResultSteps'
import { activeCard, resultStepperNow, shownCards, stillToCome, STEP_NAMES, type ResultStep } from './resultSequence'

type Rolled = CombatAttack & { frozen: CombatFrozenAim; roll: CombatAttackRoll }

function RollQuality({ roll, at }: { roll: CombatAttackRoll; at: number }) {
  return roll.quality === null ? null : <QualityCall at={at} quality={roll.quality} />
}

/** The result sequence's first step: the locked split, the roll on it, and what it means. */
function AttackRollBody({ attack }: { attack: Rolled }) {
  const segments = attackSegments(attack.frozen.total, aimDefense(attack.aim!), attack.range)
  const at = segmentMiddle(segments.attackFrom, segments.attackWidth)
  return (
    <>
      <AttackBar segments={segments} roll={attack.roll} controls={<RollQuality roll={attack.roll} at={at} />} />
      <p className={`verdict ${attack.roll.hit ? 'ok' : 'bad'}`}>{attackVerdict(attack.roll)}</p>
    </>
  )
}

const STEP_BODIES: Readonly<Record<Exclude<ResultStep, 'attack'>, (props: StepProps) => ReactNode>> = {
  defense: DefenseStep, catch: CatchStep, location: LocationStep, wound: WoundStep,
}

/** Who each card belongs to: the defender for Defense and the catch, otherwise the attacker. */
const ownerOf = (attack: CombatAttack, card: ResultStep): string => (card === 'defense' || card === 'catch' ? attack.aim!.targetKey : attack.attackerKey)

type CardProps = { state: CombatState; attack: Rolled; card: ResultStep; index: number; controls: StepControls | null }

function StepCard({ state, attack, card, index, controls }: CardProps) {
  const active = activeCard(attack) === card
  const Body = card === 'attack' ? null : STEP_BODIES[card]
  return (
    <div className={`st${active ? ' active' : ''}`}>
      <div className="sh"><span><span className="no">{index + 1}</span>{STEP_NAMES[card]}</span><span>{combatantName(state, ownerOf(attack, card))}</span></div>
      <div className="sb">{Body ? <Body state={state} attack={attack} controls={controls} active={active} /> : <AttackRollBody attack={attack} />}</div>
    </div>
  )
}

function ResultEnd({ state, attack }: { state: CombatState; attack: Rolled }) {
  const later = stillToCome(attack)
  if (later) return <p className="later">{later}</p>
  return <OutcomeBanner state={state} attack={attack} />
}

const STEPPER = ['Throw', 'Defense', 'Catch / Location', 'Wound']
const rolled = (attack: CombatAttack): attack is Rolled => attack.frozen != null && attack.roll != null

/**
 * Moment 8, watched by everyone: one card per step reached, the step waiting now in rust with its
 * controls only for whoever owns it, and the outcome once the attack completes.
 */
export function AttackResult({ state, attack, controls = null }: { state: CombatState; attack: CombatAttack; controls?: StepControls | null }) {
  if (!rolled(attack)) return null
  const attacker = combatantName(state, attack.attackerKey)
  return (
    <CombatWindow title="Result" stepper={<CombatStepper steps={STEPPER} now={resultStepperNow(attack)} />} foot={<span className="note">{resultFoot(attack)}</span>}>
      <div className="trail">
        <span className="who"><small>{isThrow(attack.frozen) ? 'Thrower' : 'Attacker'}</small>{attacker}</span>
        <span className="who"><small>Target</small>{combatantName(state, attack.aim?.targetKey)}</span>
        <span className="who"><small>{attack.frozen.choice.name}</small>{attack.frozen.weaponName}</span>
      </div>
      <div className="seq">
        {shownCards(attack).map((card, index) => <StepCard key={card} state={state} attack={attack} card={card} index={index} controls={controls} />)}
        <ResultEnd state={state} attack={attack} />
      </div>
    </CombatWindow>
  )
}

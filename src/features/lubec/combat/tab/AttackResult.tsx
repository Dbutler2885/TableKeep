import type { ReactNode } from 'react'
import { aimDefense } from '../engine/attackAim'
import type { CombatAttack, CombatAttackRoll, CombatFrozenAim, CombatState } from '../engine/types'
import { AttackBar, QualityCall } from './AttackBar'
import { attackSegments, segmentMiddle } from './attackDraft'
import { attackVerdict, combatantName, evasionWords, pairWords, resultFoot } from './attackWords'
import { AttackMatchup } from './AttackMatchup'
import { CombatStepper, CombatWindow } from './CombatParts'
import { CatchStep, CheckStep, DefenseStep, LocationStep, WoundStep, type StepControls, type StepProps } from './ResultSteps'
import { activeCard, cardName, resultProgress, stillToCome, type ResultStep } from './resultSequence'
import { completedResultText } from './completedResultText'
import { ResultsCard } from './ResultsCard'

type Rolled = CombatAttack & { frozen: CombatFrozenAim; roll: CombatAttackRoll }

function RollQuality({ roll, at }: { roll: CombatAttackRoll; at: number }) {
  return roll.quality === null ? null : <QualityCall at={at} quality={roll.quality} />
}

/** The result sequence's first step: the locked split, the roll on it, and what it means. */
function AttackRollBody({ attack }: { attack: Rolled }) {
  const segments = attackSegments(attack.frozen.total, aimDefense(attack.aim!), attack.range, attack.evasion?.penalty ?? 0)
  const at = segmentMiddle(segments.attackFrom, segments.attackWidth)
  return (
    <>
      <AttackBar segments={segments} roll={attack.roll} controls={<RollQuality roll={attack.roll} at={at} />} />
      {attack.evasion ? <p className="say">{evasionWords(attack.evasion)}</p> : null}
      <p className={`verdict ${attack.roll.hit ? 'ok' : 'bad'}`}>{attackVerdict(attack.roll)}</p>
    </>
  )
}

const STEP_BODIES: Readonly<Record<Exclude<ResultStep, 'attack'>, (props: StepProps) => ReactNode>> = {
  defense: DefenseStep, catch: CatchStep, location: LocationStep, wound: WoundStep, check: CheckStep,
}

/** Who each card belongs to: the defender for Defense and the catch, otherwise the attacker. */
const TARGET_CARDS: readonly ResultStep[] = ['defense', 'catch', 'check']
const ownerOf = (attack: CombatAttack, card: ResultStep): string => (TARGET_CARDS.includes(card) ? attack.aim!.targetKey : attack.attackerKey)

type CardProps = { state: CombatState; attack: Rolled; card: ResultStep; index: number; controls: StepControls | null }

function StepCard({ state, attack, card, index, controls }: CardProps) {
  const active = activeCard(attack) === card
  const Body = card === 'attack' ? null : STEP_BODIES[card]
  const heading = <span><span className="no">{index + 1}</span>{cardName(attack, card)}</span>
  const owner = combatantName(state, ownerOf(attack, card))
  const body = <div className="sb">{Body ? <Body state={state} attack={attack} controls={controls} active={active} /> : <AttackRollBody attack={attack} />}</div>
  if (!active) return (
    <details className="st completed">
      <summary className="sh">{heading}<span className="step-result">{completedResultText(attack, card)}</span><span className="step-owner">{owner}</span><span className="step-reveal">Details <i aria-hidden="true" /></span></summary>
      {body}
    </details>
  )
  return (
    <div className="st active">
      <div className="sh">{heading}<span>{owner}</span></div>
      {body}
    </div>
  )
}

/** What is still to come while the attack is open; once it closes, the Results stop. */
function ResultEnd({ state, attack, controls }: { state: CombatState; attack: Rolled; controls: StepControls | null }) {
  const later = stillToCome(attack)
  if (later) return <p className="later">{later}</p>
  return attack.closed ? <ResultsCard state={state} attack={attack} controls={controls} /> : null
}

const rolled = (attack: CombatAttack): attack is Rolled => attack.frozen != null && attack.roll != null

/**
 * Watched by everyone: completed steps collapse, and the current step stays expanded in rust
 * with controls only for its owner. Earlier details remain available without repeating their controls.
 */
export function AttackResult({ state, attack, controls = null }: { state: CombatState; attack: CombatAttack; controls?: StepControls | null }) {
  if (!rolled(attack)) return null
  const attacker = combatantName(state, attack.attackerKey)
  const progress = resultProgress(attack)
  return (
    <CombatWindow title="Result" stepper={<CombatStepper steps={progress.steps} now={progress.now} />} foot={<span className="note">{resultFoot(attack, state.round)}</span>}>
      <AttackMatchup attacker={attacker} target={combatantName(state, attack.aim?.targetKey)} />
      <p className="matchup-context">{pairWords(attack.frozen.choice.name, attack.frozen.weaponName)}</p>
      <div className="seq">
        {progress.cards.map((card, index) => <StepCard key={card} state={state} attack={attack} card={card} index={index} controls={controls} />)}
        <ResultEnd state={state} attack={attack} controls={controls} />
      </div>
    </CombatWindow>
  )
}

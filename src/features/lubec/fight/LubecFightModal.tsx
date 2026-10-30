import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { LubecGearDrop } from '../gear/lubecGearDrop'
import { LubecRoughFilter } from '../LubecRoughFilter'
import { useLubecHandDrop } from '../useLubecHandDrop'
import { LubecFightTargetStep } from './LubecFightTargetStep'
import { LubecFightWeaponStep } from './LubecFightWeaponStep'
import { lubecChosenWeaponName } from './lubecFightWeapons'
import { lubecCombatantFace, lubecCombatantGear, lubecCombatantKey, lubecTargetChoices, type LubecCombatant, type LubecFightRequest } from './lubecFightRequest'
import './lubecFight.css'

const TITLE = 'lubec-fight-title'

// The attack steps past Target wait for the rules still open (G26).
const STEPS = ['Weapon', 'Target', 'Attack', 'Roll', 'Location', 'Result'] as const
const WEAPON_STEP = 0
const TARGET_STEP = 1

const stepClass = (i: number, step: number) => {
  if (i === step) return 'now'
  if (i < step) return 'done'
  return i > TARGET_STEP ? 'off' : ''
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="stepper" aria-label="Steps">
      {STEPS.map((name, i) => (
        <li key={name} className={stepClass(i, step)} aria-current={i === step ? 'step' : undefined} title={i > TARGET_STEP ? `${name}: not yet available` : undefined}>
          <b>{i + 1}</b><span>{name}</span>
        </li>
      ))}
    </ol>
  )
}

type TrailProps = { attacker: LubecCombatant; weaponName: string | null; target: LubecCombatant | null; onStep: (step: number) => void }

// What has been decided so far: who attacks, and each choice, tapped to go back to it.
function Trail({ attacker, weaponName, target, onStep }: TrailProps) {
  return (
    <div className="trail" aria-label="Chosen so far">
      <span className="who"><small>Attacker</small>{lubecCombatantFace(attacker).name}</span>
      {weaponName ? <button type="button" onClick={() => onStep(WEAPON_STEP)}><small>Weapon</small>{weaponName}</button> : null}
      {target ? <button type="button" onClick={() => onStep(TARGET_STEP)}><small>Target</small>{lubecCombatantFace(target).name}</button> : null}
    </div>
  )
}

type FootProps = { step: number; canGoOn: boolean; onStep: (step: number) => void }

// The way on stays at the foot of the modal, and past Target it says why it stops.
function StepFoot({ step, canGoOn, onStep }: FootProps) {
  if (step === WEAPON_STEP) {
    return (
      <div className="step-foot">
        <p className="note">Change what you hold on the <b>Gear</b> page. Dropping is free.</p>
        <button type="button" className="btn rust" disabled={!canGoOn} onClick={() => onStep(TARGET_STEP)}>Next: target</button>
      </div>
    )
  }
  return (
    <div className="step-foot">
      <button type="button" className="btn line small" onClick={() => onStep(WEAPON_STEP)}>Back</button>
      <button type="button" className="btn rust" disabled title="Not yet available">Next: attack</button>
    </div>
  )
}

// Which step, weapon and target are chosen. A weapon that has left the hands is no longer chosen.
function useLubecFightFlow(request: LubecFightRequest, targets: readonly LubecCombatant[]) {
  const gear = lubecCombatantGear(request.attacker)
  const [weaponId, setWeaponId] = useState(request.weaponItemId ?? null)
  const [step, setStep] = useState(() => (lubecChosenWeaponName(gear, request.weaponItemId ?? null) ? TARGET_STEP : WEAPON_STEP))
  const [targetKey, setTargetKey] = useState(() => (request.target ? lubecCombatantKey(request.target) : ''))
  const choices = lubecTargetChoices(request, targets)
  const weaponName = lubecChosenWeaponName(gear, weaponId)
  const chooseWeapon = (id: string) => {
    setWeaponId(id)
    setStep(TARGET_STEP)
  }
  return {
    gear, weaponId, weaponName, choices, chooseWeapon, setStep, setTargetKey,
    step: weaponName ? step : WEAPON_STEP,
    target: choices.find((c) => lubecCombatantKey(c) === targetKey) ?? null,
  }
}

type FightModalProps = {
  request: LubecFightRequest
  /** Who the Target step offers. */
  targets: readonly LubecCombatant[]
  /** Drops a thing from the attacker's hands to the GM's Items tab; null for a viewer who may not. */
  onDrop: LubecGearDrop
  onClose: () => void
}

/**
 * The fight modal: the attack prototype's flow in the sheet's overlay, built
 * from a request and callbacks and loading nothing itself, so any host can
 * mount it. Its Weapon and Target steps are live and write nothing but a drop.
 */
export function LubecFightModal({ request, targets, onDrop, onClose }: FightModalProps) {
  const flow = useLubecFightFlow(request, targets)
  const { busy, said, drop } = useLubecHandDrop(flow.gear, onDrop)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => panel.current?.focus(), [])
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="confirm-overlay lubec-fight-overlay" role="dialog" aria-modal="true" aria-labelledby={TITLE} onKeyDown={closeOnEscape}>
      <LubecRoughFilter />
      <section ref={panel} className="lubec-fight panel rust" tabIndex={-1}>
        <div className="section-head">
          <h2 id={TITLE}>Attack</h2>
          <Stepper step={flow.step} />
          <button className="close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="fight-body">
          <Trail attacker={request.attacker} weaponName={flow.weaponName} target={flow.target} onStep={flow.setStep} />
          {flow.step === WEAPON_STEP
            ? <LubecFightWeaponStep attacker={request.attacker} chosen={flow.weaponId} onChoose={flow.chooseWeapon} drop={drop} busy={busy} said={said} />
            : <LubecFightTargetStep target={flow.target} choices={flow.choices} onTarget={flow.setTargetKey} />}
        </div>
        <StepFoot step={flow.step} canGoOn={flow.weaponName !== null} onStep={flow.setStep} />
      </section>
    </div>
  )
}

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { CombatAttackRoll } from '../engine/types'
import { barPercent, labelPlace, outcomeClass, rollText, type AttackSegments } from './attackDraft'

const SCALE = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

/** The prototype's scale over every bar. */
export function AttackScale() {
  return <div className="allocation-scale" aria-hidden="true">{SCALE.map((n) => <span key={n}>{n}</span>)}</div>
}

const KEY_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10 }

/** Follow the pointer until it is released, wherever it goes, as the prototype's captured drag does. */
function startDrag(bar: HTMLElement, onMove: (amount: number) => void) {
  const move = (event: MouseEvent) => onMove(barPercent(bar.getBoundingClientRect(), event.clientX))
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

type DividerProps = { at: number; onMove: (amount: number) => void }

/** The Defense line's divider: dragged along the bar, or moved with the arrow keys, in tens. */
export function LiveDivider({ at, onMove }: DividerProps) {
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    startDrag(event.currentTarget.parentElement!, onMove)
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = KEY_STEPS[event.key]
    if (step === undefined) return
    event.preventDefault()
    onMove(at + step)
  }
  return <button className="divider" type="button" style={{ left: `${at}%` }} aria-label={`Defense line at ${at}`} onPointerDown={down} onKeyDown={key} />
}

/** A declared split cannot move: the divider stays, locked. */
function LockedDivider({ at }: { at: number }) {
  return <button className="divider locked" type="button" disabled style={{ left: `${at}%` }} aria-label={`Defense line at ${at}`} />
}

type LabelProps = { kind: 'attack' | 'defense'; from: number; width: number; tag: string; value: ReactNode }

function BarLabel({ kind, from, width, tag, value }: LabelProps) {
  const place = labelPlace(from, width)
  return <span className={`allocation-label ${kind} ${place.edge}`} style={{ left: `${place.left}%` }}><small>{tag}</small><strong>{value}</strong></span>
}

function AttackValue({ segments, roll }: { segments: AttackSegments; roll: CombatAttackRoll | null | undefined }) {
  if (!roll) return <>{segments.attackNumber}</>
  return <><span className="roll-result">{rollText(roll.roll)}</span>/{segments.attackNumber}</>
}

function DefenseParts({ defense, onDefense }: { defense: number; onDefense?: (amount: number) => void }) {
  if (defense === 0) return null
  return (
    <>
      <span className="segment defense" style={{ left: 0, width: `${defense}%` }} />
      {onDefense ? <LiveDivider at={defense} onMove={onDefense} /> : <LockedDivider at={defense} />}
    </>
  )
}

type BarProps = {
  segments: AttackSegments
  roll?: CombatAttackRoll | null
  /** Moves the Defense line; absent once the split is locked. */
  onDefense?: (amount: number) => void
  controls: ReactNode
}

/** The attack window's bar: one Handle pool, Defense then the attack, and the Roll button over the attack. */
export function AttackBar({ segments, roll, onDefense, controls }: BarProps) {
  const { defense, attackFrom, attackWidth, edge } = segments
  return (
    <>
      <div className="roll-controls">{controls}</div>
      <AttackScale />
      <div className="allocation-bar">
        <span className={`segment attack ${outcomeClass(roll)}`} style={{ left: `${attackFrom}%`, width: `${attackWidth}%` }} />
        <span className="segment unused" style={{ left: `${edge}%`, width: `${100 - edge}%` }} />
        <div className="effective-edge" style={{ left: `${edge}%` }} />
        <DefenseParts defense={defense} onDefense={onDefense} />
      </div>
      <div className="allocation-labels">
        {defense > 0 ? <BarLabel kind="defense" from={0} width={defense} tag="DEF 1" value={defense} /> : null}
        <BarLabel kind="attack" from={attackFrom} width={attackWidth} tag="ATK" value={<AttackValue segments={segments} roll={roll} />} />
      </div>
    </>
  )
}

/** The Roll button where the prototype puts it, over the middle of the attack. */
export function SegmentRoll({ at, label, disabled, onRoll }: { at: number; label: string; disabled: boolean; onRoll: () => void }) {
  return <button className="segment-roll" type="button" style={{ left: `${at}%` }} disabled={disabled} onClick={onRoll}>{label}</button>
}

/** A hit's quality, called out over the attack. */
export function QualityCall({ at, quality }: { at: number; quality: number }) {
  return <div className="quality-call" role="status" style={{ left: `${at}%` }}>Quality <span className="q">{quality}</span>!</div>
}

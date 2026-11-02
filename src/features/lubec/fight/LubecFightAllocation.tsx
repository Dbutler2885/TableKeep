import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import type { LubecRollSkill } from '../../ruleSets/lubec/checkRoll'
import {
  lubecAllocationLabelPlace,
  lubecAllocationOutcome,
  lubecAllocationPosition,
  lubecAllocationSegments,
  lubecAllocationToolStatus,
  type LubecAllocationSegment,
} from '../../ruleSets/lubec/fightAllocation'
import { LubecSkillChips } from '../LubecSkillStrip'
import type { LubecRoller } from '../useLubecRoller'
import { useLubecFightAllocation, type LubecAllocationRoll, type LubecFightAllocation } from './useLubecFightAllocation'

// The combined prototype's Fight bar below the Effective Handle heading: the
// Defense line tools, a Roll over each part, the 0-100 scale, the bar with
// its parts, lines and the Handle's edge, and each part's label.

const SCALE = Array.from({ length: 11 }, (_, step) => step * 10)

const percent = (value: number): string => `${value}%`

/** The bar position under the pointer, from 1 to the Handle. */
function pointerPosition(bar: RefObject<HTMLDivElement | null>, clientX: number, handle: number): number {
  const bounds = (bar.current as HTMLDivElement).getBoundingClientRect()
  return lubecAllocationPosition((clientX - bounds.left) / bounds.width, handle)
}

const onDivider = (event: { target: EventTarget }): boolean => (event.target as Element).closest('.divider') !== null

// A part's outcome once its roll lands: success or failure, and a double flashing either way.
function segmentClass(segment: LubecAllocationSegment, roll: LubecAllocationRoll | undefined): string {
  const kind = segment.kind === 'attack' ? ['attack'] : ['defense', ...(segment.alt ? ['alt'] : [])]
  if (!roll || roll.preview !== null) return ['segment', ...kind].join(' ')
  const { success, double } = lubecAllocationOutcome(roll.result, segment.size)
  return ['segment', ...kind, ...(double ? ['double'] : []), success ? 'success' : 'failure'].join(' ')
}

type ToolbarProps = { allocation: LubecFightAllocation; skills: readonly LubecRollSkill[]; roller: LubecRoller | null; onReset: () => void }

function LubecAllocationToolbar({ allocation, skills, roller, onReset }: ToolbarProps) {
  const tool = (mode: 'place' | 'remove', label: string) => (
    <button
      className={allocation.mode === mode ? 'combat-tool active' : 'combat-tool'}
      type="button"
      aria-pressed={allocation.mode === mode}
      onClick={() => allocation.toggleMode(mode)}
    >
      {label}
    </button>
  )
  return (
    <div className="combat-toolbar">
      {tool('place', '+ Defense line')}
      {tool('remove', 'Remove line')}
      <button className="combat-tool" type="button" onClick={onReset}>Reset</button>
      <span className="tool-status">{lubecAllocationToolStatus(allocation.mode)}</span>
      {roller && skills.length > 0 ? <LubecSkillChips skills={skills} roller={roller} label="Add a skill to the fight" /> : null}
    </div>
  )
}

type PartsProps = { segments: readonly LubecAllocationSegment[]; rolls: LubecFightAllocation['rolls'] }

function LubecAllocationRolls({ segments, rolls, onRoll }: PartsProps & { onRoll: ((index: number) => void) | null }) {
  return (
    <div className="roll-controls">
      {onRoll ? segments.map((segment) => (
        <button
          key={segment.index}
          className="segment-roll"
          type="button"
          style={{ left: percent(segment.start + segment.size / 2) }}
          disabled={(rolls[segment.index]?.preview ?? null) !== null}
          aria-label={`Roll ${segment.name}`}
          onClick={() => onRoll(segment.index)}
        >
          Roll
        </button>
      )) : null}
    </div>
  )
}

function LubecAllocationLabels({ segments, rolls }: PartsProps) {
  return (
    <div className="allocation-labels" aria-live="polite">
      {segments.map((segment) => {
        const { left, edge } = lubecAllocationLabelPlace(segment)
        const roll = rolls[segment.index]
        return (
          <span key={segment.index} className={['allocation-label', segment.kind, ...(edge ? [edge] : [])].join(' ')} style={{ left: percent(left) }}>
            <small>{segment.name}</small>
            <strong>{roll ? <><span className="roll-result">{roll.preview ?? roll.result}</span>/{segment.size}</> : segment.size}</strong>
          </span>
        )
      })}
    </div>
  )
}

type BarProps = PartsProps & { allocation: LubecFightAllocation; handle: number }

function LubecAllocationBar({ segments, rolls, allocation, handle }: BarProps) {
  const bar = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const placing = allocation.mode === 'place' && handle >= 1
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) =>
    setPreview(placing && !onDivider(event) ? pointerPosition(bar, event.clientX, handle) : null)
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (placing && !onDivider(event)) allocation.place(pointerPosition(bar, event.clientX, handle))
  }
  const modeClass = allocation.mode === 'place' ? ' placing' : allocation.mode === 'remove' ? ' removing' : ''
  return (
    <div ref={bar} className={`allocation-bar${modeClass}`} onPointerMove={onPointerMove} onPointerLeave={() => setPreview(null)} onClick={onClick}>
      <div>
        {segments.map((segment) => (
          <span key={segment.index} className={segmentClass(segment, rolls[segment.index])} style={{ left: percent(segment.start), width: percent(segment.size) }} />
        ))}
        {handle < 100 ? <span className="segment unused" style={{ left: percent(handle), width: percent(100 - handle) }} /> : null}
      </div>
      <div className="effective-edge" style={{ left: percent(handle) }} />
      <div className={placing && preview !== null ? 'preview visible' : 'preview'} style={preview === null ? undefined : { left: percent(preview) }} />
      <LubecAllocationDividers bar={bar} allocation={allocation} handle={handle} />
    </div>
  )
}

type DividerProps = { bar: RefObject<HTMLDivElement | null>; allocation: LubecFightAllocation; handle: number }

// A line past the Handle stays where it was, off the bar, until the Handle reaches it again.
function LubecAllocationDividers({ bar, allocation, handle }: DividerProps) {
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    if (allocation.mode === 'remove') {
      allocation.remove(index)
      return
    }
    const move = (moved: globalThis.PointerEvent) => allocation.move(index, pointerPosition(bar, moved.clientX, handle))
    const finish = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Delete' || event.key === 'Backspace') allocation.remove(index)
  }
  return (
    <div>
      {allocation.positions.map((position, index) => (position > handle ? null : (
        <button
          key={index}
          className="divider"
          type="button"
          style={{ left: percent(position) }}
          aria-label={`Defense divider at ${position}`}
          onPointerDown={(event) => onPointerDown(event, index)}
          onKeyDown={(event) => onKeyDown(event, index)}
        />
      )))}
    </div>
  )
}

type AllocationProps = {
  /** The Handle the bar divides, the armed skill's bonus included. */
  handle: number
  /** The skills the fight can take; armed, one adds to the Handle. */
  skills: readonly LubecRollSkill[]
  /** Null for a viewer who may not roll on the character: the bar divides, but nothing rolls. */
  roller: LubecRoller | null
}

/**
 * The prototype's allocation tools and bar. Reset clears the lines, the rolls
 * and the tool, and spends the armed skill, as a roll spends it on a Stat Check.
 */
export function LubecFightAllocation({ handle, skills, roller }: AllocationProps) {
  const allocation = useLubecFightAllocation(handle)
  const segments = lubecAllocationSegments(allocation.positions, handle)
  const reset = () => {
    allocation.reset()
    if (roller?.armed) roller.toggleArmed(roller.armed)
  }
  return (
    <>
      <LubecAllocationToolbar allocation={allocation} skills={skills} roller={roller} onReset={reset} />
      <section className="allocation-stage" aria-label="Handle allocation">
        <LubecAllocationRolls segments={segments} rolls={allocation.rolls} onRoll={roller ? allocation.roll : null} />
        <div className="allocation-scale" aria-hidden="true">{SCALE.map((mark) => <span key={mark}>{mark}</span>)}</div>
        <LubecAllocationBar segments={segments} rolls={allocation.rolls} allocation={allocation} handle={handle} />
        <LubecAllocationLabels segments={segments} rolls={allocation.rolls} />
        <p className="combat-instruction">Place or remove lines. Drag any divider to redivide the bar.</p>
      </section>
    </>
  )
}

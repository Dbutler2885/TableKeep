import { useId, type KeyboardEvent } from 'react'
import { BODY_REGIONS, locName } from '../../../ruleSets/lubec/gear/gearRules'
import bodyInk from '../../gear/assets/body-ink.webp'
import bodyMask from '../../gear/assets/body-mask.png'

// The attack prototype's doll(): the Gear page's 17 parts, the parts in reach
// shaded blue, the chosen part rust, a crosshair where the hit landed and the
// quality each other part in reach costs written on it.

const PARTS = Object.keys(BODY_REGIONS)

/** Where a part's crosshair and cost sit in the 620x1290 drawing. */
const ANCHOR: Readonly<Record<string, readonly [number, number]>> = {
  head: [310, 103], neck: [310, 213], torso: [310, 362], waist: [310, 514], groin: [310, 600],
  'upperarm-R': [165, 395], 'upperarm-L': [455, 395], 'forearm-R': [135, 499], 'forearm-L': [485, 499],
  'hand-R': [78, 671], 'hand-L': [542, 671], 'thigh-R': [241, 697], 'thigh-L': [379, 697],
  'shin-R': [217, 990], 'shin-L': [403, 990], 'feet-R': [205, 1230], 'feet-L': [415, 1230],
}

const small = (part: string) => /^(hand|feet|neck)/.test(part)

function Cross({ part }: { part: string }) {
  const [x, y] = ANCHOR[part]
  const r = small(part) ? 22 : 30
  const shape = <><circle cx={x} cy={y} r={r} /><path d={`M${x - r - 16} ${y}h${r * 2 + 32}M${x} ${y - r - 16}v${r * 2 + 32}`} /></>
  return <><g className="cross-ink">{shape}</g><g className="cross">{shape}</g></>
}

type DollProps = {
  start: string
  chosen: string
  /** Steps from the landing to each part; the parts within `reach` are shaded and, when live, pickable. */
  distances: Readonly<Record<string, number>>
  reach: number
  onPick: ((part: string) => void) | null
}

function Cost({ part, cost, on }: { part: string; cost: number; on: boolean }) {
  const [x, y] = ANCHOR[part]
  return <text className={`cost${small(part) ? ' sm' : ''}${on ? ' on' : ''}`} x={x} y={y}>−{cost}</text>
}

const pickOnKey = (onPick: (part: string) => void, part: string) => (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onPick(part)
}

type HitProps = { part: string; chosen: string; label: string }

/** A part the attacker may move the hit to. */
function PickableHit({ part, chosen, label, onPick }: HitProps & { onPick: (part: string) => void }) {
  return (
    <polygon className="hit" points={BODY_REGIONS[part]} role="radio" aria-checked={part === chosen} aria-label={label} tabIndex={0} onClick={() => onPick(part)} onKeyDown={pickOnKey(onPick, part)}>
      <title>{label}</title>
    </polygon>
  )
}

/** A part out of reach, or any part for a viewer who only watches. */
function StillHit({ part, chosen, label }: HitProps) {
  return <polygon className="hit" points={BODY_REGIONS[part]} role="radio" aria-checked={part === chosen} aria-disabled aria-label={label} tabIndex={-1}><title>{label}</title></polygon>
}

function HitPart({ live, onPick, ...hit }: HitProps & { live: boolean; onPick: ((part: string) => void) | null }) {
  return live && onPick ? <PickableHit {...hit} onPick={onPick} /> : <StillHit {...hit} />
}

const partLabel = (part: string, inReach: boolean, left: number) => `${locName(part)}: ${inReach ? `quality ${left}` : 'out of reach'}`

/** The paper doll for placing a hit: where it landed, what is in reach, and what moving it costs. */
export function CombatDoll({ start, chosen, distances, reach, onPick }: DollProps) {
  const mask = useId()
  const inReach = (part: string) => distances[part] <= reach
  return (
    <svg className="body-map" viewBox="0 0 620 1290" role="radiogroup" aria-label="Where it lands">
      <defs><mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="620" height="1290"><image href={bodyMask} width="620" height="1290" /></mask></defs>
      <g mask={`url(#${mask})`}>
        <rect className="base" width="620" height="1290" />
        {PARTS.map((part) => <polygon key={part} className={inReach(part) ? 'reach' : 'out'} points={BODY_REGIONS[part]} />)}
        <polygon className="landed" points={BODY_REGIONS[chosen]} />
      </g>
      <image href={bodyInk} width="620" height="1290" pointerEvents="none" />
      <Cross part={start} />
      {PARTS.filter((part) => part !== start && inReach(part) && distances[part] > 0).map((part) => <Cost key={part} part={part} cost={distances[part]} on={part === chosen} />)}
      <text className="side-label" x="18" y="300">R</text><text className="side-label" x="572" y="300">L</text>
      {PARTS.map((part) => <HitPart key={part} part={part} chosen={chosen} live={inReach(part)} label={partLabel(part, inReach(part), reach - distances[part])} onPick={onPick} />)}
    </svg>
  )
}

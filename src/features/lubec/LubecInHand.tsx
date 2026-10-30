import type { LubecGear } from '../ruleSets/lubec/gear/gearRecord'
import type { LubecAttackHandle, LubecHandleTerm } from '../ruleSets/lubec/gear/handPenalty'
import type { LubecWielder } from '../ruleSets/lubec/gear/minStrength'
import type { LubecGearDrop } from './gear/lubecGearDrop'
import { LUBEC_FISTICUFFS_ID } from './fight/lubecFightRequest'
import { useLubecFightStart, type LubecFightStart } from './fight/lubecFightStart'
import { lubecHandChips, type LubecHandChip } from './lubecHandChips'
import { LubecNumber } from './LubecMissing'
import { useLubecHandDrop } from './useLubecHandDrop'

const TERM_NAMES: Readonly<Record<LubecHandleTerm['term'], string>> = { handle: 'Handle', 'min-strength': 'min. Strength', gloves: 'gloves' }

// A Handle below 0 is written with B's minus sign, as the weapon card writes it.
const totalOf = (n: number | null) => (n !== null && n < 0 ? `−${-n}` : <LubecNumber value={n} />)

/** "Handle 55 − 20 min. Strength − 10 gloves = 25", and "Cannot handle this" at 0 or less. */
export function LubecHandleTerms({ attack }: { attack: LubecAttackHandle }) {
  const [first, ...rest] = attack.terms
  return (
    <span className="lubec-handle-terms">
      {TERM_NAMES[first.term]} <LubecNumber value={first.value} />
      {rest.map((t) => <span key={t.term}> − <LubecNumber value={t.value} /> {TERM_NAMES[t.term]}</span>)}
      {rest.length ? <> = {totalOf(attack.total)}</> : null}
      {attack.cannotHandle ? <span className="lubec-cannot-handle"> Cannot handle this</span> : null}
    </span>
  )
}

type Dropping = { busy: boolean; drop: ((itemId: string) => void) | null }

// A thing held: a weapon's chip is a button that opens the fight modal with it, for a viewer who may fight; anything else only shows.
function HeldChip({ chip, dropping, start }: { chip: Extract<LubecHandChip, { kind: 'held' }>; dropping: Dropping; start: LubecFightStart | null }) {
  const body = <><span>{chip.text}</span>{chip.attack ? <LubecHandleTerms attack={chip.attack} /> : null}</>
  const shown = chip.attack && start
    ? <button className="lubec-hand-chip weapon" type="button" onClick={() => start(chip.held.itemId)}>{body}</button>
    : <span className="lubec-hand-chip">{body}</span>
  if (!chip.droppable || !dropping.drop) return shown
  const drop = dropping.drop
  return (
    <span className="lubec-hand-held">
      {shown}
      <button className="lubec-hand-drop" type="button" disabled={dropping.busy} aria-label={`Drop ${chip.held.name}, free`} onClick={() => drop(chip.held.itemId)}>
        Drop it, free
      </button>
    </span>
  )
}

function FisticuffsChip({ attack, start }: { attack: LubecAttackHandle; start: LubecFightStart | null }) {
  const body = <><span>Fisticuffs</span><LubecHandleTerms attack={attack} /></>
  if (!start) return <span className="lubec-hand-chip">{body}</span>
  return <button className="lubec-hand-chip weapon" type="button" onClick={() => start(LUBEC_FISTICUFFS_ID)}>{body}</button>
}

function HandChip({ chip, dropping, start }: { chip: LubecHandChip; dropping: Dropping; start: LubecFightStart | null }) {
  if (chip.kind === 'held') return <HeldChip chip={chip} dropping={dropping} start={start} />
  if (chip.kind === 'empty') return <span className="lubec-hand-chip empty">{chip.text}</span>
  if (chip.kind === 'fisticuffs-greyed') return <button className="lubec-hand-chip weapon" type="button" disabled><span>Fisticuffs</span><span className="lubec-handle-terms">{chip.text}</span></button>
  return <FisticuffsChip attack={chip.attack} start={start} />
}

type InHandProps = { gear: LubecGear; wielder: LubecWielder; onDrop: LubecGearDrop }

/** The Fight bar's "In hand": a chip for each hand, left first, then Fisticuffs, each weapon with its attack's Handle. */
export function LubecInHand({ gear, wielder, onDrop }: InHandProps) {
  const { busy, said, drop } = useLubecHandDrop(gear, onDrop)
  const start = useLubecFightStart()
  return (
    <div className="lubec-hands">
      <span className="eyebrow">In hand</span>
      <div className="lubec-in-hand">
        {lubecHandChips(gear, wielder).map((chip, k) => <HandChip key={k} chip={chip} dropping={{ busy, drop }} start={start} />)}
      </div>
      {said ? <p className="lubec-hand-said" role="status">{said}</p> : null}
    </div>
  )
}

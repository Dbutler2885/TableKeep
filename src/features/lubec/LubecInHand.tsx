import { useState } from 'react'
import type { LubecGear, LubecItem } from '../ruleSets/lubec/gear/gearRecord'
import type { LubecAttackHandle, LubecHandleTerm } from '../ruleSets/lubec/gear/handPenalty'
import type { LubecWielder } from '../ruleSets/lubec/gear/minStrength'
import type { LubecGearDrop } from './gear/lubecGearDrop'
import { lubecDroppedToast } from './gear/moveLabels'
import { lubecHandChips, type LubecHandChip } from './lubecHandChips'
import { LubecNumber } from './LubecMissing'

const TERM_NAMES: Readonly<Record<LubecHandleTerm['term'], string>> = { handle: 'Handle', 'min-strength': 'min. Strength', gloves: 'gloves' }

// A Handle below 0 is written with B's minus sign, as the weapon card writes it.
const totalOf = (n: number | null) => (n !== null && n < 0 ? `−${-n}` : <LubecNumber value={n} />)

// "Handle 55 − 20 min. Strength − 10 gloves = 25", and "Cannot handle this" at 0 or less.
function HandleTerms({ attack }: { attack: LubecAttackHandle }) {
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

// A thing held: a weapon's chip is a button, which opens the fight modal once it lands; anything else only shows.
function HeldChip({ chip, dropping }: { chip: Extract<LubecHandChip, { kind: 'held' }>; dropping: Dropping }) {
  const body = <><span>{chip.text}</span>{chip.attack ? <HandleTerms attack={chip.attack} /> : null}</>
  const shown = chip.attack ? <button className="lubec-hand-chip weapon" type="button">{body}</button> : <span className="lubec-hand-chip">{body}</span>
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

function HandChip({ chip, dropping }: { chip: LubecHandChip; dropping: Dropping }) {
  if (chip.kind === 'held') return <HeldChip chip={chip} dropping={dropping} />
  if (chip.kind === 'empty') return <span className="lubec-hand-chip empty">{chip.text}</span>
  if (chip.kind === 'fisticuffs-greyed') return <button className="lubec-hand-chip weapon" type="button" disabled><span>Fisticuffs</span><span className="lubec-handle-terms">{chip.text}</span></button>
  return <button className="lubec-hand-chip weapon" type="button"><span>Fisticuffs</span><HandleTerms attack={chip.attack} /></button>
}

// What a drop says once its transaction is done: the Gear page's toast, or why nothing changed.
async function dropSaying(onDrop: Exclude<LubecGearDrop, null>, item: LubecItem): Promise<string> {
  const r = await onDrop(item).catch(() => ({ ok: false as const, msg: `Could not drop ${item.name}. Nothing changed.` }))
  return r.ok ? lubecDroppedToast(item) : r.msg
}

// A drop from a hand crosses to the GM's Items tab, so it waits on its transaction and then says what happened.
function useLubecHandDrop(gear: LubecGear, onDrop: LubecGearDrop) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const run = async (dropper: Exclude<LubecGearDrop, null>, item: LubecItem) => {
    setBusy(true)
    setSaid(await dropSaying(dropper, item))
    setBusy(false)
  }
  const drop = onDrop && ((itemId: string) => {
    const item = gear.items.find((i) => i.id === itemId)
    if (item && !busy) void run(onDrop, item)
  })
  return { busy, said, drop }
}

type InHandProps = { gear: LubecGear; wielder: LubecWielder; onDrop: LubecGearDrop }

/** The Fight bar's "In hand": a chip for each hand, left first, then Fisticuffs, each weapon with its attack's Handle. */
export function LubecInHand({ gear, wielder, onDrop }: InHandProps) {
  const { busy, said, drop } = useLubecHandDrop(gear, onDrop)
  return (
    <div className="lubec-hands">
      <span className="eyebrow">In hand</span>
      <div className="lubec-in-hand">
        {lubecHandChips(gear, wielder).map((chip, k) => <HandChip key={k} chip={chip} dropping={{ busy, drop }} />)}
      </div>
      {said ? <p className="lubec-hand-said" role="status">{said}</p> : null}
    </div>
  )
}

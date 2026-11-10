import { byInitiative } from '../engine/initiative'
import type { Combatant, CombatState } from '../engine/types'
import { combatantRole } from './combatPhases'
import { CombatPanel } from './CombatParts'

const pad = (value: number) => String(value).padStart(2, '0')

const OUT_WORDS: Readonly<Record<string, string>> = { wound: 'wounded', caught: 'caught', left: 'left the fight', gm: 'taken out by the GM' }

/** "Out: caught", why someone is Out. */
const outWords = (combatant: Combatant): string => (combatant.outReason === null ? '' : ` · Out: ${OUT_WORDS[combatant.outReason]}`)

/** "Player · Speed 52 · rolled 38 under", once a combatant has rolled, and why they are Out. */
function rowWords(combatant: Combatant, userId: string): string {
  const rolled = combatant.initiative
  const roll = rolled ? ` · rolled ${pad(rolled.roll)} ${rolled.success ? 'under' : 'over'}` : ''
  return `${combatantRole(combatant, userId)} · Speed ${combatant.speed}${roll}${outWords(combatant)}`
}

function RowBadge({ out, now }: { out: boolean; now: boolean }) {
  if (out) return <span className="badge rust">Out</span>
  return now ? <span className="badge must">Now</span> : null
}

type RowProps = { combatant: Combatant; place: number | null; userId: string; now: boolean; onOut?: (combatant: Combatant) => void }

function ManageCombatant({ combatant, onOut }: Pick<RowProps, 'combatant' | 'onOut'>) {
  if (!onOut) return null
  const label = combatant.outReason === null ? 'Take out' : 'Return'
  return <span className="combatant-action"><button type="button" className="btn line small" aria-label={`${label} ${combatant.name}`} onClick={() => onOut(combatant)}>{label}</button></span>
}

function TurnRow({ combatant, place, userId, now, onOut }: RowProps) {
  const out = combatant.outReason !== null
  return (
    <li className={`${combatant.kind === 'character' || combatant.ally ? 'friend' : 'foe'}${out ? ' out' : now ? ' now' : ''}`}>
      <span className="n">{place ?? '·'}</span>
      <span><span className="nm">{combatant.name}</span><small>{rowWords(combatant, userId)}</small></span>
      <span><RowBadge out={out} now={now} /></span>
      <ManageCombatant combatant={combatant} onOut={onOut} />
    </li>
  )
}

/** Who acts now in the turn order: the declarer during Declare, the attacker whose turn it is during Attack. */
const ACTING: Readonly<Record<string, (state: CombatState) => string | undefined>> = {
  declare: (state) => state.pendingActions?.find((action) => action.action === 'declare' || action.action === 'reviewDeclaration')?.combatantKey,
  attack: (state) => state.attack?.attackerKey,
}

const actingKey = (state: CombatState): string | undefined => ACTING[state.phase]?.(state)

type Ordered = { title: string; sub: string; rows: { combatant: Combatant; place: number | null }[]; note: boolean }

/** Before initiative nobody has an order; while rolling it builds as people roll; then it is fastest first. */
function ordered(state: CombatState): Ordered {
  if (state.order) {
    const rows = state.order.map((key, index) => ({ combatant: state.combatants.find((entry) => entry.key === key)!, place: index + 1 }))
    const rest = state.combatants.filter((entry) => !state.order!.includes(entry.key)).map((combatant) => ({ combatant, place: null }))
    return { title: 'Turn order', sub: 'fastest first', rows: [...rows, ...rest], note: true }
  }
  if (state.phase !== 'initiative') return { title: 'In the fight', sub: 'no order yet', rows: state.combatants.map((combatant) => ({ combatant, place: null })), note: false }
  const rolled = byInitiative(state.combatants)
  const rows = [...rolled.map((combatant, index) => ({ combatant, place: index + 1 })), ...state.combatants.filter((entry) => !entry.initiative).map((combatant) => ({ combatant, place: null }))]
  return { title: 'Turn order', sub: 'as they roll', rows, note: false }
}

/** The left rail: everyone in the fight, then the turn order as it builds and once it is set. */
export function TurnOrderPanel({ state, userId, onOut }: { state: CombatState; userId: string; onOut?: (combatant: Combatant) => void }) {
  const [managing, setManaging] = useState(false)
  const id = useId()
  const view = ordered(state)
  const now = actingKey(state)
  return (
    <CombatPanel title={view.title} sub={view.sub}>
      {onOut ? <div className="panel-actions"><button type="button" className="btn line small" aria-expanded={managing} aria-controls={id} onClick={() => setManaging(!managing)}>{managing ? 'Done managing' : 'Manage combatants'}</button></div> : null}
      <ul className="turns" id={id}>{view.rows.map(({ combatant, place }) => <TurnRow key={combatant.key} combatant={combatant} place={place} userId={userId} now={combatant.key === now} onOut={managing ? onOut : undefined} />)}</ul>
      {view.note ? <div className="pb"><p className="note">Successes go before failures: higher successes first, lower failures first.</p></div> : null}
    </CombatPanel>
  )
}
import { useId, useState } from 'react'

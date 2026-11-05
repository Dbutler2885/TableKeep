import { byInitiative } from '../engine/initiative'
import type { Combatant, CombatState } from '../engine/types'
import { combatantRole } from './combatPhases'
import { CombatPanel } from './CombatParts'

const pad = (value: number) => String(value).padStart(2, '0')

/** "Player · Speed 52 · rolled 38 under", once a combatant has rolled. */
function rowWords(combatant: Combatant, userId: string): string {
  const rolled = combatant.initiative
  const roll = rolled ? ` · rolled ${pad(rolled.roll)} ${rolled.success ? 'under' : 'over'}` : ''
  return `${combatantRole(combatant, userId)} · Speed ${combatant.speed}${roll}`
}

function RowBadge({ out, now }: { out: boolean; now: boolean }) {
  if (out) return <span className="badge rust">Out</span>
  return now ? <span className="badge must">Now</span> : null
}

type RowProps = { combatant: Combatant; place: number | null; userId: string; now: boolean }

function TurnRow({ combatant, place, userId, now }: RowProps) {
  const out = combatant.outReason !== null
  return (
    <li className={out ? 'out' : now ? 'now' : ''}>
      <span className="n">{place ?? '·'}</span>
      <span><span className="nm">{combatant.name}</span><small>{rowWords(combatant, userId)}</small></span>
      <span><RowBadge out={out} now={now} /></span>
    </li>
  )
}

/** Who acts now in the turn order: the declarer during Declare. */
const actingKey = (state: CombatState): string | undefined =>
  (state.phase === 'declare' ? state.pendingActions?.find((action) => action.action === 'declare')?.combatantKey : undefined)

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
export function TurnOrderPanel({ state, userId }: { state: CombatState; userId: string }) {
  const view = ordered(state)
  const now = actingKey(state)
  return (
    <CombatPanel title={view.title} sub={view.sub}>
      <ul className="turns">{view.rows.map(({ combatant, place }) => <TurnRow key={combatant.key} combatant={combatant} place={place} userId={userId} now={combatant.key === now} />)}</ul>
      {view.note ? <div className="pb"><p className="note">Successes go before failures: higher successes first, lower failures first.</p></div> : null}
    </CombatPanel>
  )
}

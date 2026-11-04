import { useEffect, useState } from 'react'
import { useCombatLogView } from './CombatLogContext'
import { combatLogText, combatLogTime, type CombatLogEntry } from './combatLog'
import type { Role } from '../../../types/app'
import { combatActionNotice, combatActionText, type ViewerCombatAction } from './pendingActions'

function CombatRollCard({ entry }: { entry: CombatLogEntry }) {
  const [phase, setPhase] = useState('')
  useEffect(() => {
    const fade = setTimeout(() => setPhase('gone'), 6500)
    const remove = setTimeout(() => setPhase('removed'), 7100)
    return () => { clearTimeout(fade); clearTimeout(remove) }
  }, [])
  if (phase === 'removed') return null
  const roll = entry.roll
  if (!roll) return <div className={`rcard neutral ${phase}`}><div className="rw">Table</div><p className="rx">{entry.event}</p></div>
  return (
    <div className={`rcard ${roll.tone} ${phase}`}>
      <div className="rw">{roll.who} · {roll.what}</div>
      <div className="rn"><b>{roll.roll}</b><span>{roll.target}</span></div>
      <span className="rr">{roll.result}</span>
      {roll.extra ? <p className="rx">{roll.extra}</p> : null}
    </div>
  )
}

export function CombatRollCards() {
  const { cards } = useCombatLogView()
  return <div className="combat-cards" role="status" aria-live="polite" aria-relevant="additions">{cards.map((entry) => <CombatRollCard key={entry.id} entry={entry} />)}</div>
}

/** The latest entry stays visible; the whole immutable log opens newest first, as in the mock-up. */
export function CombatTicker() {
  const { entries } = useCombatLogView()
  const [open, setOpen] = useState(false)
  const last = entries.at(-1)
  return (
    <div className="ctick">
      <button type="button" className="ticker" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="label">Table</span><span className="text">{last ? `${combatLogTime(last)} ${combatLogText(last)}` : 'Nothing yet this fight.'}</span><span className="more">All {entries.length}</span>
      </button>
      <ol className="ticker-list" hidden={!open}>{[...entries].reverse().map((entry) => <li key={entry.id}><time>{combatLogTime(entry)}</time><span>{combatLogText(entry)}</span></li>)}</ol>
    </div>
  )
}

export function CombatTurnNotice({ actions, round = 1, role = 'player', onReturn }: { actions: ViewerCombatAction[]; round?: number; role?: Role | null; onReturn: () => void }) {
  if (actions.length === 0) return null
  return (
    <button type="button" className="yourturn" onClick={onReturn} aria-label="Your turn. Go to the Combat tab">
      <b>Your turn</b><span>{actions.map((action) => <span className="combat-action" key={`${action.combatantKey}:${action.action}`}>{actions.length === 1 ? combatActionNotice(action, round, role) : combatActionText(action)}</span>)}Click to go back to the Combat tab.</span>
    </button>
  )
}

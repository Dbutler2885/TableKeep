import { useEffect, useState } from 'react'
import { useCombatLogView } from './CombatLogContext'
import { combatLogText, combatLogTime, type CombatLogEntry } from './combatLog'
import type { Role } from '../../../types/app'
import { combatActionNotice, combatActionText, type ViewerCombatAction } from './pendingActions'
import type { CombatRoll } from './engine/combatFeedback'
import { combatRollComparison, combatRollVerdict } from './combatRollPresentation'
import { useCombatRollSpin } from './useCombatRollSpin'

function RollNumbers({ roll, value, rolling }: { roll: CombatRoll; value: string; rolling: boolean }) {
  const comparison = combatRollComparison(roll)
  return (
    <div className="rn" aria-hidden={rolling}>
      <b key={value}>{value}</b>
      {comparison ? <><span className="relation">{rolling ? 'TARGET' : comparison.relation}</span><strong>{comparison.target}</strong></> : <span>{roll.target}</span>}
    </div>
  )
}

function RollDetails({ roll, detail }: { roll: CombatRoll; detail: string }) {
  return <>
    {detail ? <p className="roll-detail">{detail}</p> : null}
    {roll.extra ? <p className="rx">{roll.extra}</p> : null}
  </>
}

function CombatRollCard({ entry, roll, onDone }: { entry: CombatLogEntry; roll: CombatRoll; onDone: (id: string) => void }) {
  const [phase, setPhase] = useState('')
  const spin = useCombatRollSpin(entry.id, roll.roll)
  const verdict = combatRollVerdict(roll.result)
  useEffect(() => {
    const fade = setTimeout(() => setPhase('gone'), 6500)
    const remove = setTimeout(() => onDone(entry.id), 7100)
    return () => { clearTimeout(fade); clearTimeout(remove) }
  }, [entry.id, onDone])
  return (
    <div className={`rcard ${roll.tone} ${phase} ${spin.rolling ? 'rolling' : 'settled'}`} data-outcome={verdict.headline}>
      <div className="rw">{roll.who} · {roll.what}</div>
      <h2 className="rr">{spin.rolling ? 'Rolling...' : verdict.headline}</h2>
      <RollNumbers roll={roll} value={spin.value} rolling={spin.rolling} />
      <div className="roll-details" aria-hidden={spin.rolling}><RollDetails roll={roll} detail={verdict.detail} /></div>
    </div>
  )
}

export function CombatRollCards() {
  const { cards, sessionKey, finishCard } = useCombatLogView()
  const entry = cards[0]
  return <div className="combat-cards" role="status" aria-live="polite" aria-atomic="true">{entry?.roll ? <CombatRollCard key={JSON.stringify([sessionKey, entry.id])} entry={entry} roll={entry.roll} onDone={finishCard} /> : null}</div>
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

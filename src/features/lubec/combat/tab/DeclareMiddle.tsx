import type { LubecHands } from '../../../ruleSets/lubec/gear/held'
import { combatDeclarers } from '../engine/declare'
import type { Combatant, CombatState } from '../engine/types'
import type { AttackCommands } from './attackCommands'
import { controlsAttacker, type CombatViewer } from './attackWords'
import type { CombatRosterRecords } from './combatFightCombatants'
import { PhaseStepper } from './CombatMiddles'
import { CombatWindow } from './CombatParts'
import { DeclarationMini, DeclarationWords } from './DeclarationsPanel'
import { gmDeclareWords, nextDeclarerWords, viewerKeys } from './declarationsModel'
import { DeclareWindow } from './DeclareWindow'

/** The viewer's own declarations, kept in view while they wait. */
function OwnDeclarations({ state, viewer }: { state: CombatState; viewer: CombatViewer }) {
  const mine = viewerKeys(state, viewer).map((key) => state.combatants.find((entry) => entry.key === key)!).filter((entry) => entry.declaration)
  return (
    <>
      {mine.map((combatant) => (
        <div className="st" key={combatant.key}>
          <div className="sh"><span>Your declaration</span><span>{combatant.name}</span></div>
          <div className="sb">
            <DeclarationMini declaration={combatant.declaration!} />
            <div className="decls"><div className="txt own"><DeclarationWords state={state} declaration={combatant.declaration!} /></div></div>
          </div>
        </div>
      ))}
    </>
  )
}

/** Moment 6 during Declare: who the fight waits on, with this viewer's own declaration in view. */
function DeclareWaiting({ state, viewer, waiting }: { state: CombatState; viewer: CombatViewer; waiting: readonly Combatant[] }) {
  return (
    <CombatWindow title="Waiting" stepper={<PhaseStepper state={state} />} foot={<span className="note">Declarations and the Floor stay in view on either side.</span>}>
      <div className="bigwait">
        <span className="label">Stage 2, Declare, slowest first</span>
        <h3>The fight is waiting on {waiting[0].name}<span className="dots" /></h3>
        <p>{nextDeclarerWords(waiting)}</p>
      </div>
      <OwnDeclarations state={state} viewer={viewer} />
    </CombatWindow>
  )
}

/** Moment 5 for the GM while a player declares: who it waits on, and the way to declare for an absent player. */
function GmDeclareWaiting({ state, waiting, onActFor }: { state: CombatState; waiting: readonly Combatant[]; onActFor: (key: string) => void }) {
  const now = waiting[0]
  return (
    <CombatWindow title="Declare" stepper={<PhaseStepper state={state} />} foot={<span className="note">You can declare for an absent player. NPCs declare in this same window when their turn comes.</span>}>
      <div className="bigwait">
        <span className="label">Declaring, slowest first</span>
        <h3>Waiting on {now.name}<span className="dots" /></h3>
        <p>{gmDeclareWords(state, waiting)}</p>
        <p className="note"><button type="button" className="linkish" onClick={() => onActFor(now.key)}>Away from the table? Declare for {now.name}</button></p>
      </div>
    </CombatWindow>
  )
}

export type DeclareProps = {
  state: CombatState
  fightId: string
  viewer: CombatViewer
  roster: CombatRosterRecords
  commands: AttackCommands
  onActFor: (key: string) => void
  onInventory: (combatant: Combatant, hands: LubecHands) => void
}

/** Moment 5: the declarer's window for whoever controls them, and a wait for everyone else. */
export function DeclareMiddle({ state, fightId, viewer, roster, commands, onActFor, onInventory }: DeclareProps) {
  // Declare is open only while someone has yet to declare; the last declaration moves the round on.
  const waiting = combatDeclarers(state)
  const declarer = waiting[0]
  if (controlsAttacker(declarer, viewer)) {
    return <DeclareWindow key={declarer.key} state={state} fightId={fightId} declarer={declarer} roster={roster} commands={commands} gm={viewer.role === 'gm'} onInventory={(hands) => onInventory(declarer, hands)} />
  }
  if (viewer.role === 'gm') return <GmDeclareWaiting state={state} waiting={waiting} onActFor={onActFor} />
  return <DeclareWaiting state={state} viewer={viewer} waiting={waiting} />
}

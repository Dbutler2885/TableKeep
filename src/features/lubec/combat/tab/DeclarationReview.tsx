import type { Combatant, CombatState } from '../engine/types'
import type { AttackCommands } from './attackCommands'
import { PhaseStepper } from './CombatMiddles'
import { CombatRefusal, CombatWindow } from './CombatParts'
import { DeclarationMini, DeclarationWords } from './DeclarationsPanel'
import { useCombatRun } from './useCombatRun'

type Props = { state: CombatState; declarer: Combatant; gm: boolean; commands: AttackCommands }

/** Keep the submitted choice visible while only the GM can advance or return it. */
export function DeclarationReview({ state, declarer, gm, commands }: Props) {
  const run = useCombatRun()
  const answer = (approve: boolean) => run.run(() => commands.answerDeclaration(declarer.key, approve))
  const declaration = declarer.proposedDeclaration!
  const foot = gm ? <>
    <button type="button" className="btn line" disabled={run.busy} onClick={() => answer(false)}>Reject declaration</button>
    <button type="button" className="btn rust" disabled={run.busy} onClick={() => answer(true)}>Approve declaration</button>
  </> : <span className="note">The next person declares after the GM approves this choice.</span>
  return (
    <CombatWindow title={gm ? 'Review declaration' : 'Waiting for GM approval'} stepper={<PhaseStepper state={state} />} foot={foot}>
      <CombatRefusal refusal={run.refusal} />
      <div className="bigwait">
        <span className="label">Declaring, slowest first</span>
        <h3>{declarer.name}</h3>
        <p>{gm ? 'Approve this action, or reject it so the same person can choose again.' : 'The GM is reviewing this declaration.'}</p>
      </div>
      <div className="st">
        <div className="sh"><span>Submitted declaration</span><span>Awaiting GM approval</span></div>
        <div className="sb">
          <DeclarationMini declaration={declaration} />
          <div className="decls"><div className="txt"><DeclarationWords state={state} declaration={declaration} /></div></div>
        </div>
      </div>
    </CombatWindow>
  )
}

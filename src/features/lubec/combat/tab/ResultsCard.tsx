import { awaitingContinue } from '../engine/roundAttacks'
import type { CombatAttack, CombatState } from '../engine/types'
import { outcomeBanner, type Banner } from './outcomeWords'
import { Refusal, type StepControls } from './ResultSteps'
import { useAct } from './useAct'
import { continueWords, resultsFacts, resultsWound, type ResultsWound } from './resultsModel'

function WoundPanel({ wound }: { wound: ResultsWound }) {
  return (
    <div className={`results-wound ${wound.cls}`}>
      <div className="results-wound-head">
        <span className={`sev ${wound.cls}`}>{wound.severity}</span>
        <span className="tag ink">{wound.trauma}</span>
        {wound.out ? <span className="badge rust">Out of the fight</span> : null}
      </div>
      <h4>{wound.name}</h4>
      <dl className="results-parts">
        {wound.parts.map((part) => <div key={part.label}><dt>{part.label}</dt><dd>{part.text}</dd></div>)}
        {wound.injury ? <div><dt>Lasting injury</dt><dd>{wound.injury}</dd></div> : null}
      </dl>
      {wound.notes.map((note) => <p key={note} className="note">{note}</p>)}
      <p className="note">{wound.sheet}</p>
    </div>
  )
}

/** The GM moves the fight on; everyone else sees who it waits on. */
function ContinueBar({ state, attack, controls }: { state: CombatState; attack: CombatAttack; controls: StepControls | null }) {
  const act = useAct()
  if (!awaitingContinue(state, attack)) return null
  if (!controls?.isGm) return <p className="results-wait">Waiting on the GM to move on<span className="dots" /></p>
  return (
    <div className="results-continue">
      <Refusal refusal={act.refusal} />
      <button type="button" className="btn rust" disabled={act.busy} onClick={() => act.run(() => controls.commands.continueResults())}>{continueWords(state)}</button>
    </div>
  )
}

/** The headline, and one line under it that the wound panel below does not already say. */
function ResultsHead({ banner, wound }: { banner: Banner | null; wound: boolean }) {
  const line = wound ? banner?.aside ?? banner?.text : banner?.text
  return (
    <header className="results-head">
      <span className="label">Results</span>
      <h3>{banner?.title ?? 'Done'}</h3>
      {line ? <p>{line}</p> : null}
    </header>
  )
}

/** The end of every attack: what happened, to whom, where, with what and how hard, then the wound it left. */
export function ResultsCard({ state, attack, controls }: { state: CombatState; attack: CombatAttack; controls: StepControls | null }) {
  const banner = outcomeBanner(state, attack)
  const wound = resultsWound(state, attack)
  return (
    <section className={`results ${banner?.tone ?? ''}`.trim()} aria-label="Results">
      <ResultsHead banner={banner} wound={wound !== null} />
      <dl className="results-facts">
        {resultsFacts(state, attack).map((fact) => <div key={fact.term}><dt>{fact.term}</dt><dd>{fact.value}</dd></div>)}
      </dl>
      {wound ? <WoundPanel wound={wound} /> : null}
      <ContinueBar state={state} attack={attack} controls={controls} />
    </section>
  )
}

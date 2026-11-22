import { LubecTableWords } from '../../LubecTableWords'
import { awaitingContinue } from '../engine/roundAttacks'
import type { CombatAttack, CombatState } from '../engine/types'
import { outcomeBanner } from './outcomeWords'
import { Refusal, type StepControls } from './ResultSteps'
import { useAct } from './useAct'
import { continueWords, headWords, resultsWound, type ResultsWound } from './resultsModel'

/** The table's own name and words for the wound, its Trauma, and only what the table leaves to the dice; the headline already says the severity, or that the target is Out. */
function WoundPanel({ wound }: { wound: ResultsWound }) {
  return (
    <div className={`results-wound ${wound.cls}`}>
      <div className="results-wound-head">
        {wound.out ? <span className={`sev ${wound.cls}`}>{wound.severity}</span> : null}
        <span className="tag ink">{wound.trauma}</span>
      </div>
      <h4>{wound.name}</h4>
      <LubecTableWords text={wound.prose} className="results-prose" />
      <WoundFacts wound={wound} />
      {wound.notes.map((note) => <p key={note} className="note">{note}</p>)}
    </div>
  )
}

function WoundFacts({ wound }: { wound: ResultsWound }) {
  if (!wound.injury && !wound.sections.length) return null
  return (
    <dl className="results-parts">
      {wound.injury ? <div><dt>Lasting injury</dt><dd>{wound.injury}</dd></div> : null}
      {wound.sections.map((section) => (
        <div key={section.label} className="results-section">
          <dt>{section.label}</dt>
          <dd><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></dd>
        </div>
      ))}
    </dl>
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

function ResultsHead({ title, line }: { title: string; line: string | null }) {
  return (
    <header className="results-head">
      <span className="label">Results</span>
      <h3>{title}</h3>
      {line ? <p>{line}</p> : null}
    </header>
  )
}

/** The end of every attack: what happened, then the wound it left; the steps above already say who, with what, where and how hard. */
export function ResultsCard({ state, attack, controls }: { state: CombatState; attack: CombatAttack; controls: StepControls | null }) {
  const banner = outcomeBanner(state, attack)
  const wound = resultsWound(state, attack)
  return (
    <section className={`results ${banner?.tone ?? ''}`.trim()} aria-label="Results">
      <ResultsHead {...headWords(banner, wound !== null)} />
      {wound ? <WoundPanel wound={wound} /> : null}
      <ContinueBar state={state} attack={attack} controls={controls} />
    </section>
  )
}

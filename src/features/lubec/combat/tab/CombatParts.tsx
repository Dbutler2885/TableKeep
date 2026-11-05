import type { ReactNode } from 'react'
import { LubecKindGlyph } from '../../gear/LubecGearArt'
import type { CombatFloorItem } from './combatFloorRows'

const PIPS = ['Movement', 'Declare', 'Attack'] as const

function Pips({ now }: { now: number }) {
  const at = (index: number) => (index < now ? 'done' : index === now ? 'now' : '')
  return <ol className="pips">{PIPS.map((pip, index) => <li key={pip} className={at(index)}><b>{index + 1}</b><span>{pip}</span></li>)}</ol>
}

/** The page head: the tab's title, the round and the stage under it, and the round's stage pips once rounds begin. */
export function CombatHead({ round, stage, pips = null }: { round: string; stage: string; pips?: number | null }) {
  return (
    <div className="chead">
      <span className="title">Combat</span>
      <span className="rnd">{round}<small>{stage}</small></span>
      {pips === null ? <span /> : <Pips now={pips} />}
    </div>
  )
}

/** The fight window's stepper: the steps before `now` are done, `now` is current. */
export function CombatStepper({ steps, now }: { steps: readonly string[]; now: number }) {
  const state = (index: number) => (index < now ? 'done' : index === now ? 'now' : '')
  return (
    <ol className="stepper">
      {steps.map((step, index) => <li key={step} className={state(index)}><b>{index + 1}</b><span>{step}</span></li>)}
    </ol>
  )
}

type WindowProps = { title: string; stepper: ReactNode; children: ReactNode; foot: ReactNode }

/** The attack prototype's window, placed in the page: what this viewer must do, or who the fight waits on. */
export function CombatWindow({ title, stepper, children, foot }: WindowProps) {
  return (
    <section className="lubec-fight inpage" aria-label={title}>
      <div className="section-head"><h2>{title}</h2>{stepper}</div>
      <div className="fight-body">{children}</div>
      <div className="step-foot">{foot}</div>
    </section>
  )
}

export function CombatPanel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <div className="panel"><h3>{title}<small>{sub}</small></h3>{children}</div>
}

const BALL = (
  <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#a34229" stroke="#17282b" strokeWidth="2.4" /><path d="M5 17q15 7 30 0M5 24q15 7 30 0M20 4q-8 16 0 32M20 4q8 16 0 32" fill="none" stroke="#fff8e7" strokeWidth="1.6" /></svg>
)
const ROCK = (
  <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 28L11 14L23 8L33 15L32 29L18 33Z" fill="#a4a7a1" stroke="#17282b" strokeWidth="2.4" strokeLinejoin="round" /><path d="M11 14L18 20L32 15M18 20V33" fill="none" stroke="#17282b" strokeWidth="1.6" /></svg>
)

/** A Floor item's mark: the mock-up's ball for a dodgeball, its rock for any other thrown object, else the kind's icon. */
export function CombatFloorIcon({ item, small = false }: { item: CombatFloorItem; small?: boolean }) {
  const mark = item.table === 'dodgeball' ? BALL : item.mode === 'thrown' ? ROCK : <LubecKindGlyph kind={item.kind} />
  return <span className={small ? 'ball sm' : 'ball'}>{mark}</span>
}

/** The table's reason for refusing the last act, if it did. */
export function CombatRefusal({ refusal }: { refusal: string | null }) {
  return refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null
}

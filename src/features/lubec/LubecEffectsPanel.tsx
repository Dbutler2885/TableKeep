import { useState } from 'react'
import {
  describeLubecEffectStep,
  putLubecEffect,
  removeLubecEffect,
  stepDownLubecEffect,
  type LubecEffect,
} from '../ruleSets/lubec/effects'
import { LubecEffectEditor } from './LubecEffectEditor'

// The Core page's active effects, each one compact line drawn as the class
// cards' grey modifier bar: the name, what its current step does, and what it
// turns into next. The cause is kept but only shown when the effect is opened.
// Whoever may edit the sheet taps a line to open it and has one Step down
// button beside it.

type EffectsProps = {
  effects: readonly LubecEffect[]
  /** Absent for a viewer who may not change the character. */
  onChange: ((effects: LubecEffect[]) => void) | null
}

/** An open editor: an effect's id, or `new` for one being added. */
type OpenEffect = string | 'new' | null

function LubecEffectSummary({ effect }: { effect: LubecEffect }) {
  const [now, next] = effect.steps
  return (
    <>
      <span className="lubec-effect-name">{effect.name}</span>
      {now ? <span className="lubec-effect-now">{describeLubecEffectStep(now)}</span> : null}
      {next ? <span className="lubec-effect-next">then {describeLubecEffectStep(next) || 'nothing'}</span> : null}
    </>
  )
}

type LineProps = { effect: LubecEffect; editable: boolean; onOpen: () => void; onStepDown: () => void }

function LubecEffectLine({ effect, editable, onOpen, onStepDown }: LineProps) {
  if (!editable) return <div className="modifier lubec-effect-line"><LubecEffectSummary effect={effect} /></div>
  return (
    <>
      <button type="button" className="modifier lubec-effect-line" onClick={onOpen}><LubecEffectSummary effect={effect} /></button>
      <button type="button" className="secondary-button" aria-label={`Step down ${effect.name}`} onClick={onStepDown}>Step down</button>
    </>
  )
}

type ItemProps = {
  effect: LubecEffect
  editable: boolean
  isOpen: boolean
  actions: EffectActions
}

/** What a line or an editor does to the list, with which editor is open. */
type EffectActions = {
  open: (id: OpenEffect) => void
  save: (effect: LubecEffect) => void
  remove: (id: string) => void
  stepDown: (id: string) => void
}

function LubecEffectItem({ effect, editable, isOpen, actions }: ItemProps) {
  return (
    <li className="lubec-effect">
      {editable && isOpen
        ? <LubecEffectEditor effect={effect} onSave={actions.save} onCancel={() => actions.open(null)} onRemove={() => actions.remove(effect.id)} />
        : <LubecEffectLine effect={effect} editable={editable} onOpen={() => actions.open(effect.id)} onStepDown={() => actions.stepDown(effect.id)} />}
    </li>
  )
}

function LubecNewEffect({ adding, actions }: { adding: boolean; actions: EffectActions }) {
  if (adding) return <LubecEffectEditor effect={null} onSave={actions.save} onCancel={() => actions.open(null)} onRemove={null} />
  return <button type="button" className="action-button lubec-effect-add" onClick={() => actions.open('new')}>Add effect</button>
}

/** The active effects as a section of the Core page, with the owner's and GM's controls when they may change it. */
export function LubecEffectsPanel({ effects, onChange }: EffectsProps) {
  const [open, setOpen] = useState<OpenEffect>(null)
  const editable = onChange !== null
  const change = (next: LubecEffect[]) => {
    onChange?.(next)
    setOpen(null)
  }
  const actions: EffectActions = {
    open: setOpen,
    save: (effect) => change(putLubecEffect(effects, effect)),
    remove: (id) => change(removeLubecEffect(effects, id)),
    stepDown: (id) => onChange?.(stepDownLubecEffect(effects, id)),
  }
  return (
    <section className="ability-section lubec-effects" aria-label="Active effects">
      <div className="section-heading">
        <h3>Effects</h3>
        <span className="dice-formula">Active</span>
      </div>
      <div className="lubec-effects-body">
        {effects.length === 0 && open !== 'new' ? <p className="skill-strip-hint">No active effects.</p> : null}
        <ul className="modifier-list lubec-effect-list">
          {effects.map((effect) => <LubecEffectItem key={effect.id} effect={effect} editable={editable} isOpen={open === effect.id} actions={actions} />)}
        </ul>
        {editable ? <LubecNewEffect adding={open === 'new'} actions={actions} /> : null}
      </div>
    </section>
  )
}

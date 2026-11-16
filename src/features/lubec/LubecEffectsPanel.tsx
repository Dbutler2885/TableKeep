import { useState } from 'react'
import {
  describeLubecEffectStep,
  putLubecEffect,
  removeLubecEffect,
  stepDownLubecEffect,
  type LubecEffect,
} from '../ruleSets/lubec/effects'
import type { LubecGear } from '../ruleSets/lubec/gear/gearRecord'
import { lubecEffectGroups, lubecEffectWound, lubecStepTrigger } from '../ruleSets/lubec/woundCards'
import { LubecEffectEditor } from './LubecEffectEditor'
import { LubecGearLosses } from './LubecGearLosses'
import { LubecWoundDetail } from './LubecWoundDetail'

// The Core page's active effects, each one compact line drawn as the class
// cards' grey modifier bar: the name, what its current step does, what ends
// that step, and what it turns into next. A wound's linked cards sit together
// under the wound's name. The cause is kept but only shown when the effect is
// opened. Anyone who can see the sheet taps a wound card to read where it came
// from; whoever may edit the sheet taps a hand-made effect to open its editor,
// and has one Step down button beside every line. Gear's Speed losses follow,
// in a group of their own.

type EffectsProps = {
  effects: readonly LubecEffect[]
  /** Absent for a viewer who may not change the character. */
  onChange: ((effects: LubecEffect[]) => void) | null
  gear: LubecGear
  /** Saves the character's gear, to turn a loss off or on; absent for a viewer who may not change the character. */
  onGearChange: ((gear: LubecGear) => void) | null
}

/** An open effect: an effect's id in its editor or detail view, or `new` for one being added. */
type OpenEffect = { id: string; view: 'editor' | 'detail' } | 'new' | null

/** What comes after the current step: the next step, or, on a wound card's last timed step, healed. */
function nextWords(effect: LubecEffect): string | null {
  const [now, next] = effect.steps
  if (next) return `then ${describeLubecEffectStep(next) || 'nothing'}`
  const until = lubecStepTrigger(now)
  return until && now?.until !== 'lasting' ? 'then healed' : null
}

function LubecEffectSummary({ effect, grouped }: { effect: LubecEffect; grouped: boolean }) {
  const now = effect.steps[0]
  const part = typeof effect.part === 'string' && effect.part ? effect.part : null
  const trigger = lubecStepTrigger(now)
  const next = nextWords(effect)
  return (
    <>
      <span className="lubec-effect-name">{grouped && part ? part : effect.name}</span>
      {now ? <span className="lubec-effect-now">{describeLubecEffectStep(now)}</span> : null}
      {trigger ? <span className="lubec-effect-until">{trigger}</span> : null}
      {next ? <span className="lubec-effect-next">{next}</span> : null}
    </>
  )
}

type LineProps = { effect: LubecEffect; grouped: boolean; editable: boolean; onOpen: (() => void) | null; onStepDown: () => void }

function LubecEffectLine({ effect, grouped, editable, onOpen, onStepDown }: LineProps) {
  const summary = <LubecEffectSummary effect={effect} grouped={grouped} />
  const line = onOpen
    ? <button type="button" className="modifier lubec-effect-line" onClick={onOpen}>{summary}</button>
    : <div className="modifier lubec-effect-line">{summary}</div>
  if (!editable) return line
  return (
    <>
      {line}
      <button type="button" className="secondary-button" aria-label={`Step down ${effect.name}${grouped && effect.part ? ` ${String(effect.part)}` : ''}`} onClick={onStepDown}>Step down</button>
    </>
  )
}

type ItemProps = {
  effect: LubecEffect
  grouped: boolean
  editable: boolean
  open: OpenEffect
  actions: EffectActions
}

/** What a line or an editor does to the list, with which editor is open. */
type EffectActions = {
  open: (open: OpenEffect) => void
  save: (effect: LubecEffect) => void
  remove: (id: string) => void
  stepDown: (id: string) => void
}

const isOpen = (open: OpenEffect, id: string, view: 'editor' | 'detail') => open !== null && open !== 'new' && open.id === id && open.view === view

function LubecEffectItem({ effect, grouped, editable, open, actions }: ItemProps) {
  const wound = lubecEffectWound(effect)
  if (editable && isOpen(open, effect.id, 'editor')) {
    return <li className="lubec-effect"><LubecEffectEditor effect={effect} onSave={actions.save} onCancel={() => actions.open(null)} onRemove={() => actions.remove(effect.id)} /></li>
  }
  const detail = isOpen(open, effect.id, 'detail')
  const view = wound ? 'detail' : 'editor'
  const onOpen = wound || editable ? () => actions.open(detail ? null : { id: effect.id, view }) : null
  return (
    <li className={`lubec-effect${detail ? ' is-open' : ''}`}>
      <LubecEffectLine effect={effect} grouped={grouped} editable={editable} onOpen={onOpen} onStepDown={() => actions.stepDown(effect.id)} />
      {detail && wound ? <LubecWoundDetail effect={effect} wound={wound} onEdit={editable ? () => actions.open({ id: effect.id, view: 'editor' }) : null} /> : null}
    </li>
  )
}

function LubecNewEffect({ adding, actions }: { adding: boolean; actions: EffectActions }) {
  if (adding) return <LubecEffectEditor effect={null} onSave={actions.save} onCancel={() => actions.open(null)} onRemove={null} />
  return <button type="button" className="action-button lubec-effect-add" onClick={() => actions.open('new')}>Add effect</button>
}

/** The active effects as a section of the Core page, with the owner's and GM's controls when they may change it. */
export function LubecEffectsPanel({ effects, onChange, gear, onGearChange }: EffectsProps) {
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
  const groups = lubecEffectGroups(effects)
  return (
    <section className="ability-section lubec-effects" aria-label="Active effects">
      <div className="section-heading">
        <h3>Effects</h3>
        <span className="dice-formula">Active</span>
      </div>
      <div className="lubec-effects-body">
        {effects.length === 0 && open !== 'new' ? <p className="skill-strip-hint">No active effects.</p> : null}
        <ul className="modifier-list lubec-effect-list">
          {groups.flatMap((group) => {
            const grouped = group.effects.length > 1
            const items = group.effects.map((effect) => <LubecEffectItem key={effect.id} effect={effect} grouped={grouped} editable={editable} open={open} actions={actions} />)
            return grouped ? [<li key={`${group.key}-name`} className="lubec-effect-group">{group.effects[0].name}</li>, ...items] : items
          })}
        </ul>
        {editable ? <LubecNewEffect adding={open === 'new'} actions={actions} /> : null}
        <LubecGearLosses gear={gear} onGearChange={onGearChange} />
      </div>
    </section>
  )
}

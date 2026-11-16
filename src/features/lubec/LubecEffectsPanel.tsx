import type { LubecEffectRecovery, LubecRecoveryKind } from './effectRecovery'
import { lubecReachSavePending, lubecReachSaveWords } from '../ruleSets/lubec/reachSave'
import { useState } from 'react'
import {
  describeLubecEffectStep,
  putLubecEffect,
  removeLubecEffect,
  type LubecEffect,
} from '../ruleSets/lubec/effects'
import type { LubecCounters } from '../ruleSets/lubec/characterRecord'
import { stepDownLubecSheet } from '../ruleSets/lubec/stepDown'
import type { LubecGear } from '../ruleSets/lubec/gear/gearRecord'
import { lubecEffectGroups, lubecEffectTrigger, lubecEffectWound, lubecStepByHand, lubecStepTrigger } from '../ruleSets/lubec/woundCards'
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
  onRecover?: LubecEffectRecovery
  effects: readonly LubecEffect[]
  /** The counters a Step down may add Minimum Stress to. */
  counters: LubecCounters
  /** Absent for a viewer who may not change the character; a Step down that adds Minimum Stress passes the counters too. */
  onChange: ((effects: LubecEffect[], counters?: LubecCounters) => void) | null
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
  const trigger = lubecEffectTrigger(effect)
  const next = nextWords(effect)
  return (
    <>
      <span className="lubec-effect-name">{grouped && part ? part : effect.name}</span>
      {now ? <span className="lubec-effect-now">{describeLubecEffectStep(now)}</span> : null}
      {trigger ? <span className="lubec-effect-until">{trigger}</span> : null}
      {next ? <span className="lubec-effect-next">{next}</span> : null}
      {lubecStepByHand(effect) ? <span className="lubec-effect-manual">Resolved by hand</span> : null}
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

type Recovering = { id: string; kind: LubecRecoveryKind }

const RECOVERY_WORDS: Readonly<Record<LubecRecoveryKind, { name: string; roll: string; rolling: string; keep: string }>> = {
  wake: { name: 'Waking Save', roll: 'Wake and roll Body Save', rolling: 'Saving waking Save...', keep: 'Keep unconscious' },
  reach: { name: 'Recovery Save', roll: 'Step down and roll Body Save', rolling: 'Saving recovery Save...', keep: 'Not yet' },
}

/** The Save a card's Step down or clearing asks for first: waking from unconsciousness, or the Save its next step names; null for none. */
function recoveryOf(effects: readonly LubecEffect[], id: string): LubecRecoveryKind | null {
  const effect = effects.find((entry) => entry.id === id)
  if (effect?.wakeSave === 'severe-concussion') return 'wake'
  return lubecReachSavePending(effect) ? 'reach' : null
}

function recoveryText(effects: readonly LubecEffect[], recovering: Recovering): string {
  if (recovering.kind === 'wake') return 'Waking requires one Severe Concussion Body Save at Disadvantage, combined with active card modes. Long Rests count from the original injury.'
  const effect = effects.find((entry) => entry.id === recovering.id)
  return effect ? lubecReachSaveWords(effect) : 'This card has already been resolved.'
}

/** The active effects as a section of the Core page, with the owner's and GM's controls when they may change it. */
export function LubecEffectsPanel({ effects, counters, onChange, onRecover, gear, onGearChange }: EffectsProps) {
  const [open, setOpen] = useState<OpenEffect>(null)
  const [recovering, setRecovering] = useState<Recovering | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const editable = onChange !== null
  const recover = async () => {
    if (!onRecover || !recovering || busy) return
    setBusy(true)
    setRecoveryError(null)
    const words = RECOVERY_WORDS[recovering.kind].name.toLowerCase()
    try {
      const result = await onRecover(recovering.id, recovering.kind)
      if (result.status === 'repair') setRecoveryError(`The sheet changed. Refresh it before retrying the same ${words}.`)
      else setRecovering(null)
    } catch (error) { setRecoveryError(error instanceof Error ? error.message : `The ${words} could not be saved. Retry to recover its receipt.`) }
    finally { setBusy(false) }
  }
  const change = (next: LubecEffect[]) => {
    onChange?.(next)
    setOpen(null)
  }
  const actions: EffectActions = {
    open: setOpen,
    save: (effect) => change(putLubecEffect(effects, effect)),
    remove: (id) => { if (recoveryOf(effects, id) === 'wake') setRecovering({ id, kind: 'wake' }); else change(removeLubecEffect(effects, id)) },
    stepDown: (id) => {
      const kind = recoveryOf(effects, id)
      if (kind) { setRecoveryError(null); setRecovering({ id, kind }); return }
      const next = stepDownLubecSheet({ effects, counters }, id)
      if (next.counters === counters) onChange?.(next.effects)
      else onChange?.(next.effects, next.counters)
    },
  }
  const groups = lubecEffectGroups(effects)
  return (
    <section className="ability-section lubec-effects" aria-label="Active effects">
      <div className="section-heading">
        <h3>Effects</h3>
        <span className="dice-formula">Active</span>
      </div>
      <div className="lubec-effects-body">
        {recovering ? <div className="notice" role="dialog" aria-label={RECOVERY_WORDS[recovering.kind].name}>
          <p>{recoveryText(effects, recovering)}</p>
          {recoveryError ? <p role="alert">{recoveryError}</p> : null}
          <button type="button" className="action-button" disabled={busy || !onRecover} onClick={() => void recover()}>{busy ? RECOVERY_WORDS[recovering.kind].rolling : RECOVERY_WORDS[recovering.kind].roll}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setRecovering(null)}>{RECOVERY_WORDS[recovering.kind].keep}</button>
        </div> : null}
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

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
import { useLubecEffectRecovery, type RecoveringEffect } from './useLubecEffectRecovery'

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
  /** The effect to open first: its wound's detail, or a hand-made effect's editor for whoever may change it. */
  initialOpen?: string | null
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
  const trigger = lubecEffectTrigger(effect)
  const next = nextWords(effect)
  return (
    <>
      <span className="lubec-effect-name">{effectLineName(effect, grouped)}</span>
      <EffectWords kind="now" words={now ? describeLubecEffectStep(now) : null} />
      <EffectWords kind="until" words={trigger} />
      <EffectWords kind="next" words={next} />
      <EffectWords kind="manual" words={lubecStepByHand(effect) ? 'Resolved by hand' : null} />
    </>
  )
}

function EffectWords({ kind, words }: { kind: string; words: string | null }) {
  return words === null ? null : <span className={`lubec-effect-${kind}`}>{words}</span>
}

function effectLineName(effect: LubecEffect, grouped: boolean): string {
  const part = typeof effect.part === 'string' && effect.part ? effect.part : null
  return grouped && part ? part : effect.name
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
  const onOpen = effectOpener(effect.id, Boolean(wound) || editable, detail, view, actions)
  return (
    <li className={`lubec-effect${detail ? ' is-open' : ''}`}>
      <LubecEffectLine effect={effect} grouped={grouped} editable={editable} onOpen={onOpen} onStepDown={() => actions.stepDown(effect.id)} />
      <EffectDetail effect={effect} visible={detail} editable={editable} actions={actions} />
    </li>
  )
}

const effectOpener = (id: string, allowed: boolean, detail: boolean, view: 'editor' | 'detail', actions: EffectActions) =>
  allowed ? () => actions.open(detail ? null : { id, view }) : null

function EffectDetail({ effect, visible, editable, actions }: { effect: LubecEffect; visible: boolean; editable: boolean; actions: EffectActions }) {
  const wound = lubecEffectWound(effect)
  if (!visible || !wound) return null
  return <LubecWoundDetail effect={effect} wound={wound} onEdit={editable ? () => actions.open({ id: effect.id, view: 'editor' }) : null} />
}

function LubecNewEffect({ adding, actions }: { adding: boolean; actions: EffectActions }) {
  if (adding) return <LubecEffectEditor effect={null} onSave={actions.save} onCancel={() => actions.open(null)} onRemove={null} />
  return <button type="button" className="action-button lubec-effect-add" onClick={() => actions.open('new')}>Add effect</button>
}

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

function recoveryText(effects: readonly LubecEffect[], recovering: RecoveringEffect): string {
  if (recovering.kind === 'wake') return 'Waking: Severe Concussion Body Save at Disadvantage.'
  const effect = effects.find((entry) => entry.id === recovering.id)
  return effect ? lubecReachSaveWords(effect) : 'This card has already been resolved.'
}

function stepDownChange(effects: readonly LubecEffect[], counters: LubecCounters, id: string, onChange: EffectsProps['onChange']) {
  const next = stepDownLubecSheet({ effects, counters }, id)
  if (next.counters === counters) onChange?.(next.effects)
  else onChange?.(next.effects, next.counters)
}

function effectActions(effects: readonly LubecEffect[], counters: LubecCounters, onChange: EffectsProps['onChange'], controls: {
  open: (open: OpenEffect) => void; recovering: (next: RecoveringEffect) => void; error: (text: string | null) => void
}): EffectActions {
  const change = (next: LubecEffect[]) => { onChange?.(next); controls.open(null) }
  return {
    open: controls.open,
    save: (effect) => change(putLubecEffect(effects, effect)),
    remove: (id) => { if (recoveryOf(effects, id) === 'wake') controls.recovering({ id, kind: 'wake' }); else change(removeLubecEffect(effects, id)) },
    stepDown: (id) => {
      const kind = recoveryOf(effects, id)
      if (kind) { controls.error(null); controls.recovering({ id, kind }); return }
      stepDownChange(effects, counters, id, onChange)
    },
  }
}

function EffectGroups({ effects, editable, open, actions }: { effects: readonly LubecEffect[]; editable: boolean; open: OpenEffect; actions: EffectActions }) {
  return lubecEffectGroups(effects).flatMap((group) => {
    const grouped = group.effects.length > 1
    const items = group.effects.map((effect) => <LubecEffectItem key={effect.id} effect={effect} grouped={grouped} editable={editable} open={open} actions={actions} />)
    return grouped ? [<li key={`${group.key}-name`} className="lubec-effect-group">{group.effects[0].name}</li>, ...items] : items
  })
}

function RecoveryDialog({ effects, recovery, enabled }: { effects: readonly LubecEffect[]; recovery: ReturnType<typeof useLubecEffectRecovery>; enabled: boolean }) {
  const { recovering, busy, error, recover, setRecovering } = recovery
  if (!recovering) return null
  const words = RECOVERY_WORDS[recovering.kind]
  return <div className="notice" role="dialog" aria-label={words.name}>
    <p>{recoveryText(effects, recovering)}</p>
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" className="action-button" disabled={busy || !enabled} onClick={() => void recover()}>{busy ? words.rolling : words.roll}</button>
    <button type="button" className="secondary-button" disabled={busy} onClick={() => setRecovering(null)}>{words.keep}</button>
  </div>
}

/** The active effects as a section of the Core page, with the owner's and GM's controls when they may change it. */
/** Where a panel opened on one effect starts: that wound's detail, or that effect's editor. */
function initialOpenOf(effects: readonly LubecEffect[], id: string | null | undefined): OpenEffect {
  const effect = effects.find((entry) => entry.id === id)
  if (!effect) return null
  return { id: effect.id, view: lubecEffectWound(effect) ? 'detail' : 'editor' }
}

export function LubecEffectsPanel({ effects, counters, onChange, onRecover, gear, onGearChange, initialOpen = null }: EffectsProps) {
  const [open, setOpen] = useState<OpenEffect>(() => initialOpenOf(effects, initialOpen))
  const recovery = useLubecEffectRecovery(onRecover)
  const editable = onChange !== null
  const actions = effectActions(effects, counters, onChange, { open: setOpen, recovering: recovery.setRecovering, error: recovery.setError })
  return (
    <section className="ability-section lubec-effects" aria-label="Active effects">
      <div className="section-heading">
        <h3>Effects</h3>
        <span className="dice-formula">Active</span>
      </div>
      <div className="lubec-effects-body">
        <RecoveryDialog effects={effects} recovery={recovery} enabled={Boolean(onRecover)} />
        {effects.length === 0 && open !== 'new' ? <p className="skill-strip-hint">No active effects.</p> : null}
        <ul className="modifier-list lubec-effect-list">
          <EffectGroups effects={effects} editable={editable} open={open} actions={actions} />
        </ul>
        {editable ? <LubecNewEffect adding={open === 'new'} actions={actions} /> : null}
        <LubecGearLosses gear={gear} onGearChange={onGearChange} />
      </div>
    </section>
  )
}

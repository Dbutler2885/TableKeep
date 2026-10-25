import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { LUBEC_VALUE_NAMES, type LubecValueName } from '../ruleSets/lubec/sheet'
import {
  canSaveLubecEffectDraft,
  emptyLubecStepDraft,
  lubecEffectDraft,
  lubecEffectFromDraft,
  removedAt,
  replacedAt,
  type LubecEffectDraft,
  type LubecModifierDraft,
  type LubecStepDraft,
} from './lubecEffectDraft'

type ModifierRowProps = {
  label: string
  modifier: LubecModifierDraft
  onChange: (modifier: LubecModifierDraft) => void
  onRemove: () => void
}

function LubecModifierRow({ label, modifier, onChange, onRemove }: ModifierRowProps) {
  return (
    <div className="lubec-effect-modifier">
      <select aria-label={label} value={modifier.target} onChange={(event) => onChange({ ...modifier, target: event.target.value as LubecValueName })}>
        {LUBEC_VALUE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        aria-label={`${label} amount`}
        placeholder="-10"
        value={modifier.amount}
        onChange={(event) => onChange({ ...modifier, amount: event.target.value })}
      />
      <button type="button" className="lubec-effect-icon" aria-label={`Remove ${label}`} onClick={onRemove}><X size={14} /></button>
    </div>
  )
}

type StepEditorProps = {
  index: number
  step: LubecStepDraft
  onChange: (step: LubecStepDraft) => void
  onRemove: (() => void) | null
}

function LubecStepEditor({ index, step, onChange, onRemove }: StepEditorProps) {
  const name = `Step ${index + 1}`
  const setModifier = (at: number, modifier: LubecModifierDraft) => onChange({ ...step, modifiers: replacedAt(step.modifiers, at, modifier) })
  return (
    <fieldset className="lubec-effect-step">
      <legend>{index === 0 ? `${name} (now)` : name}</legend>
      {step.modifiers.map((modifier, at) => (
        <LubecModifierRow
          key={at}
          label={`${name} modifier ${at + 1}`}
          modifier={modifier}
          onChange={(next) => setModifier(at, next)}
          onRemove={() => onChange({ ...step, modifiers: removedAt(step.modifiers, at) })}
        />
      ))}
      <label className="lubec-effect-field">
        <span>Labels, one per line</span>
        <textarea rows={2} aria-label={`${name} labels`} value={step.labels} onChange={(event) => onChange({ ...step, labels: event.target.value })} />
      </label>
      <div className="lubec-effect-actions">
        <button type="button" aria-label={`Add modifier to ${name.toLowerCase()}`} onClick={() => onChange({ ...step, modifiers: [...step.modifiers, { target: 'Handle', amount: '' }] })}>
          Add modifier
        </button>
        {onRemove ? <button type="button" aria-label={`Remove ${name.toLowerCase()}`} onClick={onRemove}>Remove step</button> : null}
      </div>
    </fieldset>
  )
}

function LubecStepsEditor({ draft, onChange }: { draft: LubecEffectDraft; onChange: (draft: LubecEffectDraft) => void }) {
  const setSteps = (steps: LubecStepDraft[]) => onChange({ ...draft, steps })
  return (
    <>
      {draft.steps.map((step, index) => (
        <LubecStepEditor
          key={index}
          index={index}
          step={step}
          onChange={(next) => setSteps(replacedAt(draft.steps, index, next))}
          onRemove={draft.steps.length > 1 ? () => setSteps(removedAt(draft.steps, index)) : null}
        />
      ))}
      <button type="button" className="lubec-effect-add-step" onClick={() => setSteps([...draft.steps, emptyLubecStepDraft()])}>Add step</button>
    </>
  )
}

type EditorProps = {
  /** The effect being edited, or null for a new one. */
  effect: LubecEffect | null
  onSave: (effect: LubecEffect) => void
  onCancel: () => void
  onRemove: (() => void) | null
}

/** An effect opened for editing: its name, cause and steps, saved or dropped as a whole. */
export function LubecEffectEditor({ effect, onSave, onCancel, onRemove }: EditorProps) {
  const [draft, setDraft] = useState(() => lubecEffectDraft(effect))
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!canSaveLubecEffectDraft(draft)) return
    onSave(effect ? lubecEffectFromDraft(draft, effect.id, effect) : lubecEffectFromDraft(draft, crypto.randomUUID()))
  }
  return (
    <form className="lubec-effect-editor" aria-label={effect ? `Edit ${effect.name}` : 'New effect'} onSubmit={save}>
      <label className="lubec-effect-field">
        <span>Name</span>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </label>
      <label className="lubec-effect-field">
        <span>Cause</span>
        <input value={draft.cause} onChange={(event) => setDraft({ ...draft, cause: event.target.value })} />
      </label>
      <LubecStepsEditor draft={draft} onChange={setDraft} />
      <div className="lubec-effect-actions">
        <button type="submit" className="lubec-effect-save" disabled={!canSaveLubecEffectDraft(draft)}>{effect ? 'Save' : 'Add'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        {onRemove ? <button type="button" className="lubec-effect-remove" onClick={onRemove}>Remove effect</button> : null}
      </div>
    </form>
  )
}

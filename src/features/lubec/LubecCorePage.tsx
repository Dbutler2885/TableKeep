import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { lubecActiveModifiers, type LubecEffect } from '../ruleSets/lubec/effects'
import { LubecAbilities } from './LubecAbilities'
import { LubecClassPanel } from './LubecClassPanel'
import { LubecClassPicker } from './LubecClassPicker'
import { LubecCountersPanel, type LubecCountersChange } from './LubecCountersPanel'
import { LubecEffectsPanel } from './LubecEffectsPanel'
import { LubecFightPanel } from './LubecFightPanel'
import { LubecGuidedClassStep } from './LubecGuidedClassStep'
import { LubecRollPanel } from './LubecRollPanel'
import { LubecRollUpPanel } from './LubecRollUpPanel'
import { useLubecRoller, type LubecRolled } from './useLubecRoller'

/** A guided draft's roll-up: its dice and Swap saved at once, or null for a viewer who may only look. */
export type LubecGuided = { onRollUp: LubecSheetEdit | null }

type CreationProps = { sheet: LubecCharacterSheet; guided: LubecGuided | null; onDraftEdit: LubecSheetEdit | null }

// What a draft is made with: a guided draft's roll-up and class step, or a typed draft's class picker.
function LubecCreationPanels({ sheet, guided, onDraftEdit }: CreationProps) {
  if (!guided) return onDraftEdit ? <LubecClassPicker sheet={sheet} onEdit={onDraftEdit} /> : null
  return (
    <>
      <LubecRollUpPanel sheet={sheet} onRollUp={guided.onRollUp} onDraftEdit={onDraftEdit} />
      {onDraftEdit ? <LubecGuidedClassStep sheet={sheet} onEdit={onDraftEdit} /> : null}
    </>
  )
}

type CorePageProps = {
  sheet: LubecCharacterSheet
  /** Absent for a viewer who may not change the character. */
  onCountersChange: LubecCountersChange | null
  /** Absent for a viewer who may not change the character. */
  onEffectsChange: ((effects: LubecEffect[]) => void) | null
  /** Changes a draft's base values, class and class choice; absent unless the viewer may type into the draft. */
  onDraftEdit?: LubecSheetEdit | null
  /** Absent for a viewer who may not roll on the character. */
  onRolled: LubecRolled | null
  /** Present on a guided draft, whose base values are rolled rather than typed. */
  guided?: LubecGuided | null
}

/**
 * The Core page: the five Stats and three Saves as the prototype's roll
 * circles, each current value rolled under with a tap, the Panic Check and
 * the Recovery Save below the Saves, the roller and the last roll, the counters, the active effects that change the values, the
 * class's reminders and the reserved Fight panel. While a draft can be typed
 * into, its base values and its class and choice are fields, and each final
 * value follows as it is typed. A guided draft's base values are rolled
 * instead, so they are never fields.
 */
export function LubecCorePage({ sheet, onCountersChange, onEffectsChange, onDraftEdit = null, onRolled, guided = null }: CorePageProps) {
  const modifiers = lubecActiveModifiers(sheet.effects)
  const roller = useLubecRoller(sheet, onRolled)
  return (
    <div className="lubec-page lubec-core">
      <LubecCreationPanels sheet={sheet} guided={guided} onDraftEdit={onDraftEdit} />
      <LubecAbilities sheet={sheet} modifiers={modifiers} onDraftEdit={guided ? null : onDraftEdit} roller={roller} />
      <LubecRollPanel sheet={sheet} roller={roller} />
      <LubecCountersPanel sheet={sheet} onChange={onCountersChange} />
      <LubecEffectsPanel effects={sheet.effects} onChange={onEffectsChange} />
      <LubecClassPanel sheet={sheet} />
      <LubecFightPanel sheet={sheet} modifiers={modifiers} />
    </div>
  )
}

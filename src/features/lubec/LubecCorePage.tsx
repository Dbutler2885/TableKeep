import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { lubecActiveModifiers, type LubecEffect } from '../ruleSets/lubec/effects'
import { LubecAbilities } from './LubecAbilities'
import { LubecClassSection } from './LubecClassSection'
import { LubecCountersPanel, type LubecCountersChange } from './LubecCountersPanel'
import { LubecEffectsPanel } from './LubecEffectsPanel'
import { LubecFightPanel } from './LubecFightPanel'
import { lubecRollUpActive } from './lubecRollUpCircles'
import type { LubecRollUpEdits } from './useLubecRollUp'
import { useLubecRoller, type LubecRolled } from './useLubecRoller'

/** A guided draft's roll-up: its dice and Swap saved at once, or null for a viewer who may only look. */
export type LubecGuided = { onRollUp: LubecSheetEdit | null }

// A guided draft rolls on its circles until its scores are settled and its class chosen.
const rollUpOf = (sheet: LubecCharacterSheet, guided: LubecGuided | null, onDraftEdit: LubecSheetEdit | null): LubecRollUpEdits | null =>
  (guided && lubecRollUpActive(sheet) ? { onRollUp: guided.onRollUp, onDraftEdit } : null)

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
  /** Opens the Skills page, where the skill tree is. */
  onShowTree: () => void
}

/**
 * The Core page: the five Stats and three Saves as the prototype's roll
 * circles, each current value rolled under with a tap, the skills to add to a
 * roll, the Panic Check and the Recovery Save below the Saves, the counters,
 * the active effects that change the values, the class record and the reserved Fight panel.
 * While a draft can be typed into, each base is typed into its circle's place
 * and the class is chosen from the prototype's class cards straight under the
 * values. A guided draft's circles roll its dice and settle its scores
 * instead, and its class cards unlock once they are settled.
 */
export function LubecCorePage({ sheet, onCountersChange, onEffectsChange, onDraftEdit = null, onRolled, guided = null, onShowTree }: CorePageProps) {
  const modifiers = lubecActiveModifiers(sheet.effects)
  const roller = useLubecRoller(sheet, onRolled)
  const rollUp = rollUpOf(sheet, guided, onDraftEdit)
  const classSection = <LubecClassSection sheet={sheet} modifiers={modifiers} onDraftEdit={onDraftEdit} guided={guided !== null} />
  return (
    <div className="lubec-page lubec-core">
      <LubecAbilities
        sheet={sheet}
        modifiers={modifiers}
        onDraftEdit={guided ? null : onDraftEdit}
        roller={rollUp ? null : roller}
        rollUp={rollUp}
        onShowTree={onShowTree}
      />
      {onDraftEdit ? classSection : null}
      <LubecCountersPanel sheet={sheet} onChange={onCountersChange} />
      <LubecEffectsPanel effects={sheet.effects} onChange={onEffectsChange} />
      {onDraftEdit ? null : classSection}
      <LubecFightPanel sheet={sheet} modifiers={modifiers} />
    </div>
  )
}

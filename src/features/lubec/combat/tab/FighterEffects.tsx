import { useEffect, useRef } from 'react'
import type { LubecCharacterRecord, LubecCounters } from '../../../ruleSets/lubec/characterRecord'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { LubecEffectsPanel } from '../../LubecEffectsPanel'
import type { Combatant } from '../engine/types'
import { fighterEffectLines, fighterSheet, fighterSheetEditable, type FighterEffectLine, type CombatEffectsAccess, type CombatSheetWriter, type FighterSheet } from './fighterEffectsModel'

type EffectsChange = (effects: LubecEffect[], counters?: LubecCounters) => void

/** The writer for the fighter's sheet when this viewer may change it: the GM always, a player only their own character. */
function editorOf(sheet: FighterSheet, access: CombatEffectsAccess): CombatSheetWriter | null {
  const writer = access.writers[sheet.collection]
  return writer && fighterSheetEditable(sheet, access.viewer) ? writer : null
}

/** A card change saved the way the sheet saves it: the whole effects list, and the counters a Step down adds to. */
const effectsChangeOf = (record: LubecCharacterRecord, writer: CombatSheetWriter): EffectsChange =>
  (effects, counters) => writer.updateCharacter(record.id, { lubec: { ...record.lubec, effects, ...(counters ? { counters } : {}) } }, record)

type DialogProps = { combatant: Combatant; access: CombatEffectsAccess; effectId: string; onClose: () => void }

/** The sheet's own Effects panel over the fight: wound details, Step down and recovery Saves, with focus returned on close; nothing once the sheet is gone. */
export function FighterEffectsDialog({ combatant, access, effectId, onClose }: DialogProps) {
  const sheet = fighterSheet(combatant, access.roster)
  if (!sheet) return null
  return <EffectsDialog combatant={combatant} sheet={sheet} access={access} effectId={effectId} onClose={onClose} />
}

function EffectsDialog({ combatant, sheet, access, effectId, onClose }: DialogProps & { sheet: FighterSheet }) {
  const panel = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = panel.current!
    dialog.showModal()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  const writer = editorOf(sheet, access)
  const { lubec } = sheet.record
  return (
    <dialog ref={panel} className="fighter-effects-modal" aria-label={`${combatant.name}'s effects`} onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className="fighter-effects-head">
        <h2>{combatant.name}</h2>
        <button type="button" className="btn line small" onClick={onClose}>Close</button>
      </div>
      <LubecEffectsPanel
        effects={lubec.effects} counters={lubec.counters} gear={lubec.gear} onGearChange={null} initialOpen={effectId}
        onChange={writer ? effectsChangeOf(sheet.record, writer) : null}
        onRecover={writer ? writer.recovery(sheet.record) : null}
      />
    </dialog>
  )
}

/** One card as a chip on the fighter's line, itself the button that opens its details and actions; its words are its name and title. */
function EffectChip({ line, onOpen }: { line: FighterEffectLine; onOpen: (effectId: string) => void }) {
  return (
    <li>
      <button type="button" className="fighter-effect" title={line.words} aria-label={`${line.words}. Open details and actions`} onClick={() => onOpen(line.id)}>{line.label}</button>
    </li>
  )
}

/** The chips a line has room for: two, and a count that opens the first of the rest. */
const CHIPS = 2

function MoreChip({ rest, onOpen }: { rest: readonly FighterEffectLine[]; onOpen: (effectId: string) => void }) {
  if (!rest.length) return null
  const words = rest.map((line) => line.words).join('; ')
  return (
    <li>
      <button type="button" className="fighter-effect more" title={words} aria-label={`${rest.length} more: ${words}. Open details and actions`} onClick={() => onOpen(rest[0].id)}>+{rest.length}</button>
    </li>
  )
}

type FighterEffectsProps = { combatant: Combatant; access: CombatEffectsAccess | undefined; onOpen: (effectId: string) => void }

/** A fighter's active cards as chips on their line in the turn order, each opening its own details; nothing for a sheet this viewer cannot read. */
export function FighterEffects({ combatant, access, onOpen }: FighterEffectsProps) {
  const effects = access ? fighterSheet(combatant, access.roster)?.record.lubec.effects : undefined
  if (!effects?.length) return null
  const lines = fighterEffectLines(effects)
  const shown = lines.length > CHIPS ? lines.slice(0, CHIPS - 1) : lines
  return (
    <ul className="fighter-effects" aria-label={`${combatant.name}'s effects`}>
      {shown.map((line) => <EffectChip key={line.id} line={line} onOpen={onOpen} />)}
      <MoreChip rest={lines.slice(shown.length)} onOpen={onOpen} />
    </ul>
  )
}

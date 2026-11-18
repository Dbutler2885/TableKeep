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

type DialogProps = { combatant: Combatant; access: CombatEffectsAccess; onClose: () => void }

/** The sheet's own Effects panel over the fight: wound details, Step down and recovery Saves, with focus returned on close; nothing once the sheet is gone. */
export function FighterEffectsDialog({ combatant, access, onClose }: DialogProps) {
  const sheet = fighterSheet(combatant, access.roster)
  if (!sheet) return null
  return <EffectsDialog combatant={combatant} sheet={sheet} access={access} onClose={onClose} />
}

function EffectsDialog({ combatant, sheet, access, onClose }: DialogProps & { sheet: FighterSheet }) {
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
        effects={lubec.effects} counters={lubec.counters} gear={lubec.gear} onGearChange={null}
        onChange={writer ? effectsChangeOf(sheet.record, writer) : null}
        onRecover={writer ? writer.recovery(sheet.record) : null}
      />
    </dialog>
  )
}

/** One card under a fighter's name: which card, what it does now, and what ends it. */
function EffectLine({ line }: { line: FighterEffectLine }) {
  return (
    <li>
      <b>{line.label}</b>
      {line.now ? <span>{` · ${line.now}`}</span> : null}
      {line.until ? <span className="until">{` · ${line.until}`}</span> : null}
    </li>
  )
}

type FighterEffectsProps = { combatant: Combatant; access: CombatEffectsAccess | undefined; onOpen: () => void }

/** A fighter's active cards under their name in the turn order, and the button that opens them; nothing for a sheet this viewer cannot read. */
export function FighterEffects({ combatant, access, onOpen }: FighterEffectsProps) {
  const effects = access ? fighterSheet(combatant, access.roster)?.record.lubec.effects : undefined
  if (!effects?.length) return null
  return (
    <div className="fighter-effects">
      <ul aria-label={`${combatant.name}'s effects`}>
        {fighterEffectLines(effects).map((line) => <EffectLine key={line.id} line={line} />)}
      </ul>
      <button type="button" className="btn line small" aria-label={`Open ${combatant.name}'s effects`} onClick={onOpen}>Effects</button>
    </div>
  )
}

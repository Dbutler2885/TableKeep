import { lubecArmorAt } from '../../ruleSets/lubec/gear/armorAt'
import { wornOn } from '../../ruleSets/lubec/gear/armorLayers'
import { locName } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { armorSome, armorText, armorVs, WOUND_KINDS, WOUND_SHORT } from './itemLabels'
import { LubecSheetHead } from './LubecSheetHead'

type PiecesProps = { gear: LubecGear; part: string; onPick: (itemId: string) => void; onClose: () => void }

/** "Which piece?": tapping a part with more than one piece of armor on it asks which to open (B's prompt from the body). */
export function LubecArmorPieces({ gear, part, onPick, onClose }: PiecesProps) {
  const pieces = wornOn(gear, part)
  const all = WOUND_KINDS.map((w) => `${WOUND_SHORT[w]} ${armorText(lubecArmorAt(gear, part, w))}`).join(', ')
  return (
    <div className="sheet-form">
      <LubecSheetHead eyebrow="Armor" title={`${locName(part)}: which piece?`} onClose={onClose} />
      <p className="confirm-text note">{pieces.length} pieces are worn here. In all: {all}.</p>
      <div className={`actions${pieces.length === 2 ? ' three' : ''}`}>
        <button type="button" className="btn line" onClick={onClose}>Cancel</button>
        {pieces.map((a) => (
          <button key={a.id} type="button" className="btn piece" onClick={() => onPick(a.id)}>
            {a.name}<small>{armorSome((w) => armorVs(a, w)).join(', ') || 'No armor'}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { itemsIn } from '../../ruleSets/lubec/gear/placement'
import { qtyText } from './gearLabels'
import { LubecPicture } from './LubecGearArt'
import { LubecWeightTag } from './LubecGearSlot'
import { LubecSheetHead } from './LubecSheetHead'

type SmallProps = { gear: LubecGear; onOpen: (itemId: string) => void; onAdd: () => void; onClose: () => void }

/** Small stuff: the list behind the pill on the backpack, each thing opening its card (B's small mode of the item sheet). */
export function LubecSmallStuffList({ gear, onOpen, onAdd, onClose }: SmallProps) {
  const small = itemsIn(gear, 'backpack').filter((i) => i.pocket == null)
  return (
    <div className="sheet-form">
      <LubecSheetHead eyebrow="Backpack" title="Small stuff" onClose={onClose} />
      <p className="note">Things too small to count. In a bag they take no slot, however many there are. Held or on the body, a small thing takes that slot.</p>
      <div className="row-list">
        {small.length ? small.map((i) => (
          <button key={i.id} type="button" className="row-item" onClick={() => onOpen(i.id)}>
            <LubecPicture item={i} frame="thumb" />
            <span>{`${i.name} ${qtyText(i)}`.trim()}</span>
            <span className="tags"><LubecWeightTag item={i} /></span>
          </button>
        )) : <p className="note">Nothing yet.</p>}
      </div>
      <div className="sheet-foot">
        <button className="btn wide" type="button" onClick={onAdd}>+ Add a small thing</button>
      </div>
    </div>
  )
}

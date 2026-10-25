import { bodyTaken, bothHands, handsTaken, itemsIn } from '../../ruleSets/lubec/gear/placement'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { heavyClass, SLOT_NAMES, type LubecSupplyName } from './gearLabels'
import type { LubecGearAdd } from './LubecGearPack'
import { LubecEmptySlot, LubecSlotPic, LubecSlotText } from './LubecGearSlot'

type RowId = 'hands' | 'body'

type RowProps = { gear: LubecGear; id: RowId; supplyName: LubecSupplyName; onAdd: LubecGearAdd }

function ItemSlot({ item, where, className = '', supplyName }: { item: LubecItem; where: string; className?: string; supplyName: LubecSupplyName }) {
  return (
    <div className={`slot item${className}${heavyClass(item)}`}>
      <span className="where">{where}</span>
      <LubecSlotPic item={item} />
      <LubecSlotText item={item} supplyName={supplyName} />
    </div>
  )
}

function SlotAt({ gear, id, supplyName, onAdd, k }: RowProps & { k: 0 | 1 }) {
  const item = itemsIn(gear, id).find((x) => x.slot === k)
  const name = SLOT_NAMES[id][k]
  if (item) return <ItemSlot item={item} where={name} supplyName={supplyName} />
  return (
    <LubecEmptySlot label={`${name}, empty, add an item`} onAdd={onAdd ? () => onAdd(`${id}#${k}`) : null}>
      <span className="where">{name}</span>
    </LubecEmptySlot>
  )
}

// A thing in both hands fills the row; otherwise each hand or body slot is its own box (Rules W3 and W4).
function SlotRow(props: RowProps) {
  const both = props.id === 'hands' ? itemsIn(props.gear, 'hands').find(bothHands) : undefined
  return (
    <div className="slot-row">
      {both ? (
        <ItemSlot item={both} where={`Both hands${both.size > 1 ? ` / ${both.size} slots` : ''}`} className=" both" supplyName={props.supplyName} />
      ) : (
        <>
          <SlotAt {...props} k={0} />
          <SlotAt {...props} k={1} />
        </>
      )}
    </div>
  )
}

type PanelsProps = Omit<RowProps, 'id'>

/** The Hands and Body panels, each with its two slots, and Rule W3 in plain words under the hands (B's renderRow). */
export function LubecGearHandsBody(props: PanelsProps) {
  return (
    <div className="hb">
      <div className="panel blue">
        <div className="section-head"><h2>Hands</h2><span className="count"><b>{handsTaken(props.gear).size}</b> of 2 used</span></div>
        <SlotRow {...props} id="hands" />
        <p className="note hands-note">One thing per hand, or one thing of any size up to 8 slots in both. Heavy takes both.</p>
      </div>
      <div className="panel pine">
        <div className="section-head"><h2>Body</h2><span className="count"><b>{bodyTaken(props.gear).size}</b> of 2 used</span></div>
        <SlotRow {...props} id="body" />
      </div>
    </div>
  )
}

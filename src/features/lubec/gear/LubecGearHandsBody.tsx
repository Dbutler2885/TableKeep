import { bodyTaken, bothHands, handsTaken, itemsIn } from '../../ruleSets/lubec/gear/placement'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { heavyClass, SLOT_NAMES, type LubecSupplyName } from './gearLabels'
import type { LubecGearAdd, LubecGearOpen } from './LubecGearPack'
import { LubecEmptySlot, LubecItemBox, LubecSlotPic, LubecSlotText } from './LubecGearSlot'
import { LUBEC_HANDS_MARK } from './dragGeometry'
import { useLubecDropClass } from './lubecDragMarks'

type RowId = 'hands' | 'body'

type RowProps = { gear: LubecGear; id: RowId; supplyName: LubecSupplyName; onAdd: LubecGearAdd; onOpen: LubecGearOpen }

type ItemSlotProps = { item: LubecItem; where: string; drop: string; className?: string; supplyName: LubecSupplyName; onOpen: LubecGearOpen }

function ItemSlot({ item, where, drop, className = '', supplyName, onOpen }: ItemSlotProps) {
  return (
    <LubecItemBox item={item} className={`slot item${className}${heavyClass(item)}`} drop={drop} onOpen={onOpen && onOpen.item}>
      <span className="where">{where}</span>
      <LubecSlotPic item={item} />
      <LubecSlotText item={item} supplyName={supplyName} />
    </LubecItemBox>
  )
}

function SlotAt({ gear, id, supplyName, onAdd, onOpen, k }: RowProps & { k: 0 | 1 }) {
  const item = itemsIn(gear, id).find((x) => x.slot === k)
  const name = SLOT_NAMES[id][k]
  if (item) return <ItemSlot item={item} where={name} drop={`${id}#${k}`} supplyName={supplyName} onOpen={onOpen} />
  return (
    <LubecEmptySlot drop={`${id}#${k}`} label={`${name}, empty, add an item`} onAdd={onAdd ? () => onAdd(`${id}#${k}`) : null}>
      <span className="where">{name}</span>
    </LubecEmptySlot>
  )
}

// A thing in both hands fills the row; otherwise each hand or body slot is its own box (Rules W3 and W4).
// The hands row is one place for a thing that takes both hands (Rule M7).
function SlotRow(props: RowProps) {
  const both = props.id === 'hands' ? itemsIn(props.gear, 'hands').find(bothHands) : undefined
  const mark = props.id === 'hands' ? LUBEC_HANDS_MARK : undefined
  return (
    <div className={`slot-row${useLubecDropClass(mark ?? '')}`} data-mark={mark}>
      {both ? (
        <ItemSlot item={both} where={`Both hands${both.size > 1 ? ` / ${both.size} slots` : ''}`} drop="hands" className=" both" supplyName={props.supplyName} onOpen={props.onOpen} />
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

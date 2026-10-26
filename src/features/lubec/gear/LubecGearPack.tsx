import type { CSSProperties } from 'react'
import { capacity, itemsIn, packMain, pocketUsed, used } from '../../ruleSets/lubec/gear/placement'
import { LUBEC_BACKPACK_POCKETS, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import backpackNavy from './assets/backpack4-navy.webp'
import { lubecPackLayout, lubecSpotsRect, type LubecPackLayout, type LubecPackSpot } from './backpackSlots'
import { heavyClass, largeClass, uprightClass, type LubecSupplyName } from './gearLabels'
import { LubecEmptySlot, LubecSlotPic, LubecSlotText } from './LubecGearSlot'
import { useLubecPackCrop } from './useLubecPackCrop'

/** Opens the add form at a place ("backpack#0", "hands#1", ...); null for a viewer who may only look. */
export type LubecGearAdd = ((dest: string) => void) | null

type PackProps = { gear: LubecGear; supplyName: LubecSupplyName; onAdd: LubecGearAdd }

const addAt = (onAdd: LubecGearAdd, dest: string) => (onAdd ? () => onAdd(dest) : null)

function PackItem({ item, className, style, supplyName }: { item: LubecItem; className: string; style: CSSProperties; supplyName: LubecSupplyName }) {
  return (
    <div className={`slot item${className}${heavyClass(item)}`} style={style}>
      <LubecSlotPic item={item} />
      <LubecSlotText item={item} supplyName={supplyName} sizeTag />
    </div>
  )
}

// The main pocket: the five boxes, each thing in the boxes it sits in, the big thing first (Rule W2).
function MainPocket({ gear, spots, supplyName, onAdd }: PackProps & { spots: LubecPackSpot[] }) {
  const main = packMain(gear) ?? { cells: new Array(spots.length).fill(null), placed: [] }
  return (
    <>
      {main.cells.map((item, k) => (item ? null : (
        <LubecEmptySlot key={`cell-${k}`} style={lubecSpotsRect([spots[k]])} label="Empty main-pocket slot, add an item" onAdd={addAt(onAdd, 'backpack#0')} />
      )))}
      {main.placed.map(({ item, at }) => (
        <PackItem
          key={item.id}
          item={item}
          className={`${largeClass(item)}${uprightClass(item, at)}`}
          style={lubecSpotsRect(at.map((k) => spots[k]))}
          supplyName={supplyName}
        />
      ))}
    </>
  )
}

function FrontPockets({ gear, spots, supplyName, onAdd }: PackProps & { spots: LubecPackSpot[] }) {
  return [1, 2].map((k) => {
    const item = itemsIn(gear, 'backpack').find((x) => x.pocket === k)
    const style = lubecSpotsRect([spots[k - 1]])
    if (item) return <PackItem key={item.id} item={item} className=" pocket" style={style} supplyName={supplyName} />
    const side = k === 1 ? 'left' : 'right'
    return <LubecEmptySlot key={`front-${k}`} style={style} label={`Front ${side} pocket, empty, add an item`} onAdd={addAt(onAdd, `backpack#${k}`)} />
  })
}

const smallLabel = (i: LubecItem) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`

// Two names at most, then a count, so the pill never has to clip.
function smallNames(small: readonly LubecItem[], canAdd: boolean): string {
  if (!small.length) return canAdd ? '+ Add' : 'Empty'
  return small.slice(0, 2).map(smallLabel).join(', ') + (small.length > 2 ? ` +${small.length - 2} more` : '')
}

// Small stuff: things too small to count, which take no slot in the bag (Rule S4).
function SmallStuff({ gear, spot, onAdd }: { gear: LubecGear; spot: LubecPackSpot; onAdd: LubecGearAdd }) {
  const small = itemsIn(gear, 'backpack').filter((i) => i.pocket == null)
  const style = { left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, minHeight: `${spot.h}%` }
  const inner = (
    <>
      <span className="label">Small stuff{small.length ? ` / ${small.length}` : ''}</span>
      <span className="names">{smallNames(small, onAdd !== null)}</span>
    </>
  )
  if (!onAdd) return <div className="small-stuff" style={style}>{inner}</div>
  const label = `Small stuff: ${small.length ? small.map(smallLabel).join(', ') : 'empty'}`
  return <button type="button" className="small-stuff" style={style} aria-label={label} onClick={() => onAdd('backpack#small')}>{inner}</button>
}

function ZoneLabels({ gear, labels }: { gear: LubecGear; labels: LubecPackLayout['labels'] }) {
  return (
    <>
      <span className="zone-label" style={{ left: `${labels.main.x}%`, top: `${labels.main.y}%` }}>Main pocket / {pocketUsed(gear, 'backpack', 0)} of 5</span>
      <span className="zone-label" style={{ left: `${labels.front.x}%`, top: `${labels.front.y}%` }}>Front pockets</span>
    </>
  )
}

/** The Backpack panel: the pack's picture with its five main boxes, the small stuff pill and the two front boxes on it (B's renderPack). */
export function LubecGearPack({ gear, supplyName, onAdd }: PackProps) {
  const layout = lubecPackLayout(useLubecPackCrop())
  const cap = capacity(LUBEC_BACKPACK_POCKETS)
  const full = used(gear, 'backpack')
  return (
    <div className="panel rust">
      <div className="section-head">
        <h2>Backpack</h2>
        <span className="count"><b>{full}</b> of {cap} used / {cap - full} free</span>
      </div>
      <div className="pack" style={layout.style as CSSProperties}>
        <span
          className="pack-art"
          role="img"
          aria-label="A worn navy canvas backpack with a mustard, red and white stripe, a top handle and two zip front pockets"
          style={{ backgroundImage: `url(${backpackNavy})` }}
        />
        <ZoneLabels gear={gear} labels={layout.labels} />
        <MainPocket gear={gear} spots={layout.main} supplyName={supplyName} onAdd={onAdd} />
        <FrontPockets gear={gear} spots={layout.front} supplyName={supplyName} onAdd={onAdd} />
        <SmallStuff gear={gear} spot={layout.small} onAdd={onAdd} />
      </div>
    </div>
  )
}

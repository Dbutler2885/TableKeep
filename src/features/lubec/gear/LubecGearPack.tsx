import type { CSSProperties } from 'react'
import { capacity, itemsIn, packMain, pocketUsed, used } from '../../ruleSets/lubec/gear/placement'
import { LUBEC_BACKPACK_POCKETS, lubecBackpackArt, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_BACKPACK_ARTS, type LubecBackpackArt } from './backpackArt'
import { lubecPackLayout, lubecSpotsRect, type LubecPackLayout, type LubecPackSpot } from './backpackSlots'
import { heavyClass, largeClass, uprightClass, type LubecSupplyName } from './gearLabels'
import { LubecEmptySlot, LubecItemBox, LubecSlotPic, LubecSlotText } from './LubecGearSlot'
import { LubecChangePack } from './LubecPackPicker'
import type { LubecDropTarget } from './dragGeometry'
import { useLubecDragView, useLubecDropClass } from './lubecDragMarks'
import { useLubecBackpackUrl } from './useLubecBackpackUrl'
import { useLubecPackCrop } from './useLubecPackCrop'

/** Opens the add form at a place ("backpack#0", "hands#1", ...); null for a viewer who may only look. */
export type LubecGearAdd = ((dest: string) => void) | null

/** Opens the item sheet: an item's card, the small stuff list, or which of a part's pieces of armor; null for a viewer who may only look. */
export type LubecGearOpen = { item: (itemId: string) => void; small: () => void; pieces: (part: string) => void } | null

type PackProps = { gear: LubecGear; supplyName: LubecSupplyName; onAdd: LubecGearAdd; onOpen: LubecGearOpen }

const addAt = (onAdd: LubecGearAdd, dest: string) => (onAdd ? () => onAdd(dest) : null)

type PackItemProps = { item: LubecItem; className: string; style: CSSProperties; drop?: string; supplyName: LubecSupplyName; onOpen: LubecGearOpen }

function PackItem({ item, className, style, drop, supplyName, onOpen }: PackItemProps) {
  return (
    <LubecItemBox item={item} className={`slot item${className}${heavyClass(item)}`} style={style} drop={drop} onOpen={onOpen && onOpen.item}>
      <LubecSlotPic item={item} />
      <LubecSlotText item={item} supplyName={supplyName} sizeTag />
    </LubecItemBox>
  )
}

// The main pocket: the five boxes, each thing in the boxes it sits in, the big thing first (Rule W2).
function MainPocket({ gear, spots, supplyName, onAdd, onOpen }: PackProps & { spots: LubecPackSpot[] }) {
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
          onOpen={onOpen}
        />
      ))}
    </>
  )
}

function FrontPockets({ gear, spots, supplyName, onAdd, onOpen }: PackProps & { spots: LubecPackSpot[] }) {
  return [1, 2].map((k) => {
    const item = itemsIn(gear, 'backpack').find((x) => x.pocket === k)
    const style = lubecSpotsRect([spots[k - 1]])
    if (item) return <PackItem key={item.id} item={item} className=" pocket" style={style} drop={`backpack#${k}`} supplyName={supplyName} onOpen={onOpen} />
    const side = k === 1 ? 'left' : 'right'
    return <LubecEmptySlot key={`front-${k}`} style={style} drop={`backpack#${k}`} label={`Front ${side} pocket, empty, add an item`} onAdd={addAt(onAdd, `backpack#${k}`)} />
  })
}

const smallLabel = (i: LubecItem) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`

// Two names at most, then a count, so the pill never has to clip.
function smallNames(small: readonly LubecItem[], canAdd: boolean): string {
  if (!small.length) return canAdd ? '+ Add' : 'Empty'
  return small.slice(0, 2).map(smallLabel).join(', ') + (small.length > 2 ? ` +${small.length - 2} more` : '')
}

const SMALL = 'backpack#small'

// Small stuff: things too small to count, which take no slot in the bag (Rule S4). The pill opens their list.
function SmallStuff({ gear, spot, onOpen }: { gear: LubecGear; spot: LubecPackSpot; onOpen: LubecGearOpen }) {
  const small = itemsIn(gear, 'backpack').filter((i) => i.pocket == null)
  const style = { left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, minHeight: `${spot.h}%` }
  const box = { className: `small-stuff${useLubecDropClass(SMALL)}`, style, 'data-drop': SMALL }
  const inner = (
    <>
      <span className="label">Small stuff{small.length ? ` / ${small.length}` : ''}</span>
      <span className="names">{smallNames(small, onOpen !== null)}</span>
    </>
  )
  if (!onOpen) return <div {...box}>{inner}</div>
  const label = `Small stuff: ${small.length ? small.map(smallLabel).join(', ') : 'empty'}`
  return <button type="button" {...box} aria-label={label} onClick={onOpen.small}>{inner}</button>
}

// An open box's mark sits 2 pixels inside the box, so neighbouring marks never touch.
const insetSpot = (p: LubecPackSpot) =>
  ({ left: `calc(${p.x}% + 2px)`, top: `calc(${p.y}% + 2px)`, width: `calc(${p.w}% - 4px)`, height: `calc(${p.h}% - 4px)` })

// While a thing is dragged, the main pocket's open boxes are marked, and the boxes it would take under the pointer (Rule W2).
const ALL_BOXES = [0, 1, 2, 3, 4]

// The boxes the thing would take under the pointer: the ones it is over, or the whole pocket when it packs afresh.
function footOf(hot: LubecDropTarget | null): readonly number[] | null {
  if (!hot?.ok) return null
  return hot.cells ?? (hot.repack ? ALL_BOXES : null)
}

function DropMarks({ spots }: { spots: LubecPackSpot[] }) {
  const view = useLubecDragView()
  if (!view) return null
  const hot = footOf(view.hot)
  return (
    <>
      {view.cells.map((k) => <span key={k} className="drop-cell" style={insetSpot(spots[k])} aria-hidden="true" />)}
      {hot ? <span className="drop-foot" style={lubecSpotsRect(hot.map((k) => spots[k]))} aria-hidden="true" /> : null}
    </>
  )
}

function ZoneLabels({ gear, labels }: { gear: LubecGear; labels: LubecPackLayout['labels'] }) {
  return (
    <>
      <span className="zone-label" style={{ left: `${labels.main.x}%`, top: `${labels.main.y}%` }}>Main pocket / {pocketUsed(gear, 'backpack', 0)} of 5</span>
      <span className="zone-label" style={{ left: `${labels.front.x}%`, top: `${labels.front.y}%` }}>Front pockets</span>
    </>
  )
}

/** Saves the character's next gear; null for a viewer who may only look. */
type GearChange = ((gear: LubecGear) => void) | null

type HeadProps = { gear: LubecGear; art: LubecBackpackArt; onGearChange: GearChange }

// The header bar: the name, the count, and "Change pack" for the owner and the GM.
function PackHead({ gear, art, onGearChange }: HeadProps) {
  const cap = capacity(LUBEC_BACKPACK_POCKETS)
  const full = used(gear, 'backpack')
  return (
    <div className="section-head">
      <h2>Backpack</h2>
      <span className="head-end">
        <span className="count"><b>{full}</b> of {cap} used / {cap - full} free</span>
        {onGearChange ? <LubecChangePack art={art} onPick={(name) => onGearChange({ ...gear, backpackArt: name })} /> : null}
      </span>
    </div>
  )
}

// The chosen pack's picture: the same box on every pack, so the slots never move with it.
function PackArt({ art }: { art: LubecBackpackArt }) {
  const url = useLubecBackpackUrl(art)
  return <span className="pack-art" role="img" aria-label={`Backpack picture: ${art}`} style={url ? { backgroundImage: `url(${url})` } : undefined} />
}

/** The Backpack panel: the pack's picture with its five main boxes, the small stuff pill and the two front boxes on it (B's renderPack). */
export function LubecGearPack({ gear, supplyName, onAdd, onOpen, onGearChange }: PackProps & { onGearChange: GearChange }) {
  const layout = lubecPackLayout(useLubecPackCrop())
  const art = lubecBackpackArt(gear, LUBEC_BACKPACK_ARTS) as LubecBackpackArt
  return (
    <div className="panel rust">
      <PackHead gear={gear} art={art} onGearChange={onGearChange} />
      <div className="pack" style={layout.style as CSSProperties}>
        <PackArt art={art} />
        <ZoneLabels gear={gear} labels={layout.labels} />
        <MainPocket gear={gear} spots={layout.main} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
        <FrontPockets gear={gear} spots={layout.front} supplyName={supplyName} onAdd={onAdd} onOpen={onOpen} />
        <SmallStuff gear={gear} spot={layout.small} onOpen={onOpen} />
        <DropMarks spots={layout.main} />
      </div>
    </div>
  )
}

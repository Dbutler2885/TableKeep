import { useState } from 'react'
import { lubecArmorAt } from '../../ruleSets/lubec/gear/armorAt'
import { layersUsed, wornOn } from '../../ruleSets/lubec/gear/armorLayers'
import { baseLoc, LOC_KEYS, locName, locSummary, RULES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { itemsIn } from '../../ruleSets/lubec/gear/placement'
import { armorSome, armorText, armorVs, WOUND_KINDS, WOUND_SHORT } from './itemLabels'
import { LUBEC_WORN_MARK } from './dragGeometry'
import { useLubecDropClass } from './lubecDragMarks'
import { LubecBodyDrawing } from './LubecBodyMap'
import { LubecPicture } from './LubecGearArt'
import type { LubecGearAdd, LubecGearOpen } from './LubecGearPack'
import { LubecWeightTag } from './LubecGearSlot'

// The Armor panel on On you, copied from the inventory prototype (B's
// renderArmor, showReadout and lightArmor): the body with what is worn shaded,
// the worn list, and the readout of the part pointed at. Hovering or focusing
// a piece in the list lights the parts it covers; pointing at a part lights
// the pieces on it, and the parts they cover.

/** What is pointed at: a part of the body, or a piece in the list. */
type Pointing = { part: string | null; piece: string | null }

const NOWHERE: Pointing = { part: null, piece: null }

// The pieces lit: the one pointed at in the list, or the ones on the part pointed at.
function litPieces(gear: LubecGear, at: Pointing): LubecItem[] {
  if (at.piece) return gear.items.filter((i) => i.id === at.piece)
  return at.part ? wornOn(gear, at.part) : []
}

const partsUnder = (pieces: readonly LubecItem[]) => LOC_KEYS.filter((k) => pieces.some((a) => (a.locs ?? []).includes(k)))

/** One part's armor against each kind of wound, shown while a part is pointed at. */
function Readout({ gear, part }: { gear: LubecGear; part: string | null }) {
  if (!part) {
    return (
      <div className="readout" aria-live="polite">
        <div className="head"><span>Point at a part</span></div>
        <dl className="wounds">{WOUND_KINDS.map((w) => <div key={w}><dt>{WOUND_SHORT[w]}</dt><dd>–</dd></div>)}</dl>
        <p>Tap worn armor to open it.</p>
      </div>
    )
  }
  const who = wornOn(gear, part).map((a) => a.name)
  return (
    <div className="readout" aria-live="polite">
      <div className="head"><span>{locName(part)}</span><small>{layersUsed(gear, part)} of {RULES.layers[baseLoc(part)]} layers</small></div>
      <dl className="wounds">
        {WOUND_KINDS.map((w) => {
          const n = lubecArmorAt(gear, part, w)
          return <div key={w} className={n ? 'some' : undefined}><dt>{WOUND_SHORT[w]}</dt><dd>{armorText(n)}</dd></div>
        })}
      </dl>
      <p>{who.length ? who.join(', ') : 'Nothing worn here.'}</p>
    </div>
  )
}

type RowProps = { piece: LubecItem; lit: boolean; onPoint: (id: string | null) => void; onOpen: LubecGearOpen }

function RowInner({ piece }: { piece: LubecItem }) {
  return (
    <>
      <LubecPicture item={piece} frame="thumb" />
      <span>{piece.name}<small>{locSummary(piece.locs ?? [])}</small></span>
      <span className="tags">
        {armorSome((w) => armorVs(piece, w)).map((t) => <span key={t} className="tag">{t}</span>)}
        {piece.exclusive ? <span className="tag blue">Exclusive</span> : null}
        <LubecWeightTag item={piece} />
      </span>
    </>
  )
}

// A worn piece opens its card; for a viewer who may only look, the row is plain.
function WornRow({ piece, lit, onPoint, onOpen }: RowProps) {
  const point = { onMouseOver: () => onPoint(piece.id), onFocus: () => onPoint(piece.id), onBlur: () => onPoint(null) }
  if (!onOpen) return <div className={`row-item static${lit ? ' lit' : ''}`} {...point}><RowInner piece={piece} /></div>
  return <button type="button" className={`row-item${lit ? ' lit' : ''}`} onClick={() => onOpen.item(piece.id)} {...point}><RowInner piece={piece} /></button>
}

// Tapping a part opens its armor; with more than one piece there, the sheet asks which.
function tapPart(gear: LubecGear, onOpen: LubecGearOpen, k: string) {
  const pieces = wornOn(gear, k)
  if (!onOpen || !pieces.length) return
  if (pieces.length === 1) onOpen.item(pieces[0].id)
  else onOpen.pieces(k)
}

type ArmorProps = { gear: LubecGear; onAdd: LubecGearAdd; onOpen: LubecGearOpen }

/** The Armor panel: the count and "+ Make armor", the body, the worn list and the readout (Rules A1 to A3, W5). */
export function LubecGearArmor({ gear, onAdd, onOpen }: ArmorProps) {
  const [at, setAt] = useState<Pointing>(NOWHERE)
  const dropClass = useLubecDropClass(LUBEC_WORN_MARK)
  const worn = itemsIn(gear, 'worn')
  const lit = litPieces(gear, at)
  const onPart = (part: string | null) => setAt({ part, piece: null })
  return (
    <div className="panel rust armor-panel">
      <div className="section-head">
        <h2>Armor</h2>
        <span className="head-end">
          <span className="count"><b>{worn.length}</b> worn / takes no slots</span>
          {onAdd ? <button type="button" className="btn line small" onClick={() => onAdd('worn')}>+ Make armor</button> : null}
        </span>
      </div>
      {/* The drawing and the list are where armor not worn yet is dropped to put it on (Rule M7). */}
      <div className={`armor-wrap${dropClass}`} data-mark={LUBEC_WORN_MARK}>
        <div className="body-col">
          <LubecBodyDrawing gear={gear} picked={[]} use={onOpen ? 'opens' : 'shows'} lit={partsUnder(lit)}
            onTap={(k) => tapPart(gear, onOpen, k)} onPoint={onPart} onFocusPart={onPart} />
        </div>
        <div className="armor-side">
          <div className="row-list" onMouseLeave={() => setAt(NOWHERE)}>
            {worn.map((a) => <WornRow key={a.id} piece={a} lit={lit.includes(a)} onPoint={(piece) => setAt({ part: null, piece })} onOpen={onOpen} />)}
          </div>
          <Readout gear={gear} part={at.part} />
        </div>
      </div>
    </div>
  )
}

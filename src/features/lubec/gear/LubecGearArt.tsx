import type { ReactNode } from 'react'
import type { LubecItem, LubecItemKind } from '../../ruleSets/lubec/gear/gearRecord'
import { isLubecArt, lubecPictureShape, type LubecShape } from './gearArt'

// The item pictures, copied from the inventory prototype (B): the five kind
// icons, and twelve of its stock drawings. B calls the drawings placeholder
// sketches; the other eight are not shipped, and the stock items that used
// them show their kind's icon (spec 7.3). Every drawing is in B's stroke:
// 2.6 wide, the sheet's ink, round caps. Its fills name the sheet's tokens
// by class (`fd` paper-deep, `fc` cream, `fi` ink, `fr` rust; `sr`, `sc`,
// `sd` and `sn` for a stroke in rust, cream, paper-deep or none).

const SHAPE_BOX: Readonly<Record<LubecShape, string>> = { tall: '0 0 80 120', wide: '0 0 120 80', square: '0 0 100 100' }

/** The drawings, by key: their shape and their marks. */
const LUBEC_ART: Readonly<Record<string, readonly [LubecShape, ReactNode]>> = {
  flashlight: ['tall', <><path d="M30 9l-5-5M40 7V1M50 9l5-5" strokeWidth="2" /><path className="fd" d="M22 14h36l-5 22H27z" /><path d="M22 14h36" strokeWidth="4" /><rect className="fc" x="29" y="36" width="22" height="70" rx="3" /><rect className="fi" x="35" y="46" width="10" height="13" rx="2" /><path d="M29 72h22M29 78h22M29 84h22M29 90h22" strokeWidth="1.6" /><rect className="fd" x="31" y="106" width="18" height="8" rx="2" /></>],
  rope: ['square', <><ellipse className="fd" cx="50" cy="52" rx="40" ry="31" /><ellipse cx="50" cy="52" rx="31" ry="23" /><ellipse cx="50" cy="52" rx="22" ry="16" /><ellipse className="fc" cx="50" cy="52" rx="13" ry="9" /><path d="M18 34l5 4M30 25l3 5M46 21l1 6M64 22l-1 6M80 30l-4 5M88 46l-6 2M14 54h6M20 72l5-4M38 82l2-6M60 82l-1-6M78 74l-4-4" strokeWidth="1.6" /><path d="M84 66c8 10 4 22-10 26" strokeWidth="6" /><path className="sd" d="M84 66c8 10 4 22-10 26" strokeWidth="2.4" /></>],
  compass: ['square', <><circle cx="50" cy="12" r="6" /><circle className="fd" cx="50" cy="55" r="36" /><circle className="fc" cx="50" cy="55" r="28" /><path d="M50 29v6M50 75v6M24 55h6M70 55h6" strokeWidth="2" /><path className="fr sr" d="M50 33l7 22H43z" strokeWidth="1.6" /><path className="fc" d="M50 77l7-22H43z" strokeWidth="1.6" /><circle className="fi" cx="50" cy="55" r="2.4" /></>],
  knife: ['wide', <><path className="fc" d="M64 41h44q-3 10-16 13H64z" /><path d="M70 45h8" strokeWidth="1.4" /><rect className="fr" x="12" y="39" width="58" height="20" rx="10" /><circle className="fc" cx="23" cy="49" r="2" /><circle className="fc" cx="59" cy="49" r="2" /><rect className="fc" x="35" y="45" width="12" height="8" rx="1" strokeWidth="1.4" /></>],
  bat: ['wide', <><path className="fd" d="M18.6 59.3L58.4 38.4L82.8 20.2L101.4 10.5A8 8 0 0 1 108.8 24.7L90.2 34.4L61.4 44L21.4 64.7Z" /><circle className="fd" cx="16" cy="65" r="5.5" /><path d="M27 53.9l3.7 7M32.4 51.1l3.7 7M37.7 48.3l3.7 7" strokeWidth="1.8" /><path d="M87 25.5l13-6.8" strokeWidth="1.4" /></>],
  revolver: ['wide', <><rect className="fd" x="58" y="22" width="50" height="9" /><path className="fi" d="M103 22v-4h4v4z" /><path d="M62 35h32" strokeWidth="2" /><path className="fi" d="M38 24l-10-8 2 10z" /><path className="fr" d="M40 42l-10 28q-1 6 5 6h14q5 0 5-5l2-29z" /><rect className="fd" x="38" y="19" width="24" height="25" rx="4" /><path d="M44 21v21M50 21v21M56 21v21" strokeWidth="1.4" /><path d="M56 44q2 14 16 8v-8" /><path d="M61 44q3 5 1 9" strokeWidth="2" /></>],
  shotgun: ['wide', <><path className="fr" d="M40 27L14 33L4 48L9 53L24 46L40 41Z" /><path className="sc" d="M14 39q8-2 18-4" strokeWidth="1.2" /><path d="M46 40q2 10 10 3" /><path d="M50 40q2 4 0 7" strokeWidth="2" /><rect className="fd" x="56" y="25" width="60" height="5" strokeWidth="1.8" /><rect className="fd" x="56" y="30" width="60" height="5" strokeWidth="1.8" /><rect className="fr" x="60" y="35" width="26" height="6" rx="3" strokeWidth="1.8" /><rect className="fd" x="40" y="25" width="16" height="15" rx="2" /></>],
  helmet: ['square', <><path className="fd" d="M14 66C12 34 32 15 55 15C78 15 89 33 89 54L86 66Z" /><path d="M38 24l12-3M40 33l15-3M44 42l14-2" strokeWidth="3.4" /><path d="M14 66H86" strokeWidth="3.4" /><path className="fc" d="M28 66v12q14 8 28 0V66" /><path d="M30 77q18 18 46-3" strokeWidth="2" /><circle className="fi" cx="42" cy="72" r="2.2" /></>],
  gloves: ['square', <><path className="fd" d="M30 94V62L20 46Q18 39 25 39L35 51V22Q35 15 41 15Q46 15 46 22V46L48 13Q49 8 54 8Q60 9 59 14L57 46L61 18Q62 12 67 13Q72 14 71 20L67 50L71 31Q73 25 78 27Q81 29 80 34L74 66V94Z" /><rect className="fr" x="27" y="82" width="50" height="14" rx="2" /><path d="M37 64q12 6 26 0" strokeWidth="1.4" strokeDasharray="3 3" /></>],
  rounds38: ['square', <><path className="fd" d="M18 42L34 28H88L72 42Z" /><path className="fd" d="M42 35v-10q3-6 6 0v10M52 35v-10q3-6 6 0v10M62 35v-10q3-6 6 0v10" strokeWidth="1.8" /><path className="fd" d="M72 42L88 28V68L72 82Z" /><rect className="fc" x="18" y="42" width="54" height="40" /><text className="fi sn" x="45" y="68" textAnchor="middle" fontFamily="Courier New,monospace" fontWeight="700" fontSize="17">.38</text><path d="M24 50h42M24 75h42" strokeWidth="1.4" /></>],
  dcell: ['tall', <><rect className="fi" x="12" y="34" width="26" height="76" rx="3" /><rect className="fr" x="12" y="34" width="26" height="20" rx="3" /><rect className="fd" x="20" y="27" width="10" height="7" rx="1" /><rect className="fi" x="42" y="24" width="26" height="76" rx="3" /><rect className="fr" x="42" y="24" width="26" height="20" rx="3" /><rect className="fd" x="50" y="17" width="10" height="7" rx="1" /><path className="sc" d="M25 76v10M20 81h10M55 66v10M50 71h10" strokeWidth="2" /></>],
  canteen: ['tall', <><rect className="fr sr" x="33" y="5" width="14" height="9" rx="2" /><path d="M36 14v8M44 14v8" strokeWidth="2" /><path d="M47 9q26 4 25 36" strokeWidth="2" /><path className="fd" d="M40 22C18 22 9 42 9 66C9 95 21 113 40 113C59 113 71 95 71 66C71 42 62 22 40 22Z" /><path d="M12 56h56" strokeWidth="1.6" /><path d="M11 78q29 9 58 0" strokeWidth="1.6" /><path d="M24 92q16 8 32 0" strokeWidth="1.4" /></>],
}

/** A stock drawing, sized by its frame. */
export function LubecArt({ art }: { art: string }) {
  const [shape, inner] = LUBEC_ART[art]
  return (
    <svg className="art lubec-art" viewBox={SHAPE_BOX[shape]} aria-hidden="true">
      <g fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">{inner}</g>
    </svg>
  )
}

// With no picture, a plain outline for the kind stands in, so rows keep their shape (B's KIND_GLYPH).
const KIND_GLYPH: Readonly<Record<LubecItemKind, readonly string[]>> = {
  thing: ['M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8'],
  // Redrawn from B's slash, which read as a bare line at slot size: a blade, a crossguard and a grip, pointing the same way.
  weapon: ['M9.5 17.5L21 6V3h-3L6.5 14.5', 'M11 19l-6-6', 'M8 16l-4 4', 'M5 21l-2-2'],
  armor: ['M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'],
  consumable: ['M6 6c0-2 12-2 12 0v12c0 2-12 2-12 0zM6 6c0 2 12 2 12 0'],
  holder: ['M10 2.5h4M10.5 2.5v3M13.5 2.5v3', 'M12 5.5c-4.5 0-7 3-7 7.5 0 5 2.6 8.5 7 8.5s7-3.5 7-8.5c0-4.5-2.5-7.5-7-7.5z', 'M5.6 14h12.8'],
}

/** A kind's icon: the outline that stands in for an item with no picture, and the mark on its kind's tile. */
export function LubecKindGlyph({ kind }: { kind: LubecItemKind }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {KIND_GLYPH[kind].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

type Pictured = Pick<LubecItem, 'kind' | 'art' | 'shape'>

type FrameProps = { item: Pictured; frame: 'slot-pic' | 'thumb' | 'pic-in' | 'pic' }

/** An item's picture in a small frame: on a slot, in a list row, in the form's picture box, or on the picked-up card of a drag. Its kind's icon when it has none. */
export function LubecPicture({ item, frame }: FrameProps) {
  if (!isLubecArt(item.art)) return <span className={`${frame} none`} aria-hidden="true"><LubecKindGlyph kind={item.kind} /></span>
  return <span className={`${frame} ${lubecPictureShape(item)}`} aria-hidden="true"><LubecArt art={item.art} /></span>
}

/** A stock tile's picture: the drawing at its shape's size, or the kind's icon in a dashed frame. */
export function LubecTilePicture({ item }: { item: Pictured }) {
  if (!isLubecArt(item.art)) return <span className="tile-pic" aria-hidden="true"><span className="thumb none"><LubecKindGlyph kind={item.kind} /></span></span>
  return <span className={`tile-pic ${lubecPictureShape(item)}`} aria-hidden="true"><LubecArt art={item.art} /></span>
}

/** The card's picture beside the description, or the kind's icon in a dashed frame. */
export function LubecCardPicture({ item, name }: { item: Pictured; name: string }) {
  if (!isLubecArt(item.art)) {
    return <div className="card-pic none"><LubecKindGlyph kind={item.kind} /><span>No picture</span></div>
  }
  return <figure className={`card-pic ${lubecPictureShape(item)}`} role="img" aria-label={name}><LubecArt art={item.art} /></figure>
}

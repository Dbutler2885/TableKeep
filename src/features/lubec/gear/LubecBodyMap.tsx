import { useId, useState, type KeyboardEvent } from 'react'
import { lubecArmorAt } from '../../ruleSets/lubec/gear/armorAt'
import { layersUsed, wornOn } from '../../ruleSets/lubec/gear/armorLayers'
import { baseLoc, BODY_REGIONS, locName, RULES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import bodyInk from './assets/body-ink.webp'
import bodyMask from './assets/body-mask.png'
import { armorSome } from './itemLabels'

// The body drawing, copied from the inventory prototype (B's bodyMap): one
// tappable region per armor location, trimmed by the silhouette. It faces
// you, so the kid's right side is on your left. Dark is layers used, black is
// full, blue is picked; pointing at a part lights it rust. On you, a tap opens
// the armor on that part; in the armor maker, a tap picks the part.

const PARTS = Object.keys(BODY_REGIONS)

const limitOf = (k: string) => RULES.layers[baseLoc(k)]

// How dark a part is: the share of its layers used, black when full.
function shade(gear: LubecGear, k: string): number {
  const u = layersUsed(gear, k)
  if (!u) return 0
  return u >= limitOf(k) ? 0.9 : 0.22 + 0.45 * (u / limitOf(k))
}

/** A part's name for a screen reader and the tooltip: its layers, its armor, who covers it, and whether it is picked. */
function partLabel(gear: LubecGear, k: string, picked: boolean): string {
  const who = wornOn(gear, k).map((i) => i.name)
  const armor = armorSome((w) => lubecArmorAt(gear, k, w))
  return `${locName(k)}: ${layersUsed(gear, k)} of ${limitOf(k)} layers${armor.length ? `, armor ${armor.join(', ')}` : ''}${who.length ? ` (${who.join(', ')})` : ''}${picked ? ', picked' : ''}`
}

/** On you the drawing opens what is worn, or only shows it to a viewer who may only look; in the maker it picks parts. */
type BodyUse = 'opens' | 'shows' | 'picks'

type DrawingProps = {
  gear: LubecGear
  picked: readonly string[]
  use: BodyUse
  /** The parts lit rust. */
  lit: readonly string[]
  onTap: (k: string) => void
  /** The part the pointer is over, or null when it leaves the drawing. */
  onPoint: (k: string | null) => void
  /** The part focused, or null when focus leaves it; On you shows its readout. */
  onFocusPart?: (k: string | null) => void
}

const tapOnKey = (onTap: (k: string) => void, k: string) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onTap(k)
}

const DRAWING_LABEL: Readonly<Record<BodyUse, string>> = {
  opens: 'Body: tap armor to open it',
  shows: 'Body: point at a part to see its armor',
  picks: 'Body: tap a part to pick it',
}

// A part is a checkbox in the maker, and a button On you that does nothing where nothing is worn.
function partRole(gear: LubecGear, k: string, use: BodyUse, picked: boolean) {
  if (use === 'picks') return { role: 'checkbox', 'aria-checked': picked }
  return { role: 'button', 'aria-disabled': use === 'shows' || !wornOn(gear, k).length ? true : undefined }
}

function Shading({ gear, picked, lit }: Pick<DrawingProps, 'gear' | 'picked' | 'lit'>) {
  return (
    <>
      <rect className="base" width="620" height="1290" />
      {PARTS.filter((k) => shade(gear, k)).map((k) => <polygon key={k} className="worn" points={BODY_REGIONS[k]} fillOpacity={shade(gear, k).toFixed(2)} />)}
      {PARTS.filter((k) => picked.includes(k)).map((k) => <polygon key={k} className="picked" points={BODY_REGIONS[k]} />)}
      {PARTS.map((k) => <polygon key={k} className={`hl${lit.includes(k) ? ' on' : ''}`} points={BODY_REGIONS[k]} />)}
    </>
  )
}

function Parts({ gear, picked, use, onTap, onPoint, onFocusPart }: Omit<DrawingProps, 'lit'>) {
  return PARTS.map((k) => {
    const label = partLabel(gear, k, picked.includes(k))
    return (
      <polygon key={k} className="hit" points={BODY_REGIONS[k]} tabIndex={0} {...partRole(gear, k, use, picked.includes(k))} aria-label={label}
        onClick={() => onTap(k)} onKeyDown={tapOnKey(onTap, k)} onMouseOver={() => onPoint(k)}
        onFocus={onFocusPart && (() => onFocusPart(k))} onBlur={onFocusPart && (() => onFocusPart(null))}>
        <title>{label}</title>
      </polygon>
    )
  })
}

/** The body drawing and its legend; the maker's adds "Picked". */
export function LubecBodyDrawing(props: DrawingProps) {
  const mask = `${useId()}-m`
  const { gear, picked, use, lit, onPoint } = props
  return (
    <>
      <svg className="body-map" viewBox="0 0 620 1290" role="group" aria-label={DRAWING_LABEL[use]} onMouseLeave={() => onPoint(null)}>
        <defs><mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="620" height="1290"><image href={bodyMask} width="620" height="1290" /></mask></defs>
        <g mask={`url(#${mask})`}><Shading gear={gear} picked={picked} lit={lit} /></g>
        <image href={bodyInk} width="620" height="1290" pointerEvents="none" />
        <text className="side-label" x="18" y="300">R</text><text className="side-label" x="572" y="300">L</text>
        <Parts {...props} />
      </svg>
      <p className="map-legend">
        <span><i className="legend-layers" />Layers on</span><span><i className="legend-full" />Full</span>
        {use === 'picks' ? <span><i className="legend-picked" />Picked</span> : null}
      </p>
    </>
  )
}

type MapProps = { gear: LubecGear; picked: readonly string[]; onTap: (k: string) => void }

/** The armor maker's body: tap a part to pick it. Parts already full show dark while you pick, and the one pointed at lights rust. */
export function LubecBodyMap({ gear, picked, onTap }: MapProps) {
  const [lit, setLit] = useState<string | null>(null)
  return <LubecBodyDrawing gear={gear} picked={picked} use="picks" lit={lit ? [lit] : []} onTap={onTap} onPoint={setLit} />
}

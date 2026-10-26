import { useId, useState, type KeyboardEvent } from 'react'
import { layersUsed, wornOn } from '../../ruleSets/lubec/gear/armorLayers'
import { baseLoc, BODY_REGIONS, locName, RULES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGear, LubecWoundKind } from '../../ruleSets/lubec/gear/gearRecord'
import bodyInk from './assets/body-ink.webp'
import bodyMask from './assets/body-mask.png'
import { armorSome } from './itemLabels'

// The body drawing, copied from the inventory prototype (B's bodyMap): one
// tappable region per armor location, trimmed by the silhouette. It faces
// you, so the kid's right side is on your left. Dark is layers used, black is
// full, blue is picked; pointing at a part lights it rust.

const PARTS = Object.keys(BODY_REGIONS)

const limitOf = (k: string) => RULES.layers[baseLoc(k)]

// How dark a part is: the share of its layers used, black when full.
function shade(gear: LubecGear, k: string): number {
  const u = layersUsed(gear, k)
  if (!u) return 0
  return u >= limitOf(k) ? 0.9 : 0.22 + 0.45 * (u / limitOf(k))
}

const armorOn = (gear: LubecGear, k: string) => (w: LubecWoundKind) =>
  wornOn(gear, k).reduce((n, a) => n + (a.armor?.[w] ?? 0), 0)

/** A part's name for a screen reader and the tooltip: its layers, its armor, who covers it, and whether it is picked. */
function partLabel(gear: LubecGear, k: string, picked: boolean): string {
  const who = wornOn(gear, k).map((i) => i.name)
  const armor = armorSome(armorOn(gear, k))
  return `${locName(k)}: ${layersUsed(gear, k)} of ${limitOf(k)} layers${armor.length ? `, armor ${armor.join(', ')}` : ''}${who.length ? ` (${who.join(', ')})` : ''}${picked ? ', picked' : ''}`
}

type MapProps = { gear: LubecGear; picked: readonly string[]; onTap: (k: string) => void }

const tapOnKey = (onTap: (k: string) => void, k: string) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onTap(k)
}

function Shading({ gear, picked, lit }: Omit<MapProps, 'onTap'> & { lit: string | null }) {
  return (
    <>
      <rect className="base" width="620" height="1290" />
      {PARTS.filter((k) => shade(gear, k)).map((k) => <polygon key={k} className="worn" points={BODY_REGIONS[k]} fillOpacity={shade(gear, k).toFixed(2)} />)}
      {PARTS.filter((k) => picked.includes(k)).map((k) => <polygon key={k} className="picked" points={BODY_REGIONS[k]} />)}
      {PARTS.map((k) => <polygon key={k} className={`hl${lit === k ? ' on' : ''}`} points={BODY_REGIONS[k]} />)}
    </>
  )
}

/** The armor maker's body: tap a part to pick it. Parts already full show dark while you pick. */
export function LubecBodyMap({ gear, picked, onTap }: MapProps) {
  const mask = `${useId()}-m`
  const [lit, setLit] = useState<string | null>(null)
  return (
    <>
      <svg className="body-map" viewBox="0 0 620 1290" role="group" aria-label="Body: tap a part to pick it" onMouseLeave={() => setLit(null)}>
        <defs><mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="620" height="1290"><image href={bodyMask} width="620" height="1290" /></mask></defs>
        <g mask={`url(#${mask})`}><Shading gear={gear} picked={picked} lit={lit} /></g>
        <image href={bodyInk} width="620" height="1290" pointerEvents="none" />
        <text className="side-label" x="18" y="300">R</text><text className="side-label" x="572" y="300">L</text>
        {PARTS.map((k) => {
          const label = partLabel(gear, k, picked.includes(k))
          return (
            <polygon key={k} className="hit" points={BODY_REGIONS[k]} tabIndex={0} role="checkbox" aria-checked={picked.includes(k)} aria-label={label}
              onClick={() => onTap(k)} onKeyDown={tapOnKey(onTap, k)} onMouseOver={() => setLit(k)}>
              <title>{label}</title>
            </polygon>
          )
        })}
      </svg>
      <p className="map-legend">
        <span><i className="legend-layers" />Layers on</span><span><i className="legend-full" />Full</span><span><i className="legend-picked" />Picked</span>
      </p>
    </>
  )
}

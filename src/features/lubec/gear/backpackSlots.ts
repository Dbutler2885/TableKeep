// Where the backpack's boxes sit on its picture, copied from the inventory
// prototype (B's BAG and CROPS). The positions are in the picture's own
// pixels, and every backpack picture is prepared on the same 1122x1402 canvas,
// so the boxes never move: a different pack is only a different picture.

/** A box on the picture: x, y, width and height in the picture's pixels. */
type Box = readonly [x: number, y: number, w: number, h: number]

/** The part of the picture the pack box shows. */
export type LubecPackCrop = { x: number; y: number; w: number; h: number }

// Where things sit on the navy backpack photo, in its own pixels (it is 1122 by 1402):
// the main pocket's three rows on the big front panel, and one box in each zip pocket, below its zip.
export const BAG = {
  size: [1122, 1402] as const,
  main: ([[238, 318], [572, 318], [238, 462], [572, 462], [238, 606]] as const).map(([x, y]): Box => [x, y, 320, 132]),
  small: [580, 614, 304, 116] as Box,
  front: [[226, 912, 290, 220], [606, 912, 300, 220]] as readonly Box[],
  mainLabel: [565, 292] as const,
  frontLabel: [566, 814] as const,
}

// The pack box is a crop of the photo around the bag; phones get a closer one, so the boxes stay big enough to read.
export const CROPS: Readonly<Record<'wide' | 'phone', LubecPackCrop>> = {
  wide: { x: 10, y: 110, w: 1100, h: 1120 },
  phone: { x: 130, y: 230, w: 860, h: 990 },
}

/** A box on the pack, in percent of the pack box. */
export type LubecPackSpot = { x: number; y: number; w: number; h: number }

export type LubecPackLayout = {
  main: LubecPackSpot[]
  small: LubecPackSpot
  front: LubecPackSpot[]
  labels: { main: { x: number; y: number }; front: { x: number; y: number } }
  /** The pack box's shape, and where the picture sits in it. */
  style: { '--bag-ratio': string; '--bag-size': string; '--bag-pos': string }
}

const pct = (v: number, from: number, of: number) => Math.round(((v - from) / of) * 10000) / 100

/** Every box and label on the pack, in percent of the pack box, for one crop. */
export function lubecPackLayout(crop: LubecPackCrop): LubecPackLayout {
  const [iw, ih] = BAG.size
  const spot = ([x, y, w, h]: Box): LubecPackSpot => ({ x: pct(x, crop.x, crop.w), y: pct(y, crop.y, crop.h), w: pct(w, 0, crop.w), h: pct(h, 0, crop.h) })
  const at = ([x, y]: readonly [number, number]) => ({ x: pct(x, crop.x, crop.w), y: pct(y, crop.y, crop.h) })
  return {
    main: BAG.main.map(spot),
    small: spot(BAG.small),
    front: BAG.front.map(spot),
    labels: { main: at(BAG.mainLabel), front: at(BAG.frontLabel) },
    style: {
      '--bag-ratio': `${crop.w} / ${crop.h}`,
      // A background position in percent lines up that share of the picture with the same share of the box.
      '--bag-size': `${pct(iw, 0, crop.w)}% auto`,
      '--bag-pos': `${pct(crop.x, 0, iw - crop.w)}% ${pct(crop.y, 0, ih - crop.h)}%`,
    },
  }
}

/** The CSS box that covers `spots`, in percent of the pack box. */
export function lubecSpotsRect(spots: readonly LubecPackSpot[]) {
  const x = Math.min(...spots.map((p) => p.x))
  const y = Math.min(...spots.map((p) => p.y))
  const w = Math.max(...spots.map((p) => p.x + p.w)) - x
  const h = Math.max(...spots.map((p) => p.y + p.h)) - y
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }
}

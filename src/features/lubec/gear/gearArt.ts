// Which drawings ship, and their shapes (spec 7.3). The drawings themselves
// are in `LubecGearArt.tsx`; `LubecGearArt.test.tsx` keeps the two lists equal.

import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'

export type LubecShape = NonNullable<LubecItem['shape']>

/** Three shapes. A stock drawing is drawn to its shape; an upload is cropped to whichever shape is picked. */
export const LUBEC_SHAPES: Readonly<Record<LubecShape, string>> = { tall: 'Tall', wide: 'Wide', square: 'Square' }

/** The twelve drawings that ship, each drawn to its shape: flashlight, rope, compass, knife, bat, revolver, shotgun, helmet, gloves, ammo box, batteries and canteen. */
export const LUBEC_ART_SHAPES: Readonly<Record<string, LubecShape>> = {
  flashlight: 'tall', rope: 'square', compass: 'square', knife: 'wide', bat: 'wide', revolver: 'wide',
  shotgun: 'wide', helmet: 'square', gloves: 'square', rounds38: 'square', dcell: 'tall', canteen: 'tall',
}

/** Whether `art` names a drawing that ships. An unknown key shows its kind's icon. */
export const isLubecArt = (art: string | undefined): art is string => art !== undefined && Object.hasOwn(LUBEC_ART_SHAPES, art)

/** An upload's shape, from its proportions (B's `pic-file` change). The three buttons change it. */
export function lubecShapeOfSize(width: number, height: number): LubecShape {
  const r = width / height
  if (r > 1.2) return 'wide'
  return r < 0.83 ? 'tall' : 'square'
}

/** The shape a picture is framed in: the one stored with it, else its drawing's. */
export const lubecPictureShape = (item: Pick<LubecItem, 'art' | 'shape'>): LubecShape =>
  item.shape ?? (isLubecArt(item.art) ? LUBEC_ART_SHAPES[item.art] : 'square')

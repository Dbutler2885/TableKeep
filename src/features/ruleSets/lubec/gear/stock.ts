// The game's stock, copied from the inventory prototype (B): its 20 items as
// typed data, with the baseball bat's Impact at +1 (the captain's feedback,
// spec 7.1). There is no weapon catalog here, and none goes in code: every
// item is one of the five kinds, written by hand.
//
// Rule T2: picking from stock copies it, and the copy never follows later
// changes. Rule T3: one entry stands for each design, so unchanged copies of
// the game's stock and exact repeats are left out of "This campaign".

import type { LubecItem } from './gearRecord'
import type { LubecItemDraft } from './stacks'

/** A stock entry: an item before it has an id or a place, with its stock id and the words a search also matches. */
export type LubecStockItem = LubecItemDraft & { sid: string; tags?: string }

type Extra = Partial<LubecStockItem>

// Every stock drawing is drawn to its shape; an entry takes its drawing's.
const SHAPE_OF: Readonly<Record<string, NonNullable<LubecItem['shape']>>> = {
  flashlight: 'tall', walkie: 'tall', multimeter: 'tall', camera: 'wide', rope: 'square', compass: 'square',
  bat: 'wide', knife: 'wide', revolver: 'wide', shotgun: 'wide', helmet: 'square', gloves: 'square',
  pads: 'wide', suit: 'tall', rounds38: 'square', shells: 'square', dcell: 'tall', sandwich: 'wide', moxie: 'tall', canteen: 'tall',
}

const S = (sid: string, kind: LubecItem['kind'], name: string, size: LubecItem['size'], art: string, extra: Extra = {}): LubecStockItem =>
  ({ sid, kind, name, size, art, shape: SHAPE_OF[art], weight: 'normal', qty: 1, note: '', ...extra })

/** The game's stock, in the game's rules settings. */
export const LUBEC_STOCK: readonly LubecStockItem[] = [
  S('flashlight', 'holder', 'Flashlight', 1, 'flashlight', { hold: 'load', takes: 'dcell', capacity: 2, loaded: 2, note: 'Two D batteries. About four hours of light.', tags: 'torch light' }),
  S('canteen', 'holder', 'Canteen', 1, 'canteen', { hold: 'fill', takes: 'water', capacity: 4, loaded: 4, note: 'Army surplus, a quart. Four good drinks.', tags: 'water bottle drink' }),
  S('walkie', 'thing', 'Walkie-talkie', 1, 'walkie', { note: 'About a mile over open water, less in town. They come in pairs.', tags: 'radio electronics' }),
  S('multimeter', 'thing', 'Multimeter', 1, 'multimeter', { note: 'Needle meter with red and black leads. From the Electronics & Radio kit.', tags: 'electronics meter' }),
  S('camera', 'thing', 'Instamatic camera', 1, 'camera', { note: 'Cartridge film, twelve shots, a flashcube on top.', tags: 'photo' }),
  S('rope', 'thing', 'Coil of rope', 1, 'rope', { note: 'Fifty feet of manila.' }),
  S('compass', 'thing', 'Pocket compass', 0, 'compass', { note: 'Scout compass. Points north, mostly.' }),
  S('bat', 'weapon', 'Baseball bat', 2, 'bat', { mode: 'melee', impact: 1, table: 'blunt', reach: 'long', wounds: ['blunt'], note: 'Wood, 34 inches.' }),
  S('knife', 'weapon', 'Pocketknife', 0, 'knife', { mode: 'melee', impact: 0, table: 'none', reach: 'short', wounds: ['cut', 'pierce'], note: 'One folding blade.' }),
  S('revolver', 'weapon', '.38 revolver', 1, 'revolver', { mode: 'firearm', impact: 1, table: 'gunshot', wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38', note: 'Six shots, double action.', tags: 'gun pistol' }),
  S('shotgun', 'weapon', "Dad's shotgun", 4, 'shotgun', { mode: 'firearm', impact: 2, table: 'gunshot', wounds: ['gun'], capacity: 2, loaded: 0, takes: 'a12g', note: 'Double-barrel 12-gauge. From the Firearms kit.', tags: 'gun' }),
  S('helmet', 'armor', 'Hockey helmet', 2, 'helmet', { armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 }, locs: ['head'], note: 'Hard shell, foam inside.' }),
  S('gloves', 'armor', 'Leather work gloves', 1, 'gloves', { armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, locs: ['hand-L', 'hand-R'], note: 'Stiff cowhide.' }),
  S('pads', 'armor', 'Football shoulder pads', 2, 'pads', { armor: { cut: 1, pierce: 0, blunt: 2, gun: 0 }, locs: ['torso', 'upperarm-L', 'upperarm-R'], note: 'High school hand-me-downs.' }),
  S('suit', 'armor', 'Snowmobile suit', 4, 'suit', { armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, exclusive: true, locs: ['torso', 'upperarm-L', 'upperarm-R', 'forearm-L', 'forearm-R', 'waist', 'groin', 'thigh-L', 'thigh-R', 'shin-L', 'shin-R'], note: 'One piece. Nothing else fits under it.' }),
  S('rounds38', 'holder', 'Box of .38 rounds', 1, 'rounds38', { hold: 'box', takes: 'a38', capacity: 50, loaded: 50, tags: 'ammo bullets' }),
  S('shells', 'holder', 'Box of 12-gauge shells', 1, 'shells', { hold: 'box', takes: 'a12g', capacity: 25, loaded: 25, tags: 'ammo shotgun' }),
  S('dcell', 'consumable', 'D batteries', 1, 'dcell', { qty: 2, per: 4, fits: 'dcell', tags: 'flashlight' }),
  S('sandwich', 'consumable', 'Peanut butter sandwich', 1, 'sandwich', { per: 2, note: 'In wax paper.', tags: 'food' }),
  S('moxie', 'consumable', 'Bottle of Moxie', 1, 'moxie', { per: 2, note: 'Maine soda. Tastes like root beer and medicine.', tags: 'drink soda food' }),
]

/** Everything an item copies from stock, or gives to the campaign's list. B's uploaded `img` is `picturePath` here. */
export const LUBEC_COPY_FIELDS = [
  'kind', 'name', 'size', 'weight', 'qty', 'note', 'mode', 'impact', 'table', 'reach', 'wounds', 'capacity', 'loaded', 'takes',
  'hold', 'locs', 'exclusive', 'armor', 'fits', 'per', 'art', 'picturePath', 'shape',
] as const

/** Rule T2: a deep copy of what an item is, never of where it is or which stock it came from. */
export function lubecCopyOf(src: Partial<LubecItem>): Partial<LubecItem> {
  const fields = LUBEC_COPY_FIELDS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])
  return structuredClone(Object.fromEntries(fields)) as Partial<LubecItem>
}

// Two entries are the same design when they differ only in what the form fills in by default, or in rounds loaded.
function lubecDesign(x: Partial<LubecItem>): string {
  const d = lubecCopyOf(x)
  delete d.loaded
  if (!d.exclusive) delete d.exclusive
  if (d.per === 1) delete d.per
  if (!d.note) delete d.note
  if (d.wounds) d.wounds = [...d.wounds].sort()
  return JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a], [b]) => a.localeCompare(b))))
}

/** Rule T3: whether two entries are one design. */
export const lubecSameDesign = (a: Partial<LubecItem>, b: Partial<LubecItem>): boolean => lubecDesign(a) === lubecDesign(b)

/**
 * Rule T3: the campaign's list as the picker offers it, newest first: one entry for each design,
 * leaving out unchanged copies of the game's stock. `made` is oldest first.
 */
export function lubecCampaignStock<T extends Partial<LubecItem>>(made: readonly T[], stock: readonly Partial<LubecItem>[] = LUBEC_STOCK): T[] {
  const seen: T[] = []
  for (const x of [...made].reverse()) {
    if (!stock.some((g) => lubecSameDesign(g, x)) && !seen.some((y) => lubecSameDesign(y, x))) seen.push(x)
  }
  return seen
}

const matches = (x: LubecStockItem, q: string) => `${x.name} ${x.tags ?? ''}`.toLowerCase().includes(q)

/** The entries whose name or search words hold `query`, every entry when it is blank. */
export const lubecStockMatching = <T extends LubecStockItem>(all: readonly T[], query: string): T[] => {
  const q = query.trim().toLowerCase()
  return all.filter((x) => matches(x, q))
}

/** The suggestions under the name: up to six matches, those of the kind being made first. None for a blank name. */
export function lubecStockSuggestions<T extends LubecStockItem>(all: readonly T[], query: string, kind: LubecItem['kind']): T[] {
  if (!query.trim()) return []
  return lubecStockMatching(all, query).sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind)).slice(0, 6)
}

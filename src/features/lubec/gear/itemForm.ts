// The add and edit form's fields, copied from the inventory prototype (B's
// openItemDialog, applyStock, the form's change handler and its submit).
// Pure: the fields in, the next fields or the draft out. Numbers are kept as
// typed, so a half-typed field never jumps; the draft reads them as B does.

import { KIND_NAMES, LOC_KEYS } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItem, LubecItemKind, LubecItemSize, LubecItemWeight, LubecWoundKind } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCopyOf } from '../../ruleSets/lubec/gear/stock'
import { perOf, type LubecDraftField, type LubecItemDraft } from '../../ruleSets/lubec/gear/stacks'
import type { LubecHoldWay } from '../../ruleSets/lubec/gear/gearRules'
import { isLubecArt, type LubecShape } from './gearArt'
import { armorVs, WOUND_KINDS } from './itemLabels'

/** The form's picture: a drawing's key and the shape it is framed in. */
export type LubecFormPicture = { art: string; shape: LubecShape }

export type LubecItemFields = {
  kind: LubecItemKind
  name: string
  note: string
  size: LubecItemSize
  weight: LubecItemWeight
  qty: string
  per: string
  /** The "Put it" choice. */
  dest: string
  picture: LubecFormPicture | null
  /** The name of the stock entry it was copied from. */
  stock: string | null
  mode: 'melee' | 'firearm'
  impact: string
  table: string
  wounds: LubecWoundKind[]
  reach: 'long' | 'short'
  wCapacity: string
  wLoaded: string
  wTakes: string
  armor: Record<LubecWoundKind, string>
  locs: string[]
  exclusive: boolean
  /** "Both sides at once": a tap on a paired part picks the pair. */
  bothSides: boolean
  fits: string
  hold: LubecHoldWay
  hCapacity: string
  hLoaded: string
  hTakes: string
}

const ZERO_ARMOR = { cut: '0', pierce: '0', blunt: '0', gun: '0' }

/** A new item's form, opened at `dest`: a Thing of one slot, or Small when opened from small stuff. */
export const lubecNewFields = (dest: string): LubecItemFields => ({
  kind: 'thing', name: '', note: '', size: dest.endsWith('#small') ? 0 : 1, weight: 'normal', qty: '1', per: '1', dest, picture: null, stock: null,
  mode: 'melee', impact: '0', table: 'blunt', wounds: ['blunt'], reach: 'long', wCapacity: '6', wLoaded: '0', wTakes: '',
  armor: { ...ZERO_ARMOR }, locs: [], exclusive: false, bothSides: false, fits: '', hold: 'load', hCapacity: '2', hLoaded: '2', hTakes: '',
})

const text = (n: number | undefined, empty: string) => (n === undefined ? empty : String(n))
const textOr = (raw: string | undefined, empty: string) => (raw === undefined ? empty : raw)

const pictureOf = (x: Partial<LubecItem>): LubecFormPicture | null => (x.art ? { art: x.art, shape: x.shape ?? 'square' } : null)

const armorFields = (x: Partial<LubecItem>) => Object.fromEntries(WOUND_KINDS.map((w) => [w, String(armorVs(x, w))])) as Record<LubecWoundKind, string>

const woundsOf = (x: Partial<LubecItem>): LubecWoundKind[] => (x.wounds?.length ? x.wounds : [x.mode === 'firearm' ? 'gun' : 'blunt'])

// Each kind's page reads what the item or entry carries; a field it doesn't carry keeps the form's own value.
const weaponFields = (f: LubecItemFields, x: Partial<LubecItem>): Partial<LubecItemFields> => ({
  mode: x.mode === 'firearm' ? 'firearm' : 'melee', impact: text(x.impact, f.impact), table: textOr(x.table, f.table), wounds: woundsOf(x),
  reach: x.reach === 'short' ? 'short' : 'long', wCapacity: text(x.capacity, f.wCapacity), wLoaded: text(x.loaded, '0'), wTakes: textOr(x.takes, ''),
})

const armorPageFields = (x: Partial<LubecItem>): Partial<LubecItemFields> =>
  ({ armor: armorFields(x), locs: [...(x.locs ?? [])], exclusive: Boolean(x.exclusive), fits: textOr(x.fits, '') })

const holderFields = (f: LubecItemFields, x: Partial<LubecItem>): Partial<LubecItemFields> => ({
  hold: x.hold ?? 'load', hCapacity: text(x.capacity, f.hCapacity), hLoaded: text(x.loaded ?? x.capacity, f.hLoaded), hTakes: textOr(x.takes, ''),
})

// Its name, words, size, weight and count, which every item and stock entry has.
const topFields = (x: LubecItemDraft): Partial<LubecItemFields> => ({
  kind: x.kind, name: x.name, note: x.note, size: x.size, weight: x.weight,
  qty: String(x.qty), per: String(perOf(x)), picture: pictureOf(x),
})

// Every field the item or entry is: its own, and its kind's page.
const itemFields = (f: LubecItemFields, x: LubecItemDraft): LubecItemFields =>
  ({ ...f, ...weaponFields(f, x), ...armorPageFields(x), ...holderFields(f, x), ...topFields(x) })

/** The edit form, filled from the item, at the place it is. */
export const lubecFieldsOf = (item: LubecItem, dest: string): LubecItemFields =>
  ({ ...itemFields(lubecNewFields(dest), item), stock: item.stock ?? null })

// Small things go with the small stuff; anything bigger leaves it.
function destForSize(dest: string, size: LubecItemSize): string {
  if (size === 0 && dest.startsWith('backpack#')) return 'backpack#small'
  return size !== 0 && dest === 'backpack#small' ? 'backpack#0' : dest
}

/** Rule T2: the form after picking a stock entry, a copy of it to change as the player likes. */
export function lubecFieldsFromStock(f: LubecItemFields, x: LubecItemDraft): LubecItemFields {
  const c = lubecCopyOf(x) as LubecItemDraft
  return { ...itemFields(f, c), stock: x.name, dest: destForSize(f.dest, c.size) }
}

/** The form after the player picks a size: a small thing goes to small stuff, and a bigger one leaves it. */
export const lubecWithSize = (f: LubecItemFields, size: LubecItemSize): LubecItemFields => ({ ...f, size, dest: destForSize(f.dest, size) })

/** The form after the player picks a place: small stuff makes it Small, and a backpack pocket makes a Small thing 1 slot. */
export function lubecWithDest(f: LubecItemFields, dest: string): LubecItemFields {
  if (dest === 'backpack#small') return { ...f, dest, size: 0 }
  return { ...f, dest, size: dest.startsWith('backpack#') && f.size === 0 ? 1 : f.size }
}

/** The form after the player picks melee or firearm: the table and the wound follow. */
export const lubecWithMode = (f: LubecItemFields, mode: LubecItemFields['mode']): LubecItemFields =>
  ({ ...f, mode, table: mode === 'firearm' ? 'gunshot' : 'blunt', wounds: [mode === 'firearm' ? 'gun' : 'blunt'] })

const otherSide = (k: string): string | null => {
  if (k.endsWith('-L')) return k.replace(/-L$/, '-R')
  return k.endsWith('-R') ? k.replace(/-R$/, '-L') : null
}

/** A tap on a part of the armor maker's body: picks it, or unpicks it; with "Both sides at once", its pair too. */
export function lubecTogglePart(f: LubecItemFields, k: string): LubecItemFields {
  const on = !f.locs.includes(k)
  const pair = f.bothSides ? otherSide(k) : null
  const keys = pair ? [k, pair] : [k]
  const locs = on ? [...f.locs.filter((x) => !keys.includes(x)), ...keys] : f.locs.filter((x) => !keys.includes(x))
  return { ...f, locs }
}

/** The count as the form reads it: at most 999, and at least one to a slot (B's countNow). */
export const lubecCountOf = (f: Pick<LubecItemFields, 'qty' | 'per'>): { qty: number; per: number } => ({
  qty: Math.max(0, Math.min(999, Math.round(Number(f.qty) || 0))),
  per: Math.max(1, Math.min(999, Math.round(Number(f.per) || 1))),
})

const whole = (raw: string) => Math.round(Number(raw) || 0)
const atLeastOne = (raw: string) => Math.max(1, whole(raw) || 1)
const between = (n: number, least: number, most: number) => Math.max(least, Math.min(most, n))

function weaponDraft(f: LubecItemFields): Partial<LubecItem> {
  const base = { mode: f.mode, impact: whole(f.impact), table: f.table, wounds: [...f.wounds] }
  if (f.mode === 'melee') return { ...base, reach: f.reach }
  const capacity = atLeastOne(f.wCapacity)
  return { ...base, capacity, loaded: between(whole(f.wLoaded), 0, capacity), ...(f.wTakes ? { takes: f.wTakes } : {}) }
}

const armorDraft = (f: LubecItemFields): Partial<LubecItem> => ({
  locs: LOC_KEYS.filter((k) => f.locs.includes(k)),
  exclusive: f.exclusive,
  armor: Object.fromEntries(WOUND_KINDS.map((w) => [w, between(whole(f.armor[w]), 0, 9)])) as LubecItem['armor'],
})

function holderDraft(f: LubecItemFields): Partial<LubecItem> {
  const capacity = atLeastOne(f.hCapacity)
  return { hold: f.hold, capacity, loaded: between(whole(f.hLoaded), 0, capacity), ...(f.hTakes ? { takes: f.hTakes } : {}) }
}

const KIND_DRAFTS: Readonly<Record<LubecItemKind, (f: LubecItemFields) => Partial<LubecItem>>> = {
  thing: () => ({}),
  weapon: weaponDraft,
  armor: armorDraft,
  consumable: (f) => (f.fits ? { fits: f.fits } : {}),
  holder: holderDraft,
}

const countsUp = (kind: LubecItemKind) => kind !== 'armor' && kind !== 'holder'

// The count: armor and holders are always one; anything else that takes a slot says how many fit in one.
function countDraft(f: LubecItemFields): Partial<LubecItem> & { qty: number } {
  if (!countsUp(f.kind)) return { qty: 1 }
  const { qty, per } = lubecCountOf(f)
  return f.size > 0 ? { qty, per } : { qty }
}

/** The draft the form makes, with no field left undefined, since Firestore refuses one. */
export function lubecDraftOf(f: LubecItemFields): LubecItemDraft {
  const picture = f.picture ? { art: f.picture.art, shape: f.picture.shape } : {}
  return {
    kind: f.kind, name: f.name.trim(), size: f.size, weight: f.weight, note: f.note.trim(),
    ...countDraft(f), ...picture, ...(f.stock ? { stock: f.stock } : {}), ...KIND_DRAFTS[f.kind](f),
  }
}

/** The form's pages on a phone: the item, its kind's own fields, then where it goes. A Thing has no page of its own. */
export const lubecFormPages = (kind: LubecItemKind): readonly (readonly ['top' | 'kind' | 'bottom', string])[] => [
  ['top', 'Item'],
  ...(kind === 'thing' ? [] : [['kind', KIND_NAMES[kind]] as const]),
  ['bottom', 'Where'],
]

/** The page a refused field is on, so a phone turns to it. */
export const lubecFieldPage = (field: LubecDraftField): 'top' | 'kind' =>
  (field === 'wounds' || field === 'takes' || field === 'locs' ? 'kind' : 'top')

/** Whether the form's picture is a drawing that ships; an unknown one is kept but shows as none. */
export const lubecPictureShown = (p: LubecFormPicture | null): p is LubecFormPicture => p !== null && isLubecArt(p.art)

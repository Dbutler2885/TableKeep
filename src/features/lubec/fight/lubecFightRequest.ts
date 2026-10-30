// What a host hands the fight modal (spec 10.2): who attacks, who they attack
// and the weapon a Gear card named. The modal loads nothing itself, so these
// are the only readings of a combatant it makes.

import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecWielder, type LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import { locSummary } from '../../ruleSets/lubec/gear/gearRules'
import { lubecWoundLevel } from '../../ruleSets/lubec/woundLevel'
import { armorVs, WOUND_KINDS } from '../gear/itemLabels'
import { lubecCharacterName } from '../lubecNames'
import { lubecNpcSheetRecord, type LubecNpcIdentity } from '../lubecNpcSheetRecord'
import type { LubecArmorNumbers, LubecNpcFightSummary } from './lubecNpcFightSummary'

/** Someone in a fight: a player's character, or an NPC on a map token. */
export type LubecCombatant =
  | { kind: 'character'; character: LubecCharacterRecord }
  | { kind: 'npc'; npc: LubecNpcIdentity; sheet: LubecCharacterRecord | null; summary?: LubecNpcFightSummary | null }

export type LubecFightRequest = {
  attacker: LubecCombatant
  /** Null when the attacker has not picked one yet, as a player who starts combat from the map may not have. */
  target: LubecCombatant | null
  /** Set when a Gear card's "Fight with this" or a Fight bar chip opened it. */
  weaponItemId?: string
}

export type LubecFightHost = {
  open: (request: LubecFightRequest) => void
  close: () => void
}

/** Fisticuffs is not an item, so it has this id where a weapon's would be. */
export const LUBEC_FISTICUFFS_ID = 'fisticuffs'

/** A combatant's name, portrait and token. */
export type LubecCombatantFace = Pick<LubecNpcIdentity, 'portraitFocusX' | 'portraitFocusY' | 'tokenIcon'> & { name: string; portraitUrl: string | null }

/** One combatant's key: a character and an NPC can share an id, as a clone keeps ids. */
export const lubecCombatantKey = (c: LubecCombatant): string =>
  (c.kind === 'character' ? `character:${c.character.id}` : `npc:${c.npc.id}`)

/** The sheet behind a combatant, under an NPC's own name and picture; null for an NPC with none, or one the viewer may not read. */
export function lubecCombatantRecord(c: LubecCombatant): LubecCharacterRecord | null {
  if (c.kind === 'character') return c.character
  return c.sheet && lubecNpcSheetRecord(c.npc, c.sheet)
}

export function lubecCombatantFace(c: LubecCombatant): LubecCombatantFace {
  const { portraitUrl, portraitFocusX, portraitFocusY, tokenIcon } = c.kind === 'character' ? c.character : c.npc
  const name = c.kind === 'character' ? lubecCharacterName(c.character) : c.npc.name
  return { name: name || 'Unnamed', portraitUrl, portraitFocusX, portraitFocusY, tokenIcon }
}

/** What a combatant carries; nothing without a sheet to read. */
export const lubecCombatantGear = (c: LubecCombatant): LubecGear => lubecCombatantRecord(c)?.lubec.gear ?? emptyLubecGear()

/** A combatant's Strength and Handle; holes without a sheet to read. */
export function lubecCombatantWielder(c: LubecCombatant): LubecWielder {
  const record = lubecCombatantRecord(c)
  return record ? lubecWielder(record.lubec) : { strength: null, handle: null }
}

/** A row of the "wearing" card: a piece and what it covers, or for a player's NPC target only the parts. */
export type LubecWornRow = { key: string; name: string; covers: string; armor: LubecArmorNumbers }

const pieceArmor = (piece: LubecItem) => Object.fromEntries(WOUND_KINDS.map((w) => [w, armorVs(piece, w)])) as LubecArmorNumbers

const wornPieces = (gear: LubecGear): LubecWornRow[] => gear.items
  .filter((i) => i.carrier === 'worn')
  .map((piece) => ({ key: piece.id, name: piece.name, covers: locSummary(piece.locs ?? []), armor: pieceArmor(piece) }))

const summaryZones = (summary: LubecNpcFightSummary): LubecWornRow[] =>
  summary.armor.map(({ locs, armor }) => ({ key: locs.join(), name: locSummary(locs), covers: '', armor }))

/** What the card lists: the sheet's pieces, or else the public summary's parts; null with neither to read. */
export function lubecCombatantWorn(c: LubecCombatant): LubecWornRow[] | null {
  const record = lubecCombatantRecord(c)
  if (record) return wornPieces(record.lubec.gear)
  return c.kind === 'npc' && c.summary ? summaryZones(c.summary) : null
}

/** The words for a combatant's wound-level chip; null while there is nothing to say. */
export function lubecCombatantWoundLevel(c: LubecCombatant): string | null {
  const record = lubecCombatantRecord(c)
  if (record) return lubecWoundLevel(record.lubec)
  return c.kind === 'npc' ? c.summary?.woundLevel ?? null : null
}

const liveCombatant = (c: LubecCombatant, combatants: readonly LubecCombatant[]): LubecCombatant =>
  combatants.find((x) => lubecCombatantKey(x) === lubecCombatantKey(c)) ?? c

/** A request as things stand now, so what is dropped or changed while the modal is open shows in it. */
export const lubecLiveRequest = (request: LubecFightRequest, combatants: readonly LubecCombatant[]): LubecFightRequest => ({
  ...request,
  attacker: liveCombatant(request.attacker, combatants),
  target: request.target && liveCombatant(request.target, combatants),
})

/** The NPC whose public summary this viewer has to read: a player's target, as only the GM holds the sheet. */
export const lubecSummaryNpcId = (request: LubecFightRequest | null, isGm: boolean): string | null =>
  (!isGm && request?.target?.kind === 'npc' ? request.target.npc.id : null)

/** The request with the target's public summary laid on it. */
export const lubecWithSummary = (request: LubecFightRequest, summary: LubecNpcFightSummary | null): LubecFightRequest =>
  (request.target?.kind === 'npc' && summary ? { ...request, target: { ...request.target, summary } } : request)

/** Who may be picked as a target: everyone the host offers but the attacker, and the request's own target. */
export function lubecTargetChoices(request: LubecFightRequest, targets: readonly LubecCombatant[]): LubecCombatant[] {
  const named = request.target ? [request.target] : []
  const seen = new Set([lubecCombatantKey(request.attacker), ...named.map(lubecCombatantKey)])
  return [...named, ...targets.filter((t) => !seen.has(lubecCombatantKey(t)))]
}

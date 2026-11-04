import { doc, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { combatSheetCollection, combatSheetRecord } from './combatSheetRecord'
import type { CombatAuthority, CombatCommand, CombatantSelection, CombatFight, CombatRecords, CombatSheet, FloorSelection, StartPayload } from './engine/types'

export const combatRef = (db: Firestore, command: CombatCommand, ...segments: string[]) => campaignDocRef(db, command.envelope, ...segments)

/** Mirrors `isCampaignGm` in firestore.rules; rules already refuse non-members these reads. */
export async function readCombatAuthority(db: Firestore, tx: Transaction, command: CombatCommand, userId: string): Promise<CombatAuthority> {
  const campaign = await tx.get(combatRef(db, command))
  const member = await tx.get(doc(db, 'groups', command.envelope.groupId, 'members', userId))
  const gm = member.get('role') === 'admin' || campaign.get('gmUserId') === userId
  return { userId, isGm: member.get('status') === 'active' && gm }
}

async function readSheet(db: Firestore, tx: Transaction, command: CombatCommand, selection: CombatantSelection): Promise<CombatSheet | null> {
  const snap = await tx.get(combatRef(db, command, combatSheetCollection(selection), selection.sheetId))
  if (!snap.exists()) return null
  const npc = selection.kind === 'npc' ? (await tx.get(combatRef(db, command, 'npcs', selection.sheetId))).data() : undefined
  return combatSheetRecord(selection, snap.id, snap.data(), npc)
}

function detachedIds(fight: CombatFight | null): string[] {
  if (!fight) return []
  return [...fight.state.floor, ...(fight.state.attack?.detached ?? [])].map((record) => record.item.id)
}

/** GM Items and private sheets are GM-only reads; other callers are refused by the engine instead. */
function itemDependencies(command: CombatCommand, fight: CombatFight | null): string[] {
  if (command.payload.type === 'end') return detachedIds(fight)
  const floor = (command.payload.floor ?? []) as FloorSelection[]
  return floor.map((selection) => selection.itemId)
}

const SHEET_DEPENDENCIES: Readonly<Record<string, (command: CombatCommand, fight: CombatFight | null) => CombatantSelection[]>> = {
  start: (command) => (command.payload as StartPayload).combatants,
  refresh: (_command, fight) => (fight?.state.combatants ?? []).map(({ kind, sheetId }) => ({ kind, sheetId })),
}

function sheetDependencies(command: CombatCommand, fight: CombatFight | null): CombatantSelection[] {
  return SHEET_DEPENDENCIES[command.payload.type]?.(command, fight) ?? []
}

async function readItem(db: Firestore, tx: Transaction, command: CombatCommand, id: string) {
  const snap = await tx.get(combatRef(db, command, 'gmItems', id))
  return snap.exists() ? [id, parseLubecGmItem(snap.data(), id)] as const : null
}

const activeId = (raw: Record<string, unknown> = {}) => (raw.activeFightId ?? null) as string | null

export async function readCombatRecords(db: Firestore, tx: Transaction, command: CombatCommand, authority: CombatAuthority): Promise<CombatRecords> {
  const control = await tx.get(combatRef(db, command, 'combatControl', 'current'))
  const fight = (await tx.get(combatRef(db, command, 'combats', command.envelope.fightId))).data() as CombatFight | undefined
  const selections = authority.isGm ? sheetDependencies(command, fight ?? null) : []
  const sheets = await Promise.all(selections.map((selection) => readSheet(db, tx, command, selection)))
  const itemIds = authority.isGm ? itemDependencies(command, fight ?? null) : []
  const items = await Promise.all([...new Set(itemIds)].map((id) => readItem(db, tx, command, id)))
  return {
    activeFightId: activeId(control.data()), fight: fight ?? null,
    sheets: sheets.filter((sheet): sheet is CombatSheet => sheet !== null),
    items: new Map(items.filter((item) => item !== null)),
  }
}

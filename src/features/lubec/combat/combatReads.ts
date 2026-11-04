import { doc, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { parseLubecCharacter } from '../../ruleSets/lubec/characterParser'
import { lubecCharacterVersioning } from '../../ruleSets/characterMigrations'
import { assertCharacterAtCurrentVersion } from '../../ruleSets/characterSchemaStamp'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import type { CombatAuthority, CombatCommand, CombatantSelection, CombatFight, CombatRecords, CombatSheet, FloorSelection, StartPayload } from './engine/types'

export const combatRef = (db: Firestore, command: CombatCommand, ...segments: string[]) => campaignDocRef(db, command.envelope, ...segments)

/** Mirrors `isCampaignGm` in firestore.rules; rules already refuse non-members these reads. */
export async function readCombatAuthority(db: Firestore, tx: Transaction, command: CombatCommand, userId: string): Promise<CombatAuthority> {
  const campaign = await tx.get(combatRef(db, command))
  const member = await tx.get(doc(db, 'groups', command.envelope.groupId, 'members', userId))
  const gm = member.get('role') === 'admin' || campaign.get('gmUserId') === userId
  return { userId, isGm: member.get('status') === 'active' && gm }
}

type PublicIdentity = { name: string; portraitPath: string }

/** An NPC's public face lives on its NPC document, beside the GM-only sheet; a character carries its own. */
async function publicIdentity(db: Firestore, tx: Transaction, command: CombatCommand, selection: CombatantSelection, sheet: PublicIdentity): Promise<PublicIdentity> {
  if (selection.kind === 'character') return sheet
  const npc = (await tx.get(combatRef(db, command, 'npcs', selection.sheetId))).data() ?? {}
  return { name: String(npc.name ?? sheet.name), portraitPath: String(npc.portraitPath ?? sheet.portraitPath) }
}

async function readSheet(db: Firestore, tx: Transaction, command: CombatCommand, selection: CombatantSelection): Promise<CombatSheet | null> {
  const collection = selection.kind === 'character' ? 'characters' : 'npcSheets'
  const snap = await tx.get(combatRef(db, command, collection, selection.sheetId))
  if (!snap.exists()) return null
  assertCharacterAtCurrentVersion(snap.data(), lubecCharacterVersioning)
  const character = parseLubecCharacter(snap.id, snap.data())
  const identity = await publicIdentity(db, tx, command, selection, character)
  return { ...selection, sheet: character.lubec, ownerUserId: character.ownerUserId, name: identity.name, portraitPath: identity.portraitPath }
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

function sheetDependencies(command: CombatCommand): CombatantSelection[] {
  return command.payload.type === 'start' ? (command.payload as StartPayload).combatants : []
}

async function readItem(db: Firestore, tx: Transaction, command: CombatCommand, id: string) {
  const snap = await tx.get(combatRef(db, command, 'gmItems', id))
  return snap.exists() ? [id, parseLubecGmItem(snap.data(), id)] as const : null
}

const activeId = (raw: Record<string, unknown> = {}) => (raw.activeFightId ?? null) as string | null

export async function readCombatRecords(db: Firestore, tx: Transaction, command: CombatCommand, authority: CombatAuthority): Promise<CombatRecords> {
  const control = await tx.get(combatRef(db, command, 'combatControl', 'current'))
  const fight = (await tx.get(combatRef(db, command, 'combats', command.envelope.fightId))).data() as CombatFight | undefined
  const selections = authority.isGm ? sheetDependencies(command) : []
  const sheets = await Promise.all(selections.map((selection) => readSheet(db, tx, command, selection)))
  const itemIds = authority.isGm ? itemDependencies(command, fight ?? null) : []
  const items = await Promise.all([...new Set(itemIds)].map((id) => readItem(db, tx, command, id)))
  return {
    activeFightId: activeId(control.data()), fight: fight ?? null,
    sheets: sheets.filter((sheet): sheet is CombatSheet => sheet !== null),
    items: new Map(items.filter((item) => item !== null)),
  }
}

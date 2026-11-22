import { doc, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { assertCharacterAtCurrentVersion } from '../../ruleSets/characterSchemaStamp'
import { lubecCharacterVersioning } from '../../ruleSets/characterMigrations'
import type { CombatantSelection, CombatFight } from './engine/types'
import type { CombatWoundScope } from './woundTypes'

export function combatSheetRef(db: Firestore, scope: CombatWoundScope, target: CombatantSelection) {
  const collections = { character: 'characters', npc: 'npcSheets' }
  const collection = collections[target.kind]
  if (!collection || !target.sheetId) throw new Error('Invalid wound target.')
  return campaignDocRef(db, scope, collection, target.sheetId)
}

export async function requireWoundGm(db: Firestore, tx: Transaction, scope: CombatWoundScope, userId: string) {
  const campaign = await tx.get(campaignDocRef(db, scope))
  const member = await tx.get(doc(db, 'groups', scope.groupId, 'members', userId))
  const gm = member.get('role') === 'admin' || campaign.get('gmUserId') === userId
  if (!(member.get('status') === 'active' && gm)) throw new Error('Only the GM can deliver wounds.')
}

export async function readWoundFight(db: Firestore, tx: Transaction, scope: CombatWoundScope) {
  const control = await tx.get(campaignDocRef(db, scope, 'combatControl', 'current'))
  const snapshot = await tx.get(campaignDocRef(db, scope, 'combats', scope.fightId))
  if (!snapshot.exists()) throw new Error('That fight is missing.')
  return { fight: snapshot.data() as CombatFight, activeFightId: control.get('activeFightId') as string | null }
}

export function requireWoundFightLive(scope: CombatWoundScope, fight: CombatFight, activeFightId: string | null) {
  if (fight.status !== 'live') throw new Error('That fight is not live.')
  if (activeFightId !== scope.fightId) throw new Error('The active fight control does not match.')
}

export async function readWoundSheet(db: Firestore, tx: Transaction, scope: CombatWoundScope, target: CombatantSelection) {
  const ref = combatSheetRef(db, scope, target)
  const snapshot = await tx.get(ref)
  if (!snapshot.exists()) throw new Error('Wound target sheet is missing; repair it and reconnect.')
  const raw = snapshot.data()
  assertCharacterAtCurrentVersion(raw, lubecCharacterVersioning)
  return { ref, raw }
}

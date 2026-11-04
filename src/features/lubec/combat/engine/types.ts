import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import type { LubecArmorZone } from '../../fight/lubecNpcFightSummary'
import type { CombatLog, CombatPendingAction } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'

export type CombatantSelection = { kind: 'character' | 'npc'; sheetId: string }
export type FloorSelection = { itemId: string; status: 'library' | 'dropped'; qty: number }
export type Combatant = CombatantSelection & {
  key: string
  ownerUserId: string
  name: string
  portraitPath: string
  speed: number
  armor: LubecArmorZone[]
  interactionSequence: number
  outReason: string | null
}
export type CombatAttack = {
  id: string
  grantId: string | null
  attackerKey: string
  step: string
  detached: LubecDetachedItem[]
  closed: boolean
}
export type CombatState = {
  round: number
  phase: string
  stageInstanceId: string
  combatants: Combatant[]
  floor: LubecDetachedItem[]
  attack: CombatAttack | null
  woundOutbox: { id: string; [key: string]: unknown }[]
  woundAcknowledgements: string[]
  pendingActions?: CombatPendingAction[]
}
export type CombatFight = { status: 'live' | 'ended'; participantUserIds: string[]; state: CombatState }
export type CombatEnvelope = {
  id: string
  groupId: string
  campaignId: string
  fightId: string
  round: number
  phase: string
  stageInstanceId: string
  actorKey: string | null
  interactionSequence: number
  attackId?: string
  grantId?: string
  step?: string
}
export type CombatCommand = {
  envelope: CombatEnvelope
  seed: string
  payload: { type: string; [key: string]: unknown }
}
export type StartPayload = { type: 'start'; combatants: CombatantSelection[]; floor: FloorSelection[]; dodgeball: boolean }
export type CombatSheet = CombatantSelection & {
  name: string
  ownerUserId: string
  portraitPath: string
  sheet: LubecCharacterSheet
}
export type CombatRecords = {
  activeFightId: string | null
  fight: CombatFight | null
  sheets: CombatSheet[]
  items: Map<string, LubecGmItem>
}
export type CombatAuthority = { userId: string; isGm: boolean }
export type CombatOutcome =
  | { ok: true; fightId: string; generatedIds: string[]; rolls: { purpose: string; ordinal: number; value: number }[] }
  | { ok: false; reason: string }
export type CombatPlan = {
  fight: CombatFight
  control?: string | null
  items: { id: string; value: LubecGmItem | null }[]
  logs: CombatLog[]
}
export type CombatHandler = (command: CombatCommand, records: CombatRecords, authority: CombatAuthority, entropy: CombatEntropy) => CombatPlan

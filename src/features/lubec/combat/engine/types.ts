import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import type { LubecGear, LubecRangeBand, LubecWeaponRange } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import type { LubecArmorZone } from '../../fight/lubecNpcFightSummary'
import type { CombatLog, CombatPendingAction } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import type { CombatWound, CombatWoundAcknowledgement } from '../woundTypes'

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
/** What the attacker picked: target, weapon and use, and at most one named Defense line from the same Handle pool. */
export type CombatAim = {
  targetKey: string
  weaponItemId: string
  attackId: string
  defense: { against: string; amount: number } | null
}
/** The numbers frozen when the aim was accepted, with the sheet revision they were read from. */
export type CombatFrozenAim = {
  choice: LubecAttackChoice
  weaponName: string
  ranges: LubecWeaponRange[]
  handle: number
  skill: { name: string; bonus: number } | null
  total: number
  attack: number
  sourceRevision: number
}
export type CombatAttackRange = { band: LubecRangeBand; modifier: number }
export type CombatAttackRoll = { roll: number; attackNumber: number; hit: boolean; critical: boolean; quality: number | null }
export type CombatAttack = {
  id: string
  grantId: string | null
  attackerKey: string
  step: string
  detached: LubecDetachedItem[]
  closed: boolean
  aim?: CombatAim | null
  frozen?: CombatFrozenAim | null
  range?: CombatAttackRange | null
  roll?: CombatAttackRoll | null
  /** The exact input a pending step waits on; the same attack, step and rolls resume once it is repaired. */
  repair?: string | null
}
export type CombatState = {
  round: number
  phase: string
  stageInstanceId: string
  combatants: Combatant[]
  floor: LubecDetachedItem[]
  attack: CombatAttack | null
  woundOutbox: CombatWound[]
  woundAcknowledgements: CombatWoundAcknowledgement[]
  pendingActions?: CombatPendingAction[]
  /** The GM's last range band per attacker, offered again but never applied without a press. */
  lastRanges?: Record<string, LubecRangeBand>
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
  /** The canonical revision this transaction read; absent outside a transaction. */
  revision?: number
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
  /** Gear the actor's own sheet ends with; written under the sheet revision contract with the command. */
  sheets?: { selection: CombatantSelection; gear: LubecGear }[]
}
export type CombatHandler = (command: CombatCommand, records: CombatRecords, authority: CombatAuthority, entropy: CombatEntropy) => CombatPlan

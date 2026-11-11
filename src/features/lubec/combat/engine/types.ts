import type { LubecWoundSeverity } from '../../../ruleSets/lubec/woundTables/types'
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
/** A combatant's initiative: d100 strictly under Speed, frozen once per fight, with any tie rerolls the app made. */
export type CombatInitiative = { roll: number; speed: number; success: boolean; sourceRevision: number; ties: number[] }
/** A Movement choice. Moving or staying is the default and needs no thought; Run, Pick up and Leave are the choices. */
export type CombatMovementChoice = 'stay' | 'run' | 'evade' | 'pickup' | 'leave'
/** One exact Floor record and quantity a pickup claims. */
export type CombatPickupClaim = { itemId: string; qty: number }
/**
 * A confirmed Movement choice, private to its owner and the GM until the stage closes.
 * A Leave is `asked` until the GM confirms it; a refusal clears the choice so the player chooses again.
 */
/** An evader's Speed roll as Movement settled, and what it takes off ranged attacks at them this round. */
export type CombatEvasion = { roll: number; speed: number; success: boolean; penalty: number }
export type CombatMovement = { choice: CombatMovementChoice; pickup: CombatPickupClaim | null; leave: 'asked' | 'confirmed' | null; evasion?: CombatEvasion | null }
/** One named Defense line: who it guards against, and how much of the Handle pool it holds. */
export type CombatDefenseLine = { against: string; amount: number }
/**
 * What a combatant declared this round, frozen from the canonical sheet it was read from.
 * A runner's declaration is empty: no attack and no Defense. Full Defense has no attack and one line over the whole pool.
 */
export type CombatDeclaration = {
  ran: boolean
  full: boolean
  aim: CombatAim | null
  frozen: CombatFrozenAim | null
  total: number
  lines: CombatDefenseLine[]
  sourceRevision: number
  /** Its maker went Out after declaring, or came back after Declare: no attack and no Defense from it this round. */
  stopped?: boolean
}
export type Combatant = CombatantSelection & {
  key: string
  ownerUserId: string
  name: string
  portraitPath: string
  speed: number
  armor: LubecArmorZone[]
  interactionSequence: number
  outReason: string | null
  /** An NPC the GM put on the players' side at setup. A label for the turn order only: who can target whom is unchanged. */
  ally?: true
  initiative?: CombatInitiative | null
  /** This round's Movement choice, once confirmed. */
  movement?: CombatMovement | null
  /** This round's approved declaration, or the automatic no-attack declaration. */
  declaration?: CombatDeclaration | null
  /** A submitted choice awaiting the GM; it does not advance the declaration order. */
  proposedDeclaration?: CombatDeclaration | null
  /** The GM returned this choice; the same combatant must choose again. */
  declarationRejected?: boolean
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
/** The defender's grant-local split and its roll: what it kept, rolled under, and took off the quality. */
export type CombatDefenseRoll = { amount: number; full: boolean; value: number; roll: number; success: boolean; removes: number }
export type CombatCatchRoll = { chance: number; roll: number; success: boolean }
/** Where the hit landed (d100 on the start table, d10 for a paired part's side) and where the attacker moved it. */
export type CombatLanding = { table: string; startRoll: number; sideRoll: number | null; start: string; part: string | null; moved: number }
export type CombatStrengthRoll = { roll: number; strength: number; success: boolean; bonus: number }
/** Impact built from its parts; the table it is read on and what happens next. */
export type CombatImpact = { quality: number; base: number; strength: number | null; moved: number; armor: number; total: number; table: string }
/** How a closed or waiting attack ended, for the outcome banner. */
export type CombatAttackOutcome = 'miss' | 'dodged' | 'caught' | 'dropped' | 'no-wound' | 'manual' | 'pending-wound' | 'wounded' | 'row-caught' | 'passed' | 'picked-up' | 'interrupted'
/** The wound table row a hit reached, and the Check or Save it asks the target for. */
export type CombatWoundRow = {
  group: string
  impact: number
  name: string
  text: string
  severity: LubecWoundSeverity
  trauma: number
  check: { kind: 'stat-check' | 'save'; against: 'Handle' | 'Body'; advantage: 'advantage' | 'normal' | 'disadvantage' } | null
  /** A located table's key; absent on a Dodgeball row, which keeps its own table. */
  table?: string
  /** The lasting injury the wound leaves. */
  injury?: string | null
  /** The d2 a two-wound row rolled, and so which wound it is. */
  choice?: number | null
  /** The wound puts the target Out (knocked unconscious). */
  out?: boolean
}
/** The target's ordinary core roll: at or under its number, with failure Stress as the core roller adds it. */
export type CombatCheckRoll = NonNullable<CombatWoundRow['check']> & { target: number; dice: number[]; result: number; success: boolean; stress: number }
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
  /** The defender's grant-local split while they choose it, shown to the table before the roll. */
  defenseSplit?: { amount: number; full: boolean } | null
  defense?: CombatDefenseRoll | null
  /** Quality left after Defense; the hit's reach. */
  net?: number | null
  catch?: CombatCatchRoll | null
  /** The catch chance once Defense stopped a catchable throw. */
  catchChance?: number | null
  /** The thrown item's name and own chance, kept for the catch card after the object has moved on. */
  catchItem?: { name: string; chance: number } | null
  landing?: CombatLanding | null
  strength?: CombatStrengthRoll | null
  impact?: CombatImpact | null
  outcome?: CombatAttackOutcome | null
  row?: CombatWoundRow | null
  check?: CombatCheckRoll | null
  /** The row's words for what happened, once applied. */
  rowOutcome?: string | null
  /** The Trauma the wound gave, once applied: a passed Body Save can lower the row's. */
  rowTrauma?: number | null
  /** A round attack's Results stay on screen until the GM moves the fight on. */
  continued?: boolean
  /** The target's Evasive Movement, when it took a penalty off this ranged attack. */
  evasion?: CombatEvasion | null
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
  /** Keys fastest first, set once every initiative is in. */
  order?: string[]
  /** Who has had their attack this round, fastest first. */
  attacked?: string[]
  /** The round's last finished attack, kept in view after the next one opens or the next round begins. */
  lastAttack?: CombatAttack | null
  /** Every Movement choice is in; the GM's workspace settles the stage by itself. */
  movementComplete?: boolean
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
export type StartPayload = {
  type: 'start'
  combatants: CombatantSelection[]
  floor: FloorSelection[]
  /** Keys of selected NPCs fighting on the players' side. */
  allies?: string[]
  requireBody?: boolean
  /** Older queued commands used this field for the Body Save requirement, not a combat mode. */
  dodgeball?: boolean
}
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

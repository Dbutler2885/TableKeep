import type { CampaignScope } from '../../../campaign/firestorePaths'
import type { LubecRangeBand } from '../../../ruleSets/lubec/gear/gearRecord'
import { actorEnvelope, attackCommandKey, gmEnvelope } from '../combatEnvelopes'
import type { LubecLiveFight } from '../combatWatch'
import { createCombatCommand } from '../commandJournal'
import type { CombatCalled } from '../engine/combatModes'
import type { CombatAim, CombatCommand, CombatMovementChoice, CombatPickupClaim } from '../engine/types'
import type { CombatSend } from '../useLubecCombatSend'

/** Null when the table accepted the act; otherwise its reason. */
export type AttackAct = Promise<string | null>

export type AttackCommands = {
  grant: (combatantKey: string) => AttackAct
  /** Call off a granted Sneak Attack before it rolls; null sends it as the GM. */
  withdraw: (actorKey: string | null, attackId: string) => AttackAct
  aim: (actorKey: string, aim: CombatAim) => AttackAct
  roll: (actorKey: string, aim: CombatAim, called?: CombatCalled | null) => AttackAct
  range: (band: LubecRangeBand, modifier: number | null) => AttackAct
  split: (actorKey: string, split: { amount: number; full: boolean }) => AttackAct
  defend: (actorKey: string, split: { amount: number; full: boolean }, called?: CombatCalled | null) => AttackAct
  catchRoll: (actorKey: string) => AttackAct
  land: (actorKey: string, part: string) => AttackAct
  strength: (actorKey: string, called?: CombatCalled | null) => AttackAct
  check: (actorKey: string, called?: CombatCalled | null) => AttackAct
  begin: () => AttackAct
  initiative: (actorKey: string, called?: CombatCalled | null) => AttackAct
  npcInitiative: () => AttackAct
  move: (actorKey: string, movement: MovementPick) => AttackAct
  settleMovement?: () => AttackAct
  npcMovement: (choices: Record<string, MovementPick>) => AttackAct
  answerLeave: (combatantKey: string, confirm: boolean) => AttackAct
  declare: (actorKey: string, declaration: DeclarePick) => AttackAct
  answerDeclaration: (combatantKey: string, approve: boolean) => AttackAct
  pass: (actorKey: string) => AttackAct
  floorPickup: (actorKey: string, itemId: string) => AttackAct
  takeOut: (combatantKey: string) => AttackAct
  returnIn: (combatantKey: string) => AttackAct
  /** The GM moves the fight on from an attack's Results. */
  continueResults: () => AttackAct
  /** The owner (the GM for an NPC) chooses a new Defense for a split that no longer fits its pool. */
  repairSplit: (actorKey: string, defense: number) => AttackAct
}

/** A Movement choice as sent: Pick up names the exact Floor record and quantity it claims. */
export type MovementPick = { choice: CombatMovementChoice; pickup: CombatPickupClaim | null }
/** A declaration as sent: an attack with at most one named Defense line, or Full Defense naming one person. */
export type DeclarePick = { full: false; aim: CombatAim } | { full: true; against: string; aim: Pick<CombatAim, 'weaponItemId' | 'attackId'> | null }

type Payload = CombatCommand['payload']

/** A roll carries the GM's call only when one was picked, so a plain roll's command is unchanged. */
const calledOf = (called: CombatCalled | null | undefined) => (called ? { called } : {})

/** The Sneak Attack's commands for this viewer, each resent unchanged until the table answers it. */
export function attackCommands(scope: CampaignScope, live: LubecLiveFight, send: CombatSend): AttackCommands {
  const act = async (actorKey: string | null, payload: Payload) => {
    const envelope = (id: string) => (actorKey ? actorEnvelope(scope, id, live, actorKey) : gmEnvelope(scope, id, live))
    const outcome = await send(attackCommandKey(live, actorKey, payload), () => createCombatCommand(envelope(crypto.randomUUID()), payload))
    return outcome.ok ? null : outcome.reason
  }
  return {
    grant: (combatantKey) => act(null, { type: 'grant', combatantKey }),
    withdraw: (actorKey, attackId) => act(actorKey, { type: 'withdraw', attackId }),
    aim: (actorKey, aim) => act(actorKey, { type: 'aim', aim }),
    roll: (actorKey, aim, called) => act(actorKey, { type: 'roll', aim, ...calledOf(called) }),
    range: (band, modifier) => act(null, { type: 'range', band, ...(modifier === null ? {} : { modifier }) }),
    split: (actorKey, split) => act(actorKey, { type: 'split', split }),
    defend: (actorKey, split, called) => act(actorKey, { type: 'defend', split, ...calledOf(called) }),
    catchRoll: (actorKey) => act(actorKey, { type: 'catch' }),
    land: (actorKey, part) => act(actorKey, { type: 'land', part }),
    strength: (actorKey, called) => act(actorKey, { type: 'strength', ...calledOf(called) }),
    check: (actorKey, called) => act(actorKey, { type: 'check', ...calledOf(called) }),
    begin: () => act(null, { type: 'begin' }),
    initiative: (actorKey, called) => act(actorKey, { type: 'initiative', ...calledOf(called) }),
    npcInitiative: () => act(null, { type: 'npcInitiative' }),
    move: (actorKey, movement) => act(actorKey, { type: 'move', ...movement }),
    settleMovement: () => act(null, { type: 'settleMovement' }),
    npcMovement: (choices) => act(null, { type: 'npcMovement', choices }),
    answerLeave: (combatantKey, confirm) => act(null, { type: 'answerLeave', combatantKey, confirm }),
    declare: (actorKey, declaration) => act(actorKey, { type: 'declare', ...declaration }),
    answerDeclaration: (combatantKey, approve) => act(null, { type: 'answerDeclaration', combatantKey, approve }),
    pass: (actorKey) => act(actorKey, { type: 'pass' }),
    floorPickup: (actorKey, itemId) => act(actorKey, { type: 'floorPickup', itemId }),
    takeOut: (combatantKey) => act(null, { type: 'takeOut', combatantKey }),
    returnIn: (combatantKey) => act(null, { type: 'return', combatantKey }),
    continueResults: () => act(null, { type: 'continue' }),
    repairSplit: (actorKey, defense) => act(actorKey, { type: 'repairSplit', defense }),
  }
}

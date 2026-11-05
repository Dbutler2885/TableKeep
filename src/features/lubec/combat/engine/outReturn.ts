import { closeAttack, toLocation } from './attackFlow'
import { attackRepair, combatantOf, combatSheetOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireGm, requireLiveContext } from './context'
import { RAN, requireDue, withDeclareRequests } from './declare'
import { withInitiativeRequests } from './initiative'
import { withMovementRequests } from './movement'
import type { CombatAttack, Combatant, CombatDeclaration, CombatHandler, CombatState } from './types'

type Requested = { state: CombatState; logs: CombatLog[] }

/** Each stage asks again for what it still waits on; Attack moves on by itself after every command. */
const REQUESTS: Readonly<Record<string, (state: CombatState, entropy: CombatEntropy) => Requested>> = {
  initiative: withInitiativeRequests,
  movement: (state) => ({ state: withMovementRequests(state), logs: [] }),
  declare: withDeclareRequests,
}

const withRequests = (state: CombatState, entropy: CombatEntropy): Requested =>
  (REQUESTS[state.phase] ?? ((same: CombatState) => ({ state: same, logs: [] })))(state, entropy)

/** A target who goes Out rolls no Defense, so the hit lands; at the catch it simply drops, still a dodge. */
function defenderGone(state: CombatState, attack: CombatAttack, entropy: CombatEntropy): CombatState {
  if (attack.step === 'defense') return toLocation(state, { ...attack, defense: null }, attack.roll!.quality!, entropy)
  return attack.step === 'catch' ? closeAttack(state, attack, 'dropped') : state
}

/** Out stops a pending attack at once and settles its object; a defender who goes Out stops defending. */
function stopAttack(state: CombatState, key: string, entropy: CombatEntropy): CombatState {
  const attack = openAttack(state)
  if (!attack) return state
  if (attack.attackerKey === key) return closeAttack(state, attack, 'interrupted')
  return attack.aim?.targetKey === key ? defenderGone(state, attack, entropy) : state
}

const openAttack = (state: CombatState): CombatAttack | null => (state.attack && !state.attack.closed ? state.attack : null)

const stopped = (declaration: CombatDeclaration | null | undefined) => (declaration ? { ...declaration, stopped: true } : declaration)

function requireIn(combatant: Combatant) {
  if (combatant.outReason !== null) throw new Error(`${combatant.name} is already Out.`)
}

/** The GM takes someone out of the fight: their declaration is struck, anything waiting on them stops, and the stage moves on. */
const takeOut: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const combatant = combatantOf(fight.state, String(command.payload.combatantKey))
  requireIn(combatant)
  const combatants = fight.state.combatants.map((entry) => (entry.key === combatant.key ? { ...entry, outReason: 'gm', declaration: stopped(entry.declaration) } : entry))
  const next = withRequests(stopAttack({ ...fight.state, combatants }, combatant.key, entropy), entropy)
  return { fight: { ...fight, state: next.state }, items: [], logs: [{ event: `The GM took ${combatant.name} out of the fight.`, actor: null }, ...next.logs] }
}

const NO_ATTACK: CombatDeclaration = { ...RAN, ran: false, stopped: true }

const noAttack = (combatant: Combatant): Partial<Combatant> => ({ declaration: stopped(combatant.declaration) ?? NO_ATTACK })

/** Back in at the next stage: this Movement is sat out, and once Declare has begun there is no attack this round. */
const REJOINS: Readonly<Record<string, (combatant: Combatant) => Partial<Combatant>>> = {
  movement: (combatant) => ({ movement: combatant.movement ?? { choice: 'stay', pickup: null, leave: null } }),
  declare: noAttack,
  attack: noAttack,
}

const rejoined = (combatant: Combatant, phase: string): Combatant => ({ ...combatant, outReason: null, ...REJOINS[phase]?.(combatant) })

function requireOut(combatant: Combatant) {
  if (combatant.outReason === null) throw new Error(`${combatant.name} is not Out.`)
}

/** The GM returns someone Out, once every wound due on them is on their sheet; injuries and effects stay. */
const returnIn: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const combatant = combatantOf(fight.state, String(command.payload.combatantKey))
  requireOut(combatant)
  const record = combatSheetOf(records, combatant)
  const repair = attackRepair(combatant, record)
  if (repair) throw new Error(repair)
  requireDue(fight.state, combatant, record!)
  const combatants = fight.state.combatants.map((entry) => (entry.key === combatant.key ? rejoined(entry, fight.state.phase) : entry))
  const next = withRequests({ ...fight.state, combatants }, entropy)
  return { fight: { ...fight, state: next.state }, items: [], logs: [{ event: `The GM returned ${combatant.name} to the fight.`, actor: null }, ...next.logs] }
}

export const combatOutHandlers: Readonly<Record<string, CombatHandler>> = { takeOut, return: returnIn }

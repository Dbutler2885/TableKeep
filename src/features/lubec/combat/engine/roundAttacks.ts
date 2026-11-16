import { aimRequests } from './attackAim'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireGm, requireLiveContext } from './context'
import { combatAttackers } from './declare'
import { withMovementRequests } from './movement'
import type { CombatWound } from '../woundTypes'
import type { CombatAttack, Combatant, CombatDefenseLine, CombatHandler, CombatPlan, CombatState } from './types'

/** An attack of the round, as against a Sneak Attack granted before initiative. */
export const isRoundAttack = (state: CombatState, attack: CombatAttack): boolean => state.round > 0 && attack.grantId === null

const finished = (state: CombatState): CombatAttack | null => (state.attack?.closed ? state.attack : state.lastAttack ?? null)

/** The next attacker, fastest first, who has not had their turn this round. */
const nextAttacker = (state: CombatState): Combatant | undefined =>
  combatAttackers(state).find((entry) => !(state.attacked ?? []).includes(entry.key))

/** A declared attack opens on the attacker's turn with its frozen aim and split, waiting for the GM's range anew and the Roll. */
function opened(state: CombatState, attacker: Combatant, entropy: CombatEntropy): CombatState {
  const { aim, frozen } = attacker.declaration!
  const attack: CombatAttack = { id: entropy.id('round-attack', 0), grantId: null, attackerKey: attacker.key, step: 'aim', detached: [], closed: false, aim, frozen, range: null, roll: null, repair: null }
  return { ...state, attack, lastAttack: finished(state), attacked: [...(state.attacked ?? []), attacker.key], pendingActions: aimRequests(attack) }
}

const freshFighter = (entry: Combatant): Combatant => ({ ...entry, movement: null, declaration: null, proposedDeclaration: null, declarationRejected: false })

/**
 * The end of the round, once: every combatant with a round window or countdown from this fight still to process gets
 * one identified tick, which the delivery service turns into sheet changes. The next round's rolls wait for it.
 */
function endOfRound(state: CombatState): Pick<CombatState, 'woundOutbox' | 'roundWatch' | 'countdowns'> {
  const watched = Object.entries(state.roundWatch ?? {}).filter(([, through]) => through >= state.round)
  const ticks: CombatWound[] = watched.flatMap(([key]) => {
    const combatant = state.combatants.find((entry) => entry.key === key)
    if (!combatant) return []
    return [{
      kind: 'tick' as const, tickRound: state.round, id: `round-${state.round}:${key}`, target: { kind: combatant.kind, sheetId: combatant.sheetId },
      originatingRound: state.round, effectiveRound: state.round + 1, traumaDelta: 0, stressDelta: 0,
    }]
  })
  const roundWatch = Object.fromEntries(watched.filter(([, through]) => through > state.round))
  const countdowns = (state.countdowns ?? []).filter((countdown) => countdown.dueRound > state.round)
  return { woundOutbox: [...state.woundOutbox, ...ticks], roundWatch, countdowns }
}

const COUNTDOWN_WORDS = {
  bleed: (name: string, wound: string) => `${name}'s bleeding from ${wound} is due: +1 Trauma.`,
  critical: (name: string, wound: string) => `${name}'s Critical countdown from ${wound} is due: a Death Save, which the GM resolves privately.`,
} as const

/** The countdowns falling due at this round's end, in the log once: the sheet change itself is the tick's. */
const countdownLogs = (state: CombatState): CombatLog[] => (state.countdowns ?? [])
  .filter((countdown) => countdown.dueRound === state.round)
  .map((countdown) => ({ event: COUNTDOWN_WORDS[countdown.kind](state.combatants.find((entry) => entry.key === countdown.key)?.name ?? 'Someone', countdown.wound), actor: countdown.key }))

/** The round is over: its end is processed, and the next one begins at Movement by itself, with the last result still in view. */
function nextRound(state: CombatState, entropy: CombatEntropy): CombatState {
  const round = state.round + 1
  return withMovementRequests({
    ...state, ...endOfRound(state), round, phase: 'movement', stageInstanceId: entropy.id('round-stage', 0), combatants: state.combatants.map(freshFighter),
    attack: null, lastAttack: finished(state), attacked: [], movementComplete: false,
  })
}

const turnLog = (attacker: Combatant): CombatLog => ({ event: `${attacker.name}'s turn to attack.`, actor: attacker.key })

/** Endings with nothing to show: a Pass, a Floor pickup, or the GM taking the attacker Out mid-attack. */
const NO_RESULTS: readonly string[] = ['passed', 'picked-up', 'interrupted']

/** A round attack that reached a result holds it on screen until the GM moves the fight on. */
export const awaitingContinue = (state: CombatState, attack: CombatAttack): boolean =>
  attack.closed && isRoundAttack(state, attack) && !attack.continued && !NO_RESULTS.includes(attack.outcome ?? '')

/** A live fight in Attack with no attack open and no Results waiting on the GM. */
const betweenAttacks = ({ fight }: CombatPlan): boolean => {
  const { attack } = fight.state
  return fight.status === 'live' && fight.state.phase === 'attack' && (!attack || (attack.closed && !awaitingContinue(fight.state, attack)))
}

/** After any command: during Attack with nothing open, the next attacker's turn opens, or the next round begins. */
export function withRoundFlow(plan: CombatPlan, entropy: CombatEntropy): CombatPlan {
  if (!betweenAttacks(plan)) return plan
  const { state } = plan.fight
  const attacker = nextAttacker(state)
  if (attacker) return { ...plan, fight: { ...plan.fight, state: opened(state, attacker, entropy) }, logs: [...plan.logs, turnLog(attacker)] }
  const next = nextRound(state, entropy)
  return { ...plan, fight: { ...plan.fight, state: next }, logs: [...plan.logs, ...countdownLogs(state), { event: `Round ${next.round}, Movement.`, actor: null }] }
}

/** The GM moves on from a round attack's Results; the round flow then opens the next turn or round. */
const continueResults: CombatHandler = (command, records, authority) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const { attack } = fight.state
  if (!attack || !awaitingContinue(fight.state, attack)) throw new Error('There is no result waiting.')
  return { fight: { ...fight, state: { ...fight.state, attack: { ...attack, continued: true } } }, items: [], logs: [] }
}

export const combatResultsHandlers: Readonly<Record<string, CombatHandler>> = { continue: continueResults }

/** In a round, the target's declared line against this attacker, if it still stands: what Defense rolls with, or nothing to roll. */
export function declaredLine(state: CombatState, attack: CombatAttack): (CombatDefenseLine & { full: boolean }) | null {
  // Everyone in the fight during Attack has a declaration: made, Ran, or the empty one a Return gives.
  const defender = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  if (defender.unconscious) return null
  const declaration = defender.declaration!
  const line = declaration.stopped ? undefined : declaration.lines.find((entry) => entry.against === attack.attackerKey)
  return line ? { ...line, full: declaration.full } : null
}

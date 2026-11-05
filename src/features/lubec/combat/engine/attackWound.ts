import { lubecCurrentValue } from '../../../ruleSets/lubec/derivations'
import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import { repairPlan } from './attackAim'
import { finishImpact, impactWords, pad, signed, stepRequest, tens } from './attackFlow'
import { attackAt, attackRepair, combatantOf, combatSheetOf } from './attackParty'
import type { CombatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { lubecPartDistances } from './hitLocation'
import { combatInputModifiers } from './inputModifiers'
import type { CombatLog } from './combatFeedback'
import type { CombatAttack, CombatCommand, CombatFight, CombatHandler, CombatPlan, CombatSheet, CombatStrengthRoll } from './types'

/** Reach is the quality left: the hit may move along the body tree that many steps, one quality a step. */
function readPart(attack: CombatAttack, raw: unknown): { part: string; moved: number } {
  const moved = lubecPartDistances(attack.landing!.start)[String(raw)]
  if (moved === undefined || moved > attack.net!) throw new Error('That part is out of reach.')
  return { part: String(raw), moved }
}

/** Every finished hit has its Impact on the attack, waiting or closed. */
const impactLog = (fight: CombatFight, attacker: string): CombatLog[] =>
  [{ event: impactWords(fight.state.attack!.impact!), actor: attacker }]

/** The attacker keeps or moves the landing; a firearm skips Strength straight to Impact. */
const land: CombatHandler = (command, records, authority) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'location')
  const { part, moved } = readPart(attack, command.payload.part)
  const target = combatantOf(fight.state, attack.aim!.targetKey)
  const placed = { ...attack, landing: { ...attack.landing!, part, moved } }
  const log: CombatLog = { event: `It hits ${target.name}'s ${locName(part).toLowerCase()}${moved ? `, moved ${moved}` : ''}.`, actor: attack.attackerKey }
  if (!attack.frozen!.choice.str) {
    const finished = finishImpact(fight, placed, null)
    return { fight: finished, items: [], logs: [log, ...impactLog(finished, attack.attackerKey)] }
  }
  return { fight: { ...fight, state: { ...fight.state, attack: { ...placed, step: 'strength' }, pendingActions: stepRequest(attack.attackerKey, 'strength') } }, items: [], logs: [log] }
}

/** At or under current Strength; a success adds its tens digit to Impact. */
function rollStrength(strength: number, entropy: CombatEntropy): CombatStrengthRoll {
  const roll = entropy.die('strength', 100)
  const success = roll <= strength
  return { roll, strength, success, bonus: success ? tens(roll % 100) : 0 }
}

function strengthLog(attacker: string, key: string, rolled: CombatStrengthRoll): CombatLog {
  return {
    event: `${attacker} rolled Strength.`, actor: key,
    roll: { who: attacker, what: 'Strength roll', roll: pad(rolled.roll), target: `under ${rolled.strength}`, tone: rolled.success ? 'ok' : 'bad', result: rolled.success ? `Adds ${signed(rolled.bonus)} Impact` : 'Adds nothing' },
  }
}

function strengthPlan(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  const modifiers = combatInputModifiers(record.sheet, { fightId: command.envelope.fightId, round: fight.state.round })
  const strength = lubecCurrentValue(record.sheet, 'Strength', modifiers)!
  const rolled = rollStrength(strength, entropy)
  const finished = finishImpact(fight, { ...attack, strength: rolled, repair: null }, rolled.bonus)
  return { fight: finished, items: [], logs: [strengthLog(record.name, attack.attackerKey, rolled), ...impactLog(finished, attack.attackerKey)] }
}

/** The attacker rolls Strength on its own bar at the wound step, for melee and hand-thrown attacks. */
const strength: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'strength')
  const attacker = combatantOf(fight.state, attack.attackerKey)
  const record = combatSheetOf(records, attacker)
  const repair = attackRepair(attacker, record)
  if (repair) return repairPlan(fight, attack, attacker, repair)
  return strengthPlan(fight, attack, record!, command, entropy)
}

export const combatWoundHandlers: Readonly<Record<string, CombatHandler>> = { land, strength }

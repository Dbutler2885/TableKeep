import type { LubecTargetPart } from '../../../ruleSets/lubec/valueParts'

/** Two dice rolled under a mode, for the roll's card to show both and mark the kept one (the roll). */
export type CombatRollDice = { values: number[]; mode: 'advantage' | 'disadvantage'; because: string | null }
/** The number a roll was made under, with each change to it named by where it comes from. */
export type CombatRollBreakdown = { name: string; target: number; parts: LubecTargetPart[] }

/** A committed roll's public presentation, shared by its card and log row. */
export type CombatRoll = {
  who: string
  what: string
  roll: string
  target: string
  result: string
  tone: 'ok' | 'bad' | 'neutral'
  extra?: string
  dice?: CombatRollDice
  breakdown?: CombatRollBreakdown
}

export type CombatLog = { event: string; actor: string | null; roll?: CombatRoll }

/** Engine-owned requests. Later phase handlers publish these with their state change. */
export type CombatAction = 'initiative' | 'movement' | 'declare' | 'reviewDeclaration' | 'attack' | 'defense' | 'catch' | 'check' | 'save' | 'location' | 'strength' | 'leave' | 'range' | 'repairSplit'
export type CombatPendingAction = { combatantKey: string; action: CombatAction }

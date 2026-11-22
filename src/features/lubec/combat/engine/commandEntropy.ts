import type { CombatCommand } from './types'

function hash(text: string): number {
  let value = 2166136261
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return value >>> 0
}

export type CombatEntropy = ReturnType<typeof combatEntropy>

/** Create inside each callback: retries restart ordinals, never sample new entropy. */
export function combatEntropy(command: CombatCommand) {
  const ordinals = new Map<string, number>()
  const generatedIds: string[] = []
  const rolls: { purpose: string; ordinal: number; value: number }[] = []
  const id = (purpose: string, ordinal: number) => {
    const value = [command.envelope.id, purpose, String(ordinal)].map(encodeURIComponent).join(':')
    generatedIds.push(value)
    return value
  }
  const die = (purpose: string, sides: number) => {
    const ordinal = ordinals.get(purpose) ?? 0
    ordinals.set(purpose, ordinal + 1)
    const value = 1 + hash(JSON.stringify([command.envelope.id, command.seed, purpose, ordinal])) % sides
    rolls.push({ purpose, ordinal, value })
    return value
  }
  return { id, die, generatedIds, rolls }
}

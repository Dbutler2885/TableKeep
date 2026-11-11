import type { CombatRoll } from './engine/combatFeedback'

export type RollComparison = { value: string; target: number; relation: string }

const relationOf = (value: number, target: number): string => value < target ? 'UNDER' : value > target ? 'OVER' : 'EQUAL TO'

/** Adapt existing display-only log fields without deriving or changing the recorded outcome. */
export function combatRollComparison(roll: CombatRoll): RollComparison | null {
  if (!/^\d+$/.test(roll.roll)) return null
  const target = /^(?:against|under(?: Speed)?) (\d+)%?$/.exec(roll.target)
  if (!target) return null
  return { value: roll.roll, target: Number(target[1]), relation: relationOf(Number(roll.roll), Number(target[1])) }
}

/** Keep quality and other qualifications visible below the main outcome. */
export function combatRollVerdict(result: string): { headline: string; detail: string } {
  const [headline, ...detail] = result.split(/ · |: /)
  return { headline, detail: detail.join(' · ') }
}

/** Cosmetic previews are identical for every viewer; the committed die is never rerolled. */
export function combatRollPreview(id: string, step: number): string {
  const seed = Array.from(id).reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) % 100, 0)
  return String((seed + step * 37) % 100 + 1).padStart(2, '0')
}

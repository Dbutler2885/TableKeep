import { isLubecStat, type LubecValueName } from './sheet'

// The guided roll-up's dice: each Stat is dealt one of these tens and adds a
// d10; each Save is 2d10 + 10. No die explodes.

export const LUBEC_STAT_TENS: readonly number[] = [50, 40, 40, 30, 20]
export const LUBEC_SAVE_FLAT = 10

/** The lowest and highest base value guided roll-up can produce for a Stat or Save. */
export function lubecRollUpRange(name: LubecValueName): { min: number; max: number } {
  if (isLubecStat(name)) return { min: Math.min(...LUBEC_STAT_TENS) + 1, max: Math.max(...LUBEC_STAT_TENS) + 10 }
  return { min: LUBEC_SAVE_FLAT + 2, max: LUBEC_SAVE_FLAT + 20 }
}

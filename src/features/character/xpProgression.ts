import type { CharacterRecord } from '../../types/app'
import type { AbilityCode, AbilityScores } from './characterRules'
import { primeRequisiteCodesForClass } from './characterRules'

const MAX_LEVEL = 14

const XP_THRESHOLDS_BY_CLASS: Record<string, number[]> = {
  Cleric: [0, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 400000, 500000, 600000, 700000],
  Dwarf: [0, 2200, 4400, 8800, 17000, 35000, 70000, 140000, 280000, 400000, 500000, 600000, 700000, 800000],
  Elf: [0, 4000, 8000, 16000, 32000, 64000, 120000, 250000, 400000, 600000, 850000, 1100000, 1350000, 1600000],
  Fighter: [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000, 600000, 720000, 840000],
  Halfling: [0, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 200000, 300000, 400000, 500000, 600000, 700000],
  'Magic-User': [0, 2500, 5000, 10000, 20000, 40000, 80000, 150000, 300000, 450000, 600000, 750000, 900000, 1050000],
  Thief: [0, 1200, 2400, 4800, 9600, 20000, 40000, 80000, 160000, 280000, 400000, 520000, 640000, 760000],
}

const parseAbility = (scores: Partial<AbilityScores> | null | undefined, code: AbilityCode): number | null => {
  if (!scores) return null
  const raw = scores[code]
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

export const primeRequisiteXpBonusPercent = (className: string, scores: Partial<AbilityScores> | null | undefined): number => {
  const requisites = primeRequisiteCodesForClass(className)
  if (requisites.length === 0) return 0
  const parsedScores: number[] = []
  for (const code of requisites) {
    const parsed = parseAbility(scores, code)
    if (parsed === null) return 0
    parsedScores.push(parsed)
  }
  const minPrime = Math.min(...parsedScores)
  if (minPrime >= 16) return 10
  if (minPrime >= 13) return 5
  return 0
}

export const computeGrantedXp = (baseXp: number, bonusPercent: number): { baseXp: number; bonusPercent: number; bonusXp: number; awardedXp: number } => {
  const normalizedBase = Math.max(0, Math.floor(baseXp))
  const normalizedBonus = Math.max(0, Math.floor(bonusPercent))
  const bonusXp = Math.floor((normalizedBase * normalizedBonus) / 100)
  return {
    baseXp: normalizedBase,
    bonusPercent: normalizedBonus,
    bonusXp,
    awardedXp: normalizedBase + bonusXp,
  }
}

export const levelForXp = (className: string, xp: number): number => {
  const thresholds = XP_THRESHOLDS_BY_CLASS[className]
  if (!thresholds || thresholds.length === 0) return 1
  const normalizedXp = Math.max(0, Math.floor(xp))
  let level = 1
  for (let i = 0; i < thresholds.length && i < MAX_LEVEL; i += 1) {
    if (normalizedXp >= thresholds[i]) {
      level = i + 1
    } else {
      break
    }
  }
  return Math.max(1, Math.min(MAX_LEVEL, level))
}

export const nextLevelXpFor = (className: string, level: number): number | null => {
  const thresholds = XP_THRESHOLDS_BY_CLASS[className]
  if (!thresholds || thresholds.length === 0) return null
  const nextIndex = Math.max(1, Math.floor(level))
  if (nextIndex >= thresholds.length) return null
  return thresholds[nextIndex]
}

export const projectCharacterProgress = (
  character: CharacterRecord,
  abilityScores: Partial<AbilityScores> | null | undefined,
  grantBaseXp: number,
) => {
  const bonusPercent = primeRequisiteXpBonusPercent(character.className, abilityScores)
  const { bonusXp, awardedXp } = computeGrantedXp(grantBaseXp, bonusPercent)
  const nextXpTotal = Math.max(0, character.xp + awardedXp)
  const projectedLevel = levelForXp(character.className, nextXpTotal)
  const nextLevelXp = nextLevelXpFor(character.className, projectedLevel)
  return {
    bonusPercent,
    bonusXp,
    awardedXp,
    nextXpTotal,
    projectedLevel,
    nextLevelXp,
  }
}

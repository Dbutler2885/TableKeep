// Pure OSE character rules — no React, no Firebase.
// Ability score modifiers, combat derivations, class restrictions.

export type AbilityCode = 'STR' | 'INT' | 'WIS' | 'DEX' | 'CON' | 'CHA'
export type AbilityScores = Record<AbilityCode, string>
export type SaveCode = 'D' | 'W' | 'P' | 'B' | 'S'
export type SaveScores = Record<SaveCode, string>
export type AdventureEditableCode = 'FG' | 'FT' | 'HT' | 'LD' | 'SD'
export type AdventureScores = Record<AdventureEditableCode, string>
export type ThiefSkillCode = 'CS' | 'TR' | 'HN' | 'HS' | 'MS' | 'OL' | 'PP' | 'RL'
export type ThiefSkillScores = Record<ThiefSkillCode, string>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const emptyAbilityScores = (): AbilityScores => ({
  STR: '',
  INT: '',
  WIS: '',
  DEX: '',
  CON: '',
  CHA: '',
})

export const abilityCodes: AbilityCode[] = ['STR', 'INT', 'WIS', 'DEX', 'CON', 'CHA']
export const loweringCandidateCodes: AbilityCode[] = ['STR', 'INT', 'WIS']

export const classLevel1Saves: Record<string, SaveScores> = {
  Cleric: { D: '11', W: '12', P: '14', B: '16', S: '15' },
  Dwarf: { D: '8', W: '9', P: '10', B: '13', S: '12' },
  Elf: { D: '12', W: '13', P: '13', B: '15', S: '15' },
  Fighter: { D: '12', W: '13', P: '14', B: '15', S: '16' },
  Halfling: { D: '8', W: '9', P: '10', B: '13', S: '12' },
  'Magic-User': { D: '13', W: '14', P: '13', B: '16', S: '15' },
  Thief: { D: '13', W: '14', P: '13', B: '16', S: '15' },
}

export const classHitDieByClass: Record<string, number> = {
  Cleric: 6,
  Dwarf: 8,
  Elf: 6,
  Fighter: 8,
  Halfling: 6,
  'Magic-User': 4,
  Thief: 4,
}

export const adventureDefaultsByClass = (className: string): AdventureScores => {
  const defaults: AdventureScores = { FG: '1', FT: '1', HT: '1', LD: '1', SD: '1' }
  if (className === 'Dwarf') return { ...defaults, FT: '2', LD: '2' }
  if (className === 'Elf') return { ...defaults, LD: '2', SD: '2' }
  if (className === 'Halfling') return { ...defaults, LD: '2' }
  return defaults
}

export const defaultThiefSkills = (): ThiefSkillScores => ({
  CS: '1',
  TR: '1',
  HN: '1',
  HS: '1',
  MS: '1',
  OL: '1',
  PP: '1',
  RL: '1',
})

// ---------------------------------------------------------------------------
// Ability score modifiers
// ---------------------------------------------------------------------------

export const abilityModifier = (score: number) => {
  if (score <= 3) return -2
  if (score <= 5) return -1
  if (score <= 8) return -1
  if (score <= 12) return 0
  if (score <= 15) return 1
  if (score <= 17) return 1
  return 2
}

export const formatModifier = (value: number) => {
  if (value > 0) return `+${value}`
  return String(value)
}

export const conModifierByScore = (score: number) => {
  if (score <= 3) return -3
  if (score <= 5) return -2
  if (score <= 8) return -1
  if (score <= 12) return 0
  if (score <= 15) return 1
  if (score <= 17) return 2
  return 3
}

export const formatTableModifier = (value: number) => {
  if (value === 0) return 'None'
  if (value > 0) return `+${value}`
  return String(value)
}

export const openStuckDoorByStr = (score: number) => {
  if (score <= 8) return 1
  if (score <= 12) return 2
  if (score <= 15) return 3
  if (score <= 17) return 4
  return 5
}

export const meleeModifierByStr = (score: number) => {
  if (score <= 3) return -3
  if (score <= 5) return -2
  if (score <= 8) return -1
  if (score <= 12) return 0
  if (score <= 15) return 1
  if (score <= 17) return 2
  return 3
}

export const dexCombatModByDex = (score: number) => {
  if (score <= 3) return -3
  if (score <= 5) return -2
  if (score <= 8) return -1
  if (score <= 12) return 0
  if (score <= 15) return 1
  if (score <= 17) return 2
  return 3
}

export const dexAcModByDex = (score: number) => dexCombatModByDex(score)
export const dexMissileModByDex = (score: number) => dexCombatModByDex(score)

export const wisMagicSaveModifierByScore = (score: number) => {
  if (score <= 3) return -3
  if (score <= 5) return -2
  if (score <= 8) return -1
  if (score <= 12) return 0
  if (score <= 15) return 1
  if (score <= 17) return 2
  return 3
}

// ---------------------------------------------------------------------------
// Prime requisite helpers
// ---------------------------------------------------------------------------

export const primeRequisiteCodesForClass = (className: string): AbilityCode[] => {
  if (className === 'Cleric') return ['WIS']
  if (className === 'Fighter') return ['STR']
  if (className === 'Magic-User') return ['INT']
  if (className === 'Thief') return ['DEX']
  if (className === 'Dwarf') return ['STR']
  if (className === 'Elf') return ['INT', 'STR']
  if (className === 'Halfling') return ['DEX', 'STR']
  return []
}

// ---------------------------------------------------------------------------
// Guided creation — ability score reallocation
// ---------------------------------------------------------------------------

export const buildGuidedAbilityScores = (
  code: AbilityCode,
  nextValue: number,
  currentScores: AbilityScores,
  rolledScores: AbilityScores,
  primeRequisiteCodes: AbilityCode[],
  loweringCodes: AbilityCode[],
): AbilityScores | null => {
  if (!Number.isFinite(nextValue)) return null

  const nextScores: Record<AbilityCode, number> = {
    STR: Number.parseInt(currentScores.STR || rolledScores.STR, 10),
    INT: Number.parseInt(currentScores.INT || rolledScores.INT, 10),
    WIS: Number.parseInt(currentScores.WIS || rolledScores.WIS, 10),
    DEX: Number.parseInt(currentScores.DEX || rolledScores.DEX, 10),
    CON: Number.parseInt(currentScores.CON || rolledScores.CON, 10),
    CHA: Number.parseInt(currentScores.CHA || rolledScores.CHA, 10),
  }
  nextScores[code] = nextValue

  for (const abilityCode of abilityCodes) {
    const base = Number.parseInt(rolledScores[abilityCode], 10)
    const current = nextScores[abilityCode]
    if (Number.isNaN(base) || Number.isNaN(current)) return null

    const isPrime = primeRequisiteCodes.includes(abilityCode)
    const canLowerForPoints = loweringCodes.includes(abilityCode)

    if (canLowerForPoints) {
      if (current > base) return null
      if (current < 9) return null
    } else if (!isPrime) {
      if (current !== base) return null
    }

    if (isPrime && current < base) return null
    if (current < 3 || current > 18) return null
  }

  const gained = Math.floor(
    loweringCodes.reduce((sum, abilityCode) => {
      const base = Number.parseInt(rolledScores[abilityCode], 10)
      return sum + Math.max(0, base - nextScores[abilityCode])
    }, 0) / 2,
  )
  const spent = primeRequisiteCodes.reduce((sum, abilityCode) => {
    const base = Number.parseInt(rolledScores[abilityCode], 10)
    return sum + Math.max(0, nextScores[abilityCode] - base)
  }, 0)
  if (spent > gained) return null

  return {
    STR: String(nextScores.STR),
    INT: String(nextScores.INT),
    WIS: String(nextScores.WIS),
    DEX: String(nextScores.DEX),
    CON: String(nextScores.CON),
    CHA: String(nextScores.CHA),
  }
}

export const clampInSix = (value: string) => {
  if (value.trim().length === 0) return ''
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return ''
  return String(Math.min(6, Math.max(1, parsed)))
}

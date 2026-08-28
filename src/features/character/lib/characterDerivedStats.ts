import type { CharacterArmourItem } from '../../../types/app'
import type { SaveScores, ThiefSkillScores } from '../characterRules'
import {
  abilityModifier,
  conModifierByScore,
  dexAcModByDex,
  dexMissileModByDex,
  formatModifier,
  formatTableModifier,
  meleeModifierByStr,
  openStuckDoorByStr,
  wisMagicSaveModifierByScore,
} from '../characterRules'
import { packedMovementBands, packedStrengthSlotCount } from './characterSheetLayout'
import { thiefSkillRows } from './characterSheetTables'

export const deriveThiefExpertise = (level: number, scores: ThiefSkillScores) => {
  const total = 4 + Math.max(0, Math.max(1, level) - 1) * 2
  const spent = thiefSkillRows.reduce((sum, row) => {
    const score = Number.parseInt(scores[row.code], 10)
    return Number.isNaN(score) ? sum : sum + Math.max(0, score - 1)
  }, 0)
  return { total, spent, remaining: Math.max(0, total - spent) }
}

export const deriveMovement = (packedItemCount: number) => {
  const filled = Math.max(0, packedItemCount - Math.min(packedItemCount, packedStrengthSlotCount))
  let runningSlots = 0
  const band = packedMovementBands.find((candidate) => {
    runningSlots += candidate.slotCount
    return filled <= runningSlots
  }) ?? packedMovementBands[packedMovementBands.length - 1]
  return {
    currentPackedMovement: band.label,
    currentBaseMove: band.baseMove,
    derivedOverlandMove: band.baseMove / 5,
    derivedExplorationMove: band.baseMove,
    derivedEncounterMove: band.baseMove / 3,
  }
}

type CombatParams = {
  str: number
  dex: number
  cha: number
  con: number
  wis: number
  isHalfling: boolean
  equippedBodyArmour: CharacterArmourItem | null
  equippedShield: CharacterArmourItem | null
  saveScores: SaveScores
}

export const deriveCombatStats = ({ str, dex, cha, con, wis, isHalfling, equippedBodyArmour, equippedShield, saveScores }: CombatParams) => {
  const dexInit = Number.isNaN(dex) ? 0 : abilityModifier(dex)
  const dexAc = Number.isNaN(dex) ? null : dexAcModByDex(dex)
  const dexAcAdjustment = dexAc === null ? 0 : -dexAc
  const bodyAc = Number.parseInt(equippedBodyArmour?.armourClass ?? '', 10)
  const shieldAc = Number.parseInt(equippedShield?.shieldMod ?? '', 10)
  const bodyMagic = Number.parseInt(equippedBodyArmour?.magicMod ?? '', 10)
  const shieldMagic = Number.parseInt(equippedShield?.magicMod ?? '', 10)
  const wisSave = Number.isNaN(wis) ? null : wisMagicSaveModifierByScore(wis)
  return {
    derivedDexAcModifierNumber: dexAc,
    derivedDexAcModifier: dexAc === null ? '' : formatModifier(dexAcAdjustment),
    derivedUnarmouredAc: dexAc === null ? '' : String(9 + dexAcAdjustment),
    computedAc: (Number.isNaN(bodyAc) ? 9 : bodyAc) + dexAcAdjustment + (Number.isNaN(shieldAc) ? 0 : shieldAc) + (Number.isNaN(bodyMagic) ? 0 : bodyMagic) + (Number.isNaN(shieldMagic) ? 0 : shieldMagic),
    derivedInitModifier: Number.isNaN(dex) ? '' : formatModifier(dexInit + (isHalfling ? 1 : 0)),
    derivedReactionModifier: Number.isNaN(cha) ? '' : formatModifier(abilityModifier(cha)),
    derivedOpenStuckDoor: Number.isNaN(str) ? '' : String(openStuckDoorByStr(str)),
    derivedMeleeModifier: Number.isNaN(str) ? '' : formatTableModifier(meleeModifierByStr(str)),
    derivedMissileModifier: Number.isNaN(dex) ? '' : formatTableModifier(dexMissileModByDex(dex) + (isHalfling ? 1 : 0)),
    derivedConModifierNumber: Number.isNaN(con) ? 0 : conModifierByScore(con),
    derivedConModifier: Number.isNaN(con) ? '' : formatTableModifier(conModifierByScore(con)),
    derivedWisMagicSaveModifierNumber: wisSave,
    derivedWisMagicSaveModifier: wisSave === null ? '' : formatTableModifier(wisSave),
    displayedSaveScores: {
      ...saveScores,
      W: wisSave === null || Number.isNaN(Number.parseInt(saveScores.W, 10)) ? saveScores.W : String(Number.parseInt(saveScores.W, 10) - wisSave),
      S: wisSave === null || Number.isNaN(Number.parseInt(saveScores.S, 10)) ? saveScores.S : String(Number.parseInt(saveScores.S, 10) - wisSave),
    } satisfies SaveScores,
  }
}

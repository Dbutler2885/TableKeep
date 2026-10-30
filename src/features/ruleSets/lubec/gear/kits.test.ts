/**
 * The skill-kit seam (spec 7.4): every skill's kit and always line is empty
 * until the kits are decided, and a kit line must name a stock id that exists.
 */
import { describe, expect, it } from 'vitest'
import { LUBEC_EXPERT_PREREQUISITES, LUBEC_TRAINED_SKILLS } from '../skills'
import { lubecSkillAlways, lubecSkillKit, type LubecKitLine } from './kits'
import { LUBEC_STOCK } from './stock'

const SKILLS = [...LUBEC_TRAINED_SKILLS, ...Object.keys(LUBEC_EXPERT_PREREQUISITES)]
const STOCK_IDS = new Set(LUBEC_STOCK.map((x) => x.sid))

const everyLine = (): LubecKitLine[] => SKILLS.flatMap((skill) => [...lubecSkillKit(skill), ...lubecSkillAlways(skill)])
const unknownStockIds = (lines: readonly LubecKitLine[]): string[] => lines.map((line) => line.stockId).filter((id) => !STOCK_IDS.has(id))

describe('the skill kits', () => {
  it('are empty for every skill, kit and always alike, until they are decided', () => {
    for (const skill of SKILLS) {
      expect(lubecSkillKit(skill), skill).toEqual([])
      expect(lubecSkillAlways(skill), skill).toEqual([])
    }
  })

  it('name only stock ids that exist', () => {
    expect(unknownStockIds(everyLine())).toEqual([])
  })

  it('catch a kit line naming a stock id that does not exist', () => {
    expect(unknownStockIds([{ stockId: 'bat' }, { stockId: 'family-skiff', qty: 1 }])).toEqual(['family-skiff'])
  })
})

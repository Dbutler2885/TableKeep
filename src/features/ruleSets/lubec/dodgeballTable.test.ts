import { describe, expect, it } from 'vitest'
import { LUBEC_DODGEBALL_INTRODUCTION, LUBEC_DODGEBALL_TABLE } from './dodgeballTable'
import { lubecDodgeballRow } from './dodgeballWound'
import sourceRows from './fixtures/dodgeball-source-rows.json'

// Transcribed independently from the approved report's Dodgeball section.
// Formatting marks are removed; the source names, words and numbers are preserved.
const locations = {
  'head-neck': 'head', 'torso-waist': 'torso', groin: 'groin', arms: 'upperarm-L', hand: 'hand-R', legs: 'shin-L',
}

describe('the approved Dodgeball table', () => {
  it('has six groups of six distinct Impact columns, exactly 36 source rows', () => {
    expect(Object.keys(LUBEC_DODGEBALL_TABLE)).toEqual(Object.keys(locations))
    expect(sourceRows).toHaveLength(36)
    expect(Object.values(LUBEC_DODGEBALL_TABLE).flat()).toHaveLength(36)
    for (const rows of Object.values(LUBEC_DODGEBALL_TABLE)) {
      expect(rows.map(({ impact }) => impact)).toEqual([1, 2, 3, 4, 5, 6])
    }
  })

  it.each(sourceRows)('public lookup preserves $group Impact $impact: $name', (source) => {
    const location = locations[source.group as keyof typeof locations]
    const found = lubecDodgeballRow(location, source.impact)
    expect(found).toMatchObject({ ...source, location })
  })

  it('uses Defense in the introduction without an Evasive Movement modifier', () => {
    expect(LUBEC_DODGEBALL_INTRODUCTION).toContain('the target defends with Defense')
    expect(LUBEC_DODGEBALL_INTRODUCTION).toContain('base Impact 0')
    expect(LUBEC_DODGEBALL_INTRODUCTION).toContain('Every hit puts the target out unless the row says otherwise.')
    expect(JSON.stringify(LUBEC_DODGEBALL_TABLE) + LUBEC_DODGEBALL_INTRODUCTION).not.toMatch(/Evasive Movement/i)
  })
})

import { describe, expect, it } from 'vitest'
import { LUBEC_WOUND_TABLES, lubecWoundTableRow } from './index'
import { isLubecLastingInjury } from './lastingInjuries'

const REGIONS = ['head', 'neck', 'torso', 'waist', 'groin', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'feet']
const TRAUMA = { Minor: 0, Serious: 1, Severe: 2, Critical: 2, Catastrophic: 4 }
const tables = Object.entries(LUBEC_WOUND_TABLES)

describe('the wound tables as data', () => {
  it('has the six weapon tables the attacks name', () => {
    expect(Object.keys(LUBEC_WOUND_TABLES).sort()).toEqual(['blunt', 'cutting', 'fisticuffs', 'gunshot', 'piercing', 'thrown'])
  })

  it.each(tables)('%s covers every body region exactly once', (_, table) => {
    expect(table.locations.flatMap((location) => location.parts).sort()).toEqual([...REGIONS].sort())
  })

  it.each(tables)('%s rows run from Impact 1 without a gap and the last covers the rest', (_, table) => {
    for (const { rows } of table.locations) {
      expect(rows.map((row) => row.impact)).toEqual(rows.map((_, index) => index + 1))
      expect(rows.map((row) => row.orMore ?? false)).toEqual(rows.map((_, index) => index === rows.length - 1))
    }
  })

  it.each(tables)('%s gives each severity its Trauma, names every wound, and leaves only listed injuries', (_, table) => {
    for (const row of table.locations.flatMap((location) => location.rows)) {
      expect(row.trauma).toBe(TRAUMA[row.severity])
      expect(row.name).not.toBe('')
      for (const injury of [row.injury, ...(row.choices ?? []).map((choice) => choice.injury)]) {
        if (injury) expect(isLubecLastingInjury(injury)).toBe(true)
      }
      if (row.save) expect(row.save.successTrauma).toBeLessThan(row.trauma)
      // A wound goes onto a sheet on its own, so its words never lean on another row's.
      for (const words of [row.text, ...(row.choices ?? []).map((choice) => choice.text)]) expect(words).not.toMatch(/^as (torso|above)/i)
    }
  })
})

describe('reading a row', () => {
  it('reads the struck region, a paired part by its region, and clamps at the open-ended row', () => {
    expect(lubecWoundTableRow('blunt', 'head', 6)?.row.name).toBe('Skull fracture')
    expect(lubecWoundTableRow('blunt', 'head', 12)?.row.name).toBe('Skull fracture')
    expect(lubecWoundTableRow('blunt', 'hand-L', 5)?.row.name).toBe('Fractured hand / wrist')
    expect(lubecWoundTableRow('gunshot', 'feet-R', 1)?.row).toMatchObject({ severity: 'Minor', name: 'Graze' })
  })

  it.each([['an unknown table', 'dodgeball', 'head', 3], ['an unknown part', 'blunt', 'tail', 3], ['Impact 0', 'blunt', 'head', 0], ['a fraction', 'blunt', 'head', 1.5]])(
    'has no row for %s', (_, key, part, impact) => {
      expect(lubecWoundTableRow(key as string, part as string, impact as number)).toBeNull()
    },
  )

  it('carries a concussion\'s Body Save, a d2\'s two wounds, unconsciousness and the lasting injury', () => {
    expect(lubecWoundTableRow('blunt', 'head', 2)?.row.save).toEqual({ successTrauma: 0, success: 'Only Dazed, and 0 Trauma instead of +1.', failure: 'Now: Dazed. Lasting: -10 Handle. After 1 Long Rest: healed.' })
    expect(lubecWoundTableRow('gunshot', 'torso', 3)?.row.choices).toEqual([
      { name: 'Bullet along the ribs', text: 'Disadvantage on physical Checks; half Movement and no Evasive Movement.' },
      { name: 'Lodged bullet', text: '-20 Strength and Speed for exertion until proper medical treatment; First Aid stabilizes but cannot remove it.', injury: 'Lodged object' },
    ])
    expect(lubecWoundTableRow('fisticuffs', 'neck', 8)?.row).toMatchObject({ name: 'Blow to the side of the neck', out: true })
    expect(lubecWoundTableRow('blunt', 'torso', 4)?.row).toMatchObject({ name: 'Broken rib(s)', injury: 'Broken ribs' })
  })

  it('splits a grouped Fisticuffs row by the part it struck', () => {
    expect(lubecWoundTableRow('fisticuffs', 'upperarm-L', 7)?.row).toMatchObject({ name: 'Dislocated shoulder', injury: 'Dislocated shoulder' })
    expect(lubecWoundTableRow('fisticuffs', 'forearm-L', 7)?.row).toMatchObject({ name: 'Broken forearm', injury: 'Broken arm' })
    expect(lubecWoundTableRow('fisticuffs', 'hand-R', 9)?.row).toMatchObject({ name: 'Fractured hand / wrist', injury: 'Broken hand' })
    expect(lubecWoundTableRow('fisticuffs', 'waist', 6)?.row.name).toBe('Body injury')
    expect(lubecWoundTableRow('fisticuffs', 'torso', 6)?.row.name).toBe('Rib injury')
    expect(lubecWoundTableRow('fisticuffs', 'groin', 1)?.location.parts).toEqual(['groin'])
  })
})

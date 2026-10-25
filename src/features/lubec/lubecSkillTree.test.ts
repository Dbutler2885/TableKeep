import { describe, expect, it } from 'vitest'
import { LUBEC_CLASSES } from '../ruleSets/lubec/classes'
import { lubecSheet } from '../ruleSets/lubec/sheetFixtures'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { LUBEC_SKILL_TREE_ROWS } from '../ruleSets/lubec/skills'
import {
  LUBEC_PACKAGE_RULES,
  LUBEC_TREE_EXPERT,
  LUBEC_TREE_TRAINED,
  lubecDetailTag,
  lubecFreeList,
  lubecHasSkill,
  lubecHotSkills,
  lubecKitLine,
  lubecLeadsTo,
  lubecPackageProgress,
  lubecPackageTarget,
  lubecPickCounts,
  lubecRelatedSkills,
  lubecShapeLabel,
  lubecSuggestedSkills,
  lubecUnknownSkills,
  lubecWires,
  withDotClicked,
  withFreeChipClicked,
  type LubecNodePosition,
} from './lubecSkillTree'

const WORKING_FREE = LUBEC_CLASSES.working.skillPackage.free

const withSkills = (skills: LubecSheet['skills'], classKey: string | null = 'working'): LubecSheet =>
  lubecSheet({ class: { key: classKey, choices: { statPenalty: null, statBonus: null } }, skills })

describe('the Lubec skill tree', () => {
  it('lays out 27 Trained and 27 Expert skills in the tree\'s order', () => {
    expect(LUBEC_TREE_TRAINED).toHaveLength(27)
    expect(LUBEC_TREE_EXPERT).toHaveLength(27)
    expect(LUBEC_TREE_TRAINED.slice(0, 3)).toEqual(['Campcraft', 'Tides & Flats', 'Swimming'])
    expect(LUBEC_TREE_EXPERT.slice(-2)).toEqual(['Into Weird Shit', 'Field Medicine'])
  })

  it('says what a skill leads to, and lights it with everything it needs or leads to', () => {
    expect(lubecLeadsTo('Hunting')).toEqual(['Trapping', 'Tracking', 'Firearms', 'Slingshot / Archery'])
    expect(lubecLeadsTo('Diving')).toEqual([])
    expect([...lubecRelatedSkills('Diving')]).toEqual(['Diving', 'Swimming', 'Tides & Flats'])
    expect([...lubecRelatedSkills('Swimming')]).toEqual(['Swimming', 'Diving'])
    expect([...lubecRelatedSkills('Knot Tying')]).toEqual(['Knot Tying'])
  })
})

describe('the Lubec skill tree\'s nodes', () => {
  it('fills in the free class skill and the picks', () => {
    const skills = { free: 'Boatwork', picked: ['Swimming'] }
    expect(lubecHasSkill(skills, 'Boatwork')).toBe(true)
    expect(lubecHasSkill(skills, 'Swimming')).toBe(true)
    expect(lubecHasSkill(skills, 'Diving')).toBe(false)
  })

  it('lights nothing until a name is focused', () => {
    expect([...lubecHotSkills(null)]).toEqual([])
    expect([...lubecHotSkills('Diving')]).toEqual(['Diving', 'Swimming', 'Tides & Flats'])
  })

  it('dashes the class\'s free list only while skills are chosen and no free class skill is', () => {
    const freeList = lubecFreeList('working')
    expect(freeList).toEqual(['Boatwork', 'Jury-Rigging', 'Tides & Flats'])
    expect(lubecFreeList(null)).toEqual([])
    expect(lubecSuggestedSkills({ free: null, picked: [] }, freeList, true)).toEqual(freeList)
    expect(lubecSuggestedSkills({ free: 'Boatwork', picked: [] }, freeList, true)).toEqual([])
    expect(lubecSuggestedSkills({ free: null, picked: [] }, freeList, false)).toEqual([])
  })
})

describe('choosing Lubec skills from the tree', () => {
  it('clears the free class skill from its dot', () => {
    expect(withDotClicked({ free: 'Boatwork', picked: ['Swimming'] }, 'Boatwork', WORKING_FREE)).toEqual({ free: null, picked: ['Swimming'] })
  })

  it('takes the first dot from the free list as the free class skill while none is chosen', () => {
    expect(withDotClicked({ free: null, picked: [] }, 'Jury-Rigging', WORKING_FREE)).toEqual({ free: 'Jury-Rigging', picked: [] })
  })

  it('toggles a pick for every other dot, a picked skill on the free list included', () => {
    expect(withDotClicked({ free: null, picked: ['Boatwork'] }, 'Boatwork', WORKING_FREE)).toEqual({ free: null, picked: [] })
    expect(withDotClicked({ free: 'Boatwork', picked: [] }, 'Jury-Rigging', WORKING_FREE)).toEqual({ free: 'Boatwork', picked: ['Jury-Rigging'] })
    expect(withDotClicked({ free: null, picked: [] }, 'Diving', [])).toEqual({ free: null, picked: ['Diving'] })
  })

  it('chooses a free chip as the free class skill, and clears it when it already is', () => {
    expect(withFreeChipClicked({ free: 'Boatwork', picked: ['Tides & Flats'] }, 'Tides & Flats')).toEqual({ free: 'Tides & Flats', picked: [] })
    expect(withFreeChipClicked({ free: 'Boatwork', picked: [] }, 'Boatwork')).toEqual({ free: null, picked: [] })
  })
})

describe('the Lubec class package', () => {
  it('counts the picks beside the free class skill once each, and an unknown name not at all', () => {
    expect(lubecPickCounts({ free: 'Boatwork', picked: ['Boatwork', 'Swimming', 'Swimming', 'Diving', 'Whittling'] }))
      .toEqual({ trained: 1, expert: 1 })
  })

  it('labels a package shape Expert first, as the prototype\'s counter does', () => {
    expect(lubecShapeLabel({ trained: 1, expert: 2 })).toBe('2 Expert + 1 Trained')
    expect(lubecShapeLabel({ trained: 2, expert: 0 })).toBe('2 Trained')
    expect(lubecShapeLabel({ trained: 0, expert: 0 })).toBe('')
    expect(lubecPackageTarget(LUBEC_CLASSES.tough)).toBe('1 Expert or 2 Trained')
    expect(lubecPackageTarget(LUBEC_CLASSES.nerd)).toBe('2 Expert + 1 Trained')
  })

  it('words every class\'s package, the Nerd\'s as the grilling decision changed it', () => {
    expect(Object.keys(LUBEC_PACKAGE_RULES)).toEqual(Object.keys(LUBEC_CLASSES))
    expect(LUBEC_PACKAGE_RULES.nerd).toMatch(/^1 Trained and 2 Expert\./)
  })

  it('tells how far the package has come, and nothing while the class is a hole', () => {
    expect(lubecPackageProgress(withSkills({ free: 'Boatwork', picked: [] }, null))).toBeNull()
    expect(lubecPackageProgress(withSkills({ free: null, picked: ['Swimming'] }))).toBe('Choose your free class skill')
    expect(lubecPackageProgress(withSkills({ free: 'Boatwork', picked: [] }))).toBe('Pick 1 Expert + 1 Trained')
    expect(lubecPackageProgress(withSkills({ free: 'Boatwork', picked: ['Diving', 'Foraging'] }))).toBe('Picked 2 Expert of 1 Expert + 1 Trained')
    expect(lubecPackageProgress(withSkills({ free: 'Boatwork', picked: ['Swimming', 'Driving'] }))).toBe('Package complete')
  })

  it('is complete with more picks than the package asks for', () => {
    expect(lubecPackageProgress(withSkills({ free: 'Boatwork', picked: ['Swimming', 'Driving', 'Diving', 'Art'] }))).toBe('Package complete')
  })

  it('is not complete while an Expert lacks its prerequisite, even with the right shape', () => {
    expect(lubecPackageProgress(withSkills({ free: 'Boatwork', picked: ['Art', 'Firearms'] }))).toBe('Picked 1 Expert + 1 Trained of 1 Expert + 1 Trained')
  })
})

describe('the Lubec skill detail bar', () => {
  it('writes what a skill always has and its kit on one line, and nothing for a skill with neither', () => {
    expect(lubecKitLine({ description: '', always: 'A metal detector', kit: ['Old town maps', 'A bag of old finds'] }))
      .toBe('Always have: A metal detector / Kit: Old town maps, A bag of old finds')
    expect(lubecKitLine({ description: '', always: 'A Wrist-Rocket slingshot', kit: [] })).toBe('Always have: A Wrist-Rocket slingshot')
    expect(lubecKitLine({ description: '', always: null, kit: ['Chest waders'] })).toBe('Kit: Chest waders')
    expect(lubecKitLine({ description: '', always: null, kit: [] })).toBeNull()
  })

  it('marks the class skill and the picks', () => {
    const skills = { free: 'Boatwork', picked: ['Swimming'] }
    expect(lubecDetailTag(skills, 'Boatwork')).toBe('Class skill')
    expect(lubecDetailTag(skills, 'Swimming')).toBe('Chosen')
    expect(lubecDetailTag(skills, 'Diving')).toBeNull()
  })

  it('names the stored skills the tree does not have, the free class skill first', () => {
    expect(lubecUnknownSkills({ free: 'Knot Tying', picked: ['Swimming', 'Whittling'] })).toEqual(['Knot Tying', 'Whittling'])
    expect(lubecUnknownSkills({ free: null, picked: ['Swimming'] })).toEqual([])
  })
})

describe('the Lubec skill tree\'s wires', () => {
  // Every row 30px apart, every Trained label ending at 200 and every Expert dot starting at 400.
  const placed = (moved: Record<string, Partial<LubecNodePosition>> = {}) => Object.fromEntries(
    LUBEC_SKILL_TREE_ROWS.flatMap(([trained, expert], row) => [
      [trained, { y: row * 30, dotLeft: 0, labelRight: 200 }],
      [expert, { y: row * 30, dotLeft: 400, labelRight: 600 }],
    ]).filter(([name]) => name !== null).map(([name, position]) => [name, { ...position, ...moved[name as string] }]),
  ) as Record<string, LubecNodePosition>

  const wire = (wires: ReturnType<typeof lubecWires>, source: string, target: string) =>
    wires.find((each) => each.source === source && each.target === target)?.d

  it('draws one wire per prerequisite, Expert by Expert down the tree', () => {
    const wires = lubecWires(placed())
    expect(wires).toHaveLength(59)
    expect(wires.slice(0, 3).map(({ source, target }) => [source, target]))
      .toEqual([['Campcraft', 'Wilderness Survival'], ['Campcraft', 'Foraging'], ['Tides & Flats', 'Foraging']])
  })

  it('runs straight across between level skills', () => {
    expect(wire(lubecWires(placed()), 'Campcraft', 'Wilderness Survival')).toBe('M206,0 H397')
  })

  it('steps square down the source\'s lane between skills too close for rounded corners', () => {
    // Tides & Flats has the second of 25 lanes, spread 7px apart from 14px past the widest label.
    expect(wire(lubecWires(placed({ Foraging: { y: 35 } })), 'Tides & Flats', 'Foraging')).toBe('M206,30 H221 V35 H397')
  })

  it('rounds its corners down or up the source\'s lane otherwise', () => {
    const wires = lubecWires(placed())
    expect(wire(wires, 'Tides & Flats', 'Diving')).toBe('M206,30 H216 Q221,30 221,35 V55 Q221,60 226,60 H397')
    expect(wire(wires, 'Local Lore', 'Old-Timers')).toBe('M206,750 H356 Q361,750 361,745 V725 Q361,720 366,720 H397')
  })
})

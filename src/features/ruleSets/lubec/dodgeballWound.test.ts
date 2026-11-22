import { describe, expect, it } from 'vitest'
import { LOC_KEYS, LOCATIONS } from './gear/gearRules'
import { LUBEC_DODGEBALL_TABLE, type LubecDodgeballResolution } from './dodgeballTable'
import { lubecDodgeballRow, type LubecDodgeballEffect } from './dodgeballWound'
import { lubecActiveModifiers, parseLubecEffects } from './effects'

const locationGroups = [
  ['head', 'head-neck'], ['neck', 'head-neck'], ['torso', 'torso-waist'], ['waist', 'torso-waist'], ['groin', 'groin'],
  ['upperarm', 'arms'], ['upperarm-L', 'arms'], ['upperarm-R', 'arms'],
  ['forearm', 'arms'], ['forearm-L', 'arms'], ['forearm-R', 'arms'],
  ['hand', 'hand'], ['hand-L', 'hand'], ['hand-R', 'hand'],
  ['thigh', 'legs'], ['thigh-L', 'legs'], ['thigh-R', 'legs'],
  ['shin', 'legs'], ['shin-L', 'legs'], ['shin-R', 'legs'],
  ['feet', 'legs'], ['feet-L', 'legs'], ['feet-R', 'legs'],
] as const

function resolutionAt(location: string, impact: number): LubecDodgeballResolution<LubecDodgeballEffect> {
  const found = lubecDodgeballRow(location, impact)
  expect(found).not.toBeNull()
  return found!.resolution
}

function automaticAt(location: string, impact: number) {
  const resolution = resolutionAt(location, impact)
  if (resolution.kind !== 'automatic') throw new Error('Expected an automatic wound')
  return resolution.outcome
}

function checkAt(location: string, impact: number) {
  const resolution = resolutionAt(location, impact)
  if (resolution.kind !== 'check') throw new Error('Expected a Check or Save')
  return resolution
}

describe('Dodgeball location and Impact lookup', () => {
  it('covers every prototype location, including both sides and unsided part ids', () => {
    expect(new Set(locationGroups.map(([location]) => location)))
      .toEqual(new Set([...LOC_KEYS, ...LOCATIONS.map(({ id }) => id)]))
  })

  it.each(locationGroups)('maps %s to %s across all six columns and high Impact', (location, group) => {
    for (const impact of [1, 2, 3, 4, 5, 6, 7, 10, 100, Number.MAX_SAFE_INTEGER]) {
      const expected = LUBEC_DODGEBALL_TABLE[group][Math.min(impact, 6) - 1]
      expect(lubecDodgeballRow(location, impact)).toMatchObject({
        location, group, impact: expected.impact, name: expected.name, severity: expected.severity, trauma: expected.trauma,
      })
    }
  })

  it.each([0, -1, -100, 0.5, 1.5, 5.9, 6.5, NaN, Infinity, -Infinity])('has no wound row for invalid Impact %s', (impact) => {
    expect(lubecDodgeballRow('head', impact)).toBeNull()
  })

  it.each(['', 'unknown', 'head-L', 'toString', '__proto__', 'constructor'])('has no row for unknown location %s', (location) => {
    expect(lubecDodgeballRow(location, 1)).toBeNull()
  })
})

// Row-granted Stress. Failed core Checks/Saves add their own class-aware Stress later.
const automaticRows = [
  ['head', 1, 0, 0, false], ['head', 2, 0, 1, false], ['head', 3, 0, 0, true],
  ['head', 4, 0, 0, false], ['head', 5, 1, 0, false],
  ['torso', 2, 0, 0, false], ['torso', 3, 0, 0, false], ['torso', 4, 0, 0, false],
  ['torso', 5, 0, 0, false], ['torso', 6, 0, 1, false],
  ['groin', 1, 0, 1, false], ['groin', 2, 0, 0, false], ['groin', 3, 0, 0, false],
  ['groin', 4, 0, 0, false], ['groin', 5, 1, 1, false], ['groin', 6, 1, 2, false],
  ['upperarm-L', 1, 0, 1, false], ['upperarm-L', 2, 0, 0, false], ['upperarm-L', 3, 0, 0, false],
  ['upperarm-L', 4, 0, 0, false], ['upperarm-L', 5, 0, 0, false], ['upperarm-L', 6, 0, 1, false],
  ['hand-R', 3, 0, 0, false], ['hand-R', 4, 0, 0, false], ['hand-R', 5, 0, 1, false], ['hand-R', 6, 1, 0, false],
  ['feet-R', 1, 0, 0, false], ['feet-R', 2, 0, 0, false], ['feet-R', 3, 0, 0, false],
  ['feet-R', 4, 0, 0, false], ['feet-R', 5, 0, 1, false], ['feet-R', 6, 0, 0, false],
] as const

describe('Dodgeball outcomes', () => {
  it.each(automaticRows)('%s Impact %i: Trauma %i, Stress %i, thrower Out %s', (location, impact, trauma, stress, throwerOut) => {
    expect(automaticAt(location, impact)).toMatchObject({ trauma, stress, targetOut: true, throwerOut, caught: false })
  })

  it.each([
    ['torso', 1, 'normal'], ['waist', 1, 'normal'],
    ['hand-L', 1, 'normal'], ['hand-R', 1, 'normal'],
    ['hand-L', 2, 'disadvantage'], ['hand-R', 2, 'disadvantage'],
  ] as const)('%s Impact %i uses a Handle Check with %s rolls and both catch outcomes', (location, impact, advantage) => {
    const resolution = checkAt(location, impact)
    expect(resolution.check).toEqual({ kind: 'stat-check', against: 'Handle', advantage })
    expect(resolution.success).toEqual({
      text: 'The target catches it and stays in; the thrower is out instead.',
      trauma: 0, stress: 0, targetOut: false, throwerOut: true, caught: true, effects: [],
    })
    expect(resolution.failure).toEqual({
      text: 'Out.', trauma: 0, stress: 0, targetOut: true, throwerOut: false, caught: false, effects: [],
    })
  })

  it.each(['head', 'neck'])('Bell rung at %s uses the normal Body Save with different Trauma and effects', (location) => {
    const resolution = checkAt(location, 6)
    expect(resolution.check).toEqual({ kind: 'save', against: 'Body', advantage: 'normal' })
    expect(resolution.success).toMatchObject({ trauma: 0, stress: 0, targetOut: true, throwerOut: false, caught: false })
    expect(resolution.failure).toMatchObject({ trauma: 1, stress: 0, targetOut: true, throwerOut: false, caught: false })
    expect(resolution.success.text).toBe('Only Dazed, and 0 Trauma instead of +1.')
    expect(resolution.failure.text).toBe('Minor Concussion, which is Dazed and -10 Handle until a Long Rest.')
    expect(resolution.success.effects.map(({ name, duration, steps }) => ({ name, duration, steps }))).toEqual([
      { name: 'Dazed', duration: '1 round', steps: [{ modifiers: [], labels: ['Dazed'] }] },
    ])
    expect(resolution.failure.effects.map(({ name, duration, steps }) => ({ name, duration, steps }))).toEqual([
      { name: 'Dazed', duration: '1 round', steps: [{ modifiers: [], labels: ['Dazed'] }] },
      { name: 'Minor Concussion', duration: 'Until a Long Rest', steps: [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }] },
    ])
  })
})

describe('Dodgeball sheet effect payloads', () => {
  it.each(['hand-L', 'hand-R'])('preserves the injured %s, full editable wrist label, duration and source without a global Handle penalty', (location) => {
    const effects = automaticAt(location, 6).effects
    expect(effects).toEqual([{
      name: 'Hand / wrist injury', duration: 'After 1 Long Rest: healed.',
      durationSource: 'Hand / wrist injury: Blunt Force, hand, Impact 3-4',
      steps: [{ modifiers: [], labels: ['-20 Handle on actions with this hand if dominant; -10 if other'] }],
      struckLocation: location,
      source: {
        table: 'dodgeball', group: 'hand', impact: 6, name: 'Sprained wrist',
        text: 'Out. Hand / wrist injury: -20 Handle (dominant) or -10 (other) on actions with that hand.',
      },
    }])
    const stored = parseLubecEffects(effects.map((effect) => ({ ...effect, id: 'wound-1', cause: 'Fight 1: Sprained wrist' })))
    expect(stored[0]).toMatchObject(effects[0])
    expect(lubecActiveModifiers(stored)).toEqual([])
    stored[0].steps[0].labels[0] = 'GM-edited wrist label'
    expect(stored[0].steps[0].labels).toEqual(['GM-edited wrist label'])
  })

  it('provides only the unconditional failed-concussion modifier across the entire table', () => {
    const numeric = []
    for (const [location] of locationGroups) {
      for (let impact = 1; impact <= 6; impact++) {
        const resolution = resolutionAt(location, impact)
        const outcomes = resolution.kind === 'automatic' ? [resolution.outcome] : [resolution.success, resolution.failure]
        for (const outcome of outcomes) {
          const modifiers = outcome.effects.flatMap((effect) => effect.steps.flatMap((step) => step.modifiers))
          if (modifiers.length > 0) numeric.push({ location, impact, modifiers })
        }
      }
    }
    expect(numeric).toEqual(['head', 'neck'].map((location) => ({ location, impact: 6, modifiers: [{ target: 'Handle', amount: -10 }] })))
  })

  it.each([
    ['head', 1, 'Next roll at Disadvantage while your ears ring.', 'Next roll'],
    ['head', 5, 'Sent to the nurse.', null],
    ['torso', 3, "A red welt in the ball's pattern lasts the rest of the day.", 'Rest of the day'],
    ['torso', 4, 'Next relevant physical Check at Disadvantage.', 'Next relevant physical Check'],
    ['torso', 5, 'Knocked down', null],
    ['groin', 2, 'Lose the next Movement Stage.', 'Next Movement Stage'],
    ['groin', 4, 'Dazed', '1 round'],
    ['forearm-R', 3, 'Next roll with that arm at Disadvantage.', 'Next roll with that arm'],
    ['forearm-R', 4, 'Whatever that hand holds is dropped.', null],
    ['upperarm-L', 5, 'Rolls with that arm at Disadvantage for the rest of the scene.', 'Rest of the scene'],
    ['upperarm-L', 6, 'Rolls with that arm at Disadvantage for the rest of the scene.', 'Rest of the scene'],
    ['hand-L', 3, 'Next roll with that hand at Disadvantage.', 'Next roll with that hand'],
    ['hand-R', 4, 'Rolls with that hand at Disadvantage until a Long Rest.', 'Until a Long Rest'],
    ['hand-R', 5, 'Rolls with that hand at Disadvantage until a Long Rest.', 'Until a Long Rest'],
    ['thigh-L', 3, 'Next Speed Check at Disadvantage.', 'Next Speed Check'],
    ['shin-R', 6, 'Speed Checks at Disadvantage for the rest of the scene.', 'Rest of the scene'],
  ] as const)('%s Impact %i keeps "%s" as words with its duration', (location, impact, text, duration) => {
    expect(automaticAt(location, impact).effects).toContainEqual(expect.objectContaining({
      struckLocation: location, duration, steps: [{ modifiers: [], labels: [text] }],
      source: expect.objectContaining({ table: 'dodgeball', impact }),
    }))
  })

  it('keeps edited labels, modifiers, checks and sources independent across lookups', () => {
    const firstWrist = automaticAt('hand-L', 6)
    firstWrist.effects[0].steps[0].labels[0] = 'Changed'
    firstWrist.effects[0].source.text = 'Changed'
    expect(automaticAt('hand-L', 6).effects[0].steps[0].labels[0]).toBe('-20 Handle on actions with this hand if dominant; -10 if other')
    expect(automaticAt('hand-R', 6).effects[0].source.text).not.toBe('Changed')

    const firstBell = checkAt('head', 6)
    firstBell.check.advantage = 'advantage'
    firstBell.failure.effects[1].steps[0].modifiers[0].amount = -99
    firstBell.success.effects[0].steps[0].labels.push('Changed')
    const nextBell = checkAt('head', 6)
    expect(nextBell.check.advantage).toBe('normal')
    expect(nextBell.failure.effects[1].steps[0].modifiers).toEqual([{ target: 'Handle', amount: -10 }])
    expect(nextBell.success.effects[0].steps[0].labels).toEqual(['Dazed'])
    expect(nextBell.failure.effects[0].steps[0].labels).toEqual(['Dazed'])
  })
})

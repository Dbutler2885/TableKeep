import type { LubecAdvantage, LubecCheckKind } from './checkRoll'
import type { LubecEffectStep } from './effects'

// Approved source: lubec-hit-location-tables/report.md, "Dodgeball (combat training)".
// The mapless combat spec supersedes its introduction's defense terminology.
// Only Dodgeball is represented here; this module applies nothing to a sheet.
export const LUBEC_DODGEBALL_INTRODUCTION =
  'A dodgeball is a thrown ball: Impact is Attack Quality plus Strength Bonus, with base Impact 0, and the target defends with Defense. Every hit puts the target out unless the row says otherwise.'

export type LubecDodgeballGroup = 'head-neck' | 'torso-waist' | 'groin' | 'arms' | 'hand' | 'legs'
export type LubecDodgeballImpact = 1 | 2 | 3 | 4 | 5 | 6

/** An editable sheet-effect template, before the struck location and row source are bound. */
export type LubecDodgeballEffectTemplate = {
  name: string
  steps: LubecEffectStep[]
  /** Words for the GM, never a timer or conditional-roll instruction. */
  duration: string | null
  durationSource?: string
}

export type LubecDodgeballOutcome<E = LubecDodgeballEffectTemplate> = {
  text: string
  trauma: 0 | 1
  /** Row-granted Stress only; the ordinary Check/Save roller owns failure Stress. */
  stress: number
  targetOut: boolean
  throwerOut: boolean
  caught: boolean
  effects: readonly E[]
}

export type LubecDodgeballResolution<E = LubecDodgeballEffectTemplate> =
  | { kind: 'automatic'; outcome: LubecDodgeballOutcome<E> }
  | {
    kind: 'check'
    check: { kind: LubecCheckKind; against: 'Handle' | 'Body'; advantage: LubecAdvantage }
    success: LubecDodgeballOutcome<E>
    failure: LubecDodgeballOutcome<E>
  }

export type LubecDodgeballRow<E = LubecDodgeballEffectTemplate> = {
  impact: LubecDodgeballImpact
  name: string
  text: string
  severity: 'Minor' | 'Serious'
  /** Printed Trauma, before a Check/Save changes it. */
  trauma: 0 | 1
  resolution: LubecDodgeballResolution<E>
}

const outcome = (text: string, changes: Partial<LubecDodgeballOutcome> = {}): LubecDodgeballOutcome =>
  ({ text, trauma: 0, stress: 0, targetOut: true, throwerOut: false, caught: false, effects: [], ...changes })

const label = (name: string, text: string, duration: string | null = null): LubecDodgeballEffectTemplate =>
  ({ name, duration, steps: [{ modifiers: [], labels: [text] }] })

const dazed = label('Dazed', 'Dazed', '1 round')
const knockedDown = label('Knocked down', 'Knocked down')
const loseMovement = label('Lost movement', 'Lose the next Movement Stage.', 'Next Movement Stage')

function row(impact: LubecDodgeballImpact, name: string, text: string, resolution: LubecDodgeballResolution): LubecDodgeballRow {
  const trauma = resolution.kind === 'automatic' ? resolution.outcome.trauma : resolution.failure.trauma
  return { impact, name, text, trauma, severity: trauma === 0 ? 'Minor' : 'Serious', resolution }
}

const wound = (impact: LubecDodgeballImpact, name: string, text: string, changes: Partial<LubecDodgeballOutcome> = {}): LubecDodgeballRow =>
  row(impact, name, text, { kind: 'automatic', outcome: outcome(text, changes) })

const caught = outcome('The target catches it and stays in; the thrower is out instead.',
  { targetOut: false, throwerOut: true, caught: true })

function handleCheck(impact: LubecDodgeballImpact, name: string, text: string, advantage: LubecAdvantage): LubecDodgeballRow {
  return row(impact, name, text, {
    kind: 'check', check: { kind: 'stat-check', against: 'Handle', advantage },
    success: caught, failure: outcome('Out.'),
  })
}

const minorConcussion: LubecDodgeballEffectTemplate = {
  name: 'Minor Concussion', duration: 'Until a Long Rest',
  steps: [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }],
}

const sprainedWrist: LubecDodgeballEffectTemplate = {
  ...label('Hand / wrist injury', '-20 Handle on actions with this hand if dominant; -10 if other', 'After 1 Long Rest: healed.'),
  // Dodgeball names this injury; its duration is in the source's expanded injury row.
  durationSource: 'Hand / wrist injury: Blunt Force, hand, Impact 3-4',
}

/** Six source groups, each with exactly the six printed columns (6 means 6+). */
export const LUBEC_DODGEBALL_TABLE: Readonly<Record<LubecDodgeballGroup, readonly LubecDodgeballRow[]>> = {
  'head-neck': [
    wound(1, 'Bonk', 'Out. Next roll at Disadvantage while your ears ring.',
      { effects: [label('Bonk', 'Next roll at Disadvantage while your ears ring.', 'Next roll')] }),
    wound(2, 'Glasses or hat knocked flying', 'Out. Gain 1 Stress as the gym laughs.', { stress: 1 }),
    wound(3, 'Headshot', 'Out, but Coach calls it: the thrower is out too.', { throwerOut: true }),
    wound(4, 'Smacked in the face', 'Out. Dazed.', { effects: [dazed] }),
    wound(5, 'Bloody nose', 'Out. Dazed. Sent to the nurse.',
      { trauma: 1, effects: [dazed, label('Bloody nose', 'Sent to the nurse.')] }),
    row(6, 'Bell rung', 'Out. Minor Concussion. Body Save. Success: only Dazed, and 0 Trauma instead of +1. Failure: Minor Concussion, which is Dazed and -10 Handle until a Long Rest.', {
      kind: 'check', check: { kind: 'save', against: 'Body', advantage: 'normal' },
      success: outcome('Only Dazed, and 0 Trauma instead of +1.', { effects: [dazed] }),
      failure: outcome('Minor Concussion, which is Dazed and -10 Handle until a Long Rest.',
        { trauma: 1, effects: [dazed, minorConcussion] }),
    }),
  ],
  'torso-waist': [
    handleCheck(1, 'Trapped against the chest', 'Handle Check: success catches it, and the thrower is out instead. Failure: out.', 'normal'),
    wound(2, 'Thud', 'Out.'),
    wound(3, 'Stung', "Out. A red welt in the ball's pattern lasts the rest of the day.",
      { effects: [label('Stung', "A red welt in the ball's pattern lasts the rest of the day.", 'Rest of the day')] }),
    wound(4, 'Winded', 'Out. Next relevant physical Check at Disadvantage.',
      { effects: [label('Winded', 'Next relevant physical Check at Disadvantage.', 'Next relevant physical Check')] }),
    wound(5, 'Knocked down', 'Out.', { effects: [knockedDown] }),
    wound(6, 'Breath knocked out', 'Out. Dazed. Gain 1 Stress.', { stress: 1, effects: [dazed] }),
  ],
  groin: [
    wound(1, 'Everyone winces', 'Out. Gain 1 Stress.', { stress: 1 }),
    wound(2, 'Doubled over', 'Out. Lose the next Movement Stage.', { effects: [loseMovement] }),
    wound(3, 'Down', 'Out. Knocked down.', { effects: [knockedDown] }),
    wound(4, 'Down and out', 'Out. Knocked down. Dazed.', { effects: [knockedDown, dazed] }),
    wound(5, 'Down and out', 'Out. Knocked down. Dazed. Gain 1 Stress.',
      { trauma: 1, stress: 1, effects: [knockedDown, dazed] }),
    wound(6, 'Nobody will forget this', 'Out. Knocked down. Dazed. Gain 2 Stress.',
      { trauma: 1, stress: 2, effects: [knockedDown, dazed] }),
  ],
  arms: [
    wound(1, 'Brushed the sleeve', 'Out, though you swear it missed. Gain 1 Stress.', { stress: 1 }),
    wound(2, 'Thwack', 'Out.'),
    wound(3, 'Stinging arm', 'Out. Next roll with that arm at Disadvantage.',
      { effects: [label('Stinging arm', 'Next roll with that arm at Disadvantage.', 'Next roll with that arm')] }),
    wound(4, 'Knocked loose', 'Out. Whatever that hand holds is dropped.',
      { effects: [label('Knocked loose', 'Whatever that hand holds is dropped.')] }),
    wound(5, 'Dead arm', 'Out. Rolls with that arm at Disadvantage for the rest of the scene.',
      { effects: [label('Dead arm', 'Rolls with that arm at Disadvantage for the rest of the scene.', 'Rest of the scene')] }),
    wound(6, 'Dead arm', 'Out. Rolls with that arm at Disadvantage for the rest of the scene. Gain 1 Stress.',
      { stress: 1, effects: [label('Dead arm', 'Rolls with that arm at Disadvantage for the rest of the scene.', 'Rest of the scene')] }),
  ],
  hand: [
    handleCheck(1, 'Caught it!', 'Handle Check: success, the thrower is out instead and you stay in. Failure: out.', 'normal'),
    handleCheck(2, 'Fumbled catch', 'Handle Check at Disadvantage to hold on: success, the thrower is out instead. Failure: out.', 'disadvantage'),
    wound(3, 'Jammed finger', 'Out. Next roll with that hand at Disadvantage.',
      { effects: [label('Jammed finger', 'Next roll with that hand at Disadvantage.', 'Next roll with that hand')] }),
    wound(4, 'Bent-back fingers', 'Out. Rolls with that hand at Disadvantage until a Long Rest.',
      { effects: [label('Bent-back fingers', 'Rolls with that hand at Disadvantage until a Long Rest.', 'Until a Long Rest')] }),
    wound(5, 'Bent-back fingers', 'Out. Rolls with that hand at Disadvantage until a Long Rest. Gain 1 Stress.',
      { stress: 1, effects: [label('Bent-back fingers', 'Rolls with that hand at Disadvantage until a Long Rest.', 'Until a Long Rest')] }),
    wound(6, 'Sprained wrist', 'Out. Hand / wrist injury: -20 Handle (dominant) or -10 (other) on actions with that hand.',
      { trauma: 1, effects: [sprainedWrist] }),
  ],
  legs: [
    wound(1, 'Tagged at the ankle', 'Out.'),
    wound(2, 'Clipped', 'Out. Lose the next Movement Stage.', { effects: [loseMovement] }),
    wound(3, 'Charley horse', 'Out. Next Speed Check at Disadvantage.',
      { effects: [label('Charley horse', 'Next Speed Check at Disadvantage.', 'Next Speed Check')] }),
    wound(4, 'Legs taken out', 'Out. Knocked down.', { effects: [knockedDown] }),
    wound(5, 'Tripped flat', 'Out. Knocked down. Gain 1 Stress.', { stress: 1, effects: [knockedDown] }),
    wound(6, 'Dead leg', 'Out. Speed Checks at Disadvantage for the rest of the scene.',
      { effects: [label('Dead leg', 'Speed Checks at Disadvantage for the rest of the scene.', 'Rest of the scene')] }),
  ],
}

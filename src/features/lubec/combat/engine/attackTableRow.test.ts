import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { lubecEffectWound } from '../../../ruleSets/lubec/woundCards'
import { readTableRow, tableChecked } from './attackTableRow'
import { combatEntropy, type CombatEntropy } from './commandEntropy'
import { RAN } from './declare'
import { publicCombatant } from './inputs'
import type { CombatAttack, CombatCommand, CombatFight, CombatSheet, CombatWoundRow } from './types'

const HERO = 'character:hero'
const ROY = 'npc:roy'
const sheet = (kind: 'character' | 'npc', sheetId: string, name: string): CombatSheet =>
  ({ kind, sheetId, name, ownerUserId: kind === 'npc' ? 'gm' : 'player', portraitPath: '', sheet: lubecCharacterSheet() })
const roy = sheet('npc', 'roy', 'Roy')
const command: CombatCommand = {
  envelope: { id: 'c', groupId: 'g', campaignId: 'x', fightId: 'fight', round: 1, phase: 'attack', stageInstanceId: 's', actorKey: ROY, interactionSequence: 0 },
  seed: 'seed', payload: { type: 'check' },
}

function fight(): CombatFight {
  const combatants = [publicCombatant(sheet('character', 'hero', 'Wayne')), publicCombatant(roy)]
  return { status: 'live', participantUserIds: ['player'], state: { round: 1, phase: 'attack', stageInstanceId: 's', combatants, floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [] } }
}

/** A punch or swing that has its Impact at `part`, ready for its table. */
const hit = (table: string, part: string, total: number): CombatAttack => ({
  id: 'a', grantId: null, attackerKey: HERO, step: 'strength', detached: [], closed: false,
  aim: { targetKey: ROY } as CombatAttack['aim'], frozen: { choice: { name: 'Punch' } } as CombatAttack['frozen'],
  landing: { table: 'punch', startRoll: 1, sideRoll: null, start: part, part, moved: 0 },
  impact: { quality: total, base: 0, strength: null, moved: 0, armor: 0, total, table },
})

/** Command-bound entropy with each die scripted by what it is for; an unscripted die rolls as ever. */
function dice(script: Record<string, number[]>): CombatEntropy {
  const real = combatEntropy(command)
  const queues = Object.fromEntries(Object.entries(script).map(([key, values]) => [key, [...values]]))
  return { ...real, die: (purpose: string, sides: number) => queues[purpose]?.shift() ?? real.die(purpose, sides) }
}

/** Roy's Body is 31 and Handle 55: 10 passes either, 99 fails either. */
const landed = (table: string, part: string, impact: number, script: Record<string, number[]> = {}, target: CombatSheet = roy) => {
  const asked = readTableRow(fight(), hit(table, part, impact), dice(script))
  if (asked.state.attack?.step !== 'check') return { fight: asked, logs: [] }
  const plan = tableChecked(asked, asked.state.attack, target, command, dice(script))
  return { fight: plan.fight, logs: plan.logs }
}
const outboxOf = (done: { fight: CombatFight }) => done.fight.state.woundOutbox[0]
const attackOf = (done: { fight: CombatFight }) => done.fight.state.attack!

describe('a final Fisticuffs concussion', () => {
  it('waits on the target to roll Body before anything lands', () => {
    const waiting = readTableRow(fight(), hit('fisticuffs', 'head', 7), combatEntropy(command))
    expect(waiting.state.attack).toMatchObject({ step: 'check', row: { table: 'fisticuffs', name: 'Minor Concussion', final: true, check: { kind: 'save', against: 'Body', advantage: 'normal' } } })
    expect(waiting.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'save' }])
    expect(waiting.state.woundOutbox).toEqual([])
  })

  it('Minor success: Dazed only, Trauma 0, no Stress', () => {
    const done = landed('fisticuffs', 'head', 7, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 0, stressDelta: 0 })
    expect(outboxOf(done).effects!.map((card) => card.cardKey)).toEqual(['dazed'])
    expect(attackOf(done)).toMatchObject({ outcome: 'wounded', rowTrauma: 0, checks: [{ purpose: 'concussion', success: true, stress: 0 }] })
    expect(done.logs[0].event).toBe('Roy rolled a Body Save.')
  })

  it('Knocked unconscious: Results add only the dice the table leaves to the moment', () => {
    const done = landed('fisticuffs', 'head', 9, { unconscious: [7, 4], 'minimum-stress': [3] })
    expect(attackOf(done).rowSections).toEqual([{ label: 'Rolled', items: ['Unconscious 2d10 minutes: 7 + 4 = 11', 'Minimum Stress 1d5: 3'] }])
  })

  it('Rocked: the table\'s words say it all, so Results add nothing of their own', () => {
    expect(attackOf(landed('fisticuffs', 'head', 1)).rowSections).toEqual([])
  })

  it('Minor failure: Dazed and -10 Handle until one Long Rest, +1 Trauma and the Save\'s +1 Stress once', () => {
    const done = landed('fisticuffs', 'head', 7, { check: [99] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 1 })
    expect(outboxOf(done).effects!.map((card) => [card.cardKey, card.steps])).toEqual([
      ['dazed', [expect.objectContaining({ until: 'rounds' })]],
      ['concussion', [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }]],
    ])
  })

  it('Severe success: a Minor Concussion with -10 Handle and +1 Trauma', () => {
    const done = landed('fisticuffs', 'head', 8, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 0 })
    expect(outboxOf(done).effects!.find((card) => card.cardKey === 'concussion')!.steps).toEqual([{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }])
  })

  it('Severe failure: -30 Handle, then -10 after one rest, then lasting -10 Intellect after the second, +2 Trauma', () => {
    const done = landed('fisticuffs', 'head', 8, { check: [99] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 2, stressDelta: 1 })
    const concussion = outboxOf(done).effects!.find((card) => card.cardKey === 'concussion')!
    expect(concussion.steps.map((step) => [step.until, step.modifiers])).toEqual([
      ['long-rest', [{ target: 'Handle', amount: -30 }]],
      ['long-rest', [{ target: 'Handle', amount: -10 }]],
      ['lasting', [{ target: 'Intellect', amount: -10 }]],
    ])
    expect(attackOf(done).rowSections).toEqual([])
  })
})

describe('Catch their fist', () => {
  it('a caught fist gives the printed Advantage card and nothing else', () => {
    const asked = readTableRow(fight(), hit('fisticuffs', 'hand-R', 1), combatEntropy(command))
    expect(asked.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'check' }])
    const done = landed('fisticuffs', 'hand-R', 1, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 0, stressDelta: 0 })
    expect(outboxOf(done).effects).toMatchObject([{ cardKey: 'caught', steps: [{ until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'advantage' }] }] }])
  })

  it('a missed catch gives no wound and no Stress', () => {
    const done = landed('fisticuffs', 'hand-R', 1, { check: [99] })
    expect(done.fight.state.woundOutbox).toEqual([])
    expect(attackOf(done)).toMatchObject({ outcome: 'no-wound', closed: true, rowTrauma: 0, rowStress: 0, checks: [{ purpose: 'fist-catch', success: false, stress: 0 }] })
  })
})

describe('a knock-out', () => {
  it('rolls 2d10 minutes and 1d5 Minimum Stress once, keeps the dice, and never puts the target Out', () => {
    const done = landed('fisticuffs', 'head', 9, { unconscious: [4, 9], 'minimum-stress': [3] })
    expect(done.fight.state.combatants.find((entry) => entry.key === ROY)!.outReason).toBeNull()
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 2, stressDelta: 0, minimumStressDelta: 3 })
    const card = outboxOf(done).effects![0]
    expect(card).toMatchObject({ cardKey: 'unconscious', steps: [{ until: 'by-hand', labels: ['Clear by hand: 2d10 = 4 + 9 = 13 minutes', 'On waking: Severe Concussion Body Save at Disadvantage'] }] })
    expect(lubecEffectWound(card)).toMatchObject({ dice: { 'Unconscious 2d10 minutes': [4, 9], 'Minimum Stress 1d5': [3] }, minimumStress: 3, trauma: 2 })
  })
})

describe('a final row that lands at once', () => {
  it('keeps separately recovering schedules on separate linked cards', () => {
    const done = landed('fisticuffs', 'shin-L', 8)
    expect(outboxOf(done).effects!.map((card) => [card.cardKey, card.part, card.steps.map((step) => step.until)])).toEqual([
      ['down', 'Knocked down', ['combat-end']],
      ['leg', 'Leg', ['long-rest', 'lasting']],
      ['evasive', 'No Evasive Movement', ['treated']],
    ])
  })

  it('makes discretionary Charm a reminder, never a Charm change', () => {
    const jaw = outboxOf(landed('fisticuffs', 'head', 5)).effects!.find((card) => card.cardKey === 'jaw')!
    expect(jaw.steps[1]).toEqual({ modifiers: [], labels: ['Missing teeth or visibly altered jaw'], until: 'lasting', charmReminder: true })
  })

  it('names the wound and keeps a paired part\'s side', () => {
    const done = landed('fisticuffs', 'thigh-L', 4)
    expect(attackOf(done).row).toMatchObject({ name: 'Legs kicked out', group: 'thigh', final: true })
    expect(outboxOf(done).effects![0]).toMatchObject({ cause: 'Fisticuffs, left thigh, Impact 4: Minor Legs kicked out', struckLocation: 'thigh-L' })
  })

  it('says an Immediate Death Save is the GM\'s to resolve', () => {
    expect(attackOf(landed('fisticuffs', 'head', 10))).toMatchObject({ rowTrauma: 4, rowSections: [] })
  })

  it('reads a final Thrown concussion with the shared Body Save', () => {
    const asked = readTableRow(fight(), hit('thrown', 'head', 2), combatEntropy(command))
    expect(asked.state.attack!.row).toMatchObject({ name: 'Rock to the head', check: { kind: 'save' } })
    expect(asked.state.attack!.row!.final).toBe(true)
  })
})

describe('a final Cutting wound with a countdown', () => {
  it('makes one landing Body Save: success prevents the timer and runs none', () => {
    const done = landed('cutting', 'neck', 3, { check: [10] })
    expect(attackOf(done).checks).toMatchObject([{ purpose: 'prevention', success: true, stress: 0 }])
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 0, effects: [] })
    expect(attackOf(done).rowSections).toEqual([])
  })

  it('failure adds the Save\'s Stress once and rolls the d4 once, keeping it on a bleeding card', () => {
    const done = landed('cutting', 'neck', 3, { check: [99], 'timer-bleed': [3] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 1 })
    const bleed = outboxOf(done).effects![0]
    expect(bleed).toMatchObject({ cardKey: 'bleed', part: 'Bleeding', countdown: { kind: 'bleed', rounds: 3 }, steps: [{ until: 'rounds', labels: ['+1 Trauma in d4 = 3 rounds'] }] })
    expect(lubecEffectWound(bleed)!.dice).toEqual({ 'Bleeding d4': [3] })
  })

  it('a Critical countdown keeps its own d4', () => {
    const done = landed('cutting', 'thigh-L', 8, { check: [99], 'timer-critical': [1] })
    expect(outboxOf(done).effects!.map((card) => [card.cardKey, card.countdown])).toEqual([['action', undefined], ['critical', { kind: 'critical', rounds: 1 }]])
  })
})

describe('final Cutting lasting amounts', () => {
  it('rolls 1d5 fingers once, records them at once, and holds -5 Handle per finger for the last step', () => {
    const done = landed('cutting', 'hand-L', 6, { check: [10], fingers: [3] })
    const [fingers, hand] = outboxOf(done).effects!
    expect(fingers).toMatchObject({ cardKey: 'fingers', steps: [{ until: 'lasting', labels: ['3 fingers lost from the left hand'] }] })
    expect(hand.steps.map((step) => [step.until, step.modifiers, step.setTo])).toEqual([
      ['long-rest', [], [{ target: 'Handle', value: 10 }]],
      ['long-rest', [{ target: 'Handle', amount: -20 }], undefined],
      ['lasting', [{ target: 'Handle', amount: -15 }], undefined],
    ])
    expect(lubecEffectWound(hand)!.dice).toMatchObject({ 'Fingers 1d5': [3] })
  })

  it('rolls a lasting -1d10 Body and -1d20 Handle once when the wound lands', () => {
    const back = landed('cutting', 'torso', 7, { check: [10], 'amount-body-2-Body': [7] })
    expect(outboxOf(back).effects!.find((card) => card.cardKey === 'body')!.steps[2]).toMatchObject({ until: 'lasting', modifiers: [{ target: 'Body', amount: -7 }] })
    const shoulder = landed('cutting', 'upperarm-R', 7, { check: [10], 'amount-arm-2-Handle': [13] })
    const arm = outboxOf(shoulder).effects!.find((card) => card.cardKey === 'arm')!
    expect(arm.steps[2]).toMatchObject({ until: 'lasting', modifiers: [{ target: 'Handle', amount: -13 }], labels: ['Cut muscle'] })
    expect(arm.steps[0]).toMatchObject({ restrictions: [{ kind: 'arm-unusable', side: 'R' }] })
  })

  it('applies an "if survived" lasting loss at once, with no survival gate', () => {
    const done = landed('cutting', 'waist', 8, { check: [10] })
    expect(outboxOf(done).effects!.map((card) => [card.cardKey, card.steps[0].until, card.steps[0].modifiers])).toEqual([
      ['dazed', 'rounds', []],
      ['lasting', 'lasting', [{ target: 'Body', amount: -10 }]],
    ])
  })

  it('keeps the windpipe\'s later Body Save as a visible step resolved by hand', () => {
    const speech = outboxOf(landed('cutting', 'neck', 5, { check: [10] })).effects!.find((card) => card.cardKey === 'speech')!
    expect(speech.steps[1]).toMatchObject({ until: 'by-hand', onReach: { save: 'Body', failure: 'Speech damaged' } })
  })
})

describe('final Piercing', () => {
  it.each([[1, 'Stab stopped by a rib', 'ribs'], [2, 'Point lodged', 'lodged']] as const)('rolls the d2 once and keeps only branch %i\'s cards and dice', (pick, name, key) => {
    const done = landed('piercing', 'torso', 4, { 'wound-choice': [pick] })
    expect(attackOf(done).row).toMatchObject({ name, choice: pick, final: true })
    const cards = outboxOf(done).effects!
    expect(cards.map((card) => card.cardKey)).toEqual([key])
    expect(lubecEffectWound(cards[0])).toMatchObject({ row: name, branch: pick, dice: { d2: [pick] } })
  })

  it('stops a bleed and a Critical countdown with one Save, keeping a d4 for each, and rolls no Save for 1d4 Dazed', () => {
    const done = landed('piercing', 'thigh-L', 8, { check: [99], 'timer-bleed': [2], 'timer-critical': [4] })
    expect(attackOf(done).checks).toHaveLength(1)
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 2, stressDelta: 1 })
    expect(outboxOf(done).effects!.filter((card) => card.countdown).map((card) => card.countdown)).toEqual([{ kind: 'bleed', rounds: 2 }, { kind: 'critical', rounds: 4 }])
    const temple = landed('piercing', 'head', 8, { check: [10], dazed: [3] })
    expect(attackOf(temple).checks!.map((check) => check.purpose)).toEqual(['prevention'])
    expect(outboxOf(temple).effects!.map((card) => card.cardKey)).toEqual(['dazed', 'lasting'])
    expect(outboxOf(temple).effects![0].steps[0].labels).toEqual(['Action + Defense lost in rounds 1, 2, 3; Movement lost in rounds 2, 3, 4 (1d4 = 3)'])
  })

  it('records a lost eye as a lasting card from the moment it lands', () => {
    const cards = outboxOf(landed('piercing', 'head', 9, { check: [10] })).effects!
    expect(cards.find((card) => card.cardKey === 'eye')!.steps).toMatchObject([{ until: 'lasting', labels: ['Lost eye; the eye remains lost'], taskModifiers: [{ target: 'Handle', amount: -10, task: 'ranged-visual' }] }])
  })
})

describe('final Gunshot head wounds', () => {
  const concussionOf = (done: ReturnType<typeof landed>) => outboxOf(done).effects!.find((card) => card.cardKey === 'concussion')!

  it('Head 3 success follows the terms: Dazed, -10 Handle until one rest and +1 Trauma, with no Intellect penalty', () => {
    const done = landed('gunshot', 'head', 3, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 0 })
    expect(concussionOf(done).steps).toEqual([{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }])
  })

  it('Head 4 rolls the concussion Save and the countdown Save apart, keeps +2 Trauma and charges each failure\'s Stress once', () => {
    const done = landed('gunshot', 'head', 4, { check: [10, 99], 'timer-critical': [2] })
    expect(attackOf(done).checks!.map((check) => [check.purpose, check.success, check.stress])).toEqual([['concussion', true, 0], ['prevention', false, 1]])
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 2, stressDelta: 1, minimumStressDelta: 4 })
    const failed = landed('gunshot', 'head', 4, { check: [99, 99] })
    expect(outboxOf(failed)).toMatchObject({ traumaDelta: 2, stressDelta: 2, minimumStressDelta: 4 })
    const intellect = outboxOf(failed).effects!.flatMap((card) => card.steps.flatMap((step) => step.modifiers)).filter((modifier) => modifier.target === 'Intellect')
    expect(intellect).toEqual([{ target: 'Intellect', amount: -10 }])
  })

  it('Head 5 keeps +4 Trauma, asks for the Immediate Death Save, and takes -20 Intellect as the whole lasting loss', () => {
    const done = landed('gunshot', 'head', 5, { check: [99] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 4, stressDelta: 1, minimumStressDelta: 8 })
    expect(attackOf(done).rowSections).toEqual([])
    const intellect = outboxOf(done).effects!.flatMap((card) => card.steps.flatMap((step) => step.modifiers)).filter((modifier) => modifier.target === 'Intellect')
    expect(intellect).toEqual([{ target: 'Intellect', amount: -20 }])
  })
})

describe('final Gunshot branches and fingers', () => {
  it('a torso flesh wound bleeds only on a d2 of 2', () => {
    const one = landed('gunshot', 'torso', 2, { 'wound-choice': [1] })
    expect(attackOf(one).checks).toEqual([])
    expect(outboxOf(one).effects!.map((card) => card.cardKey)).toEqual(['body'])
    const two = landed('gunshot', 'torso', 2, { 'wound-choice': [2], check: [99], 'timer-bleed': [1] })
    expect(attackOf(two).row).toMatchObject({ name: 'Flesh wound', choice: 2 })
    expect(outboxOf(two).effects!.map((card) => card.cardKey)).toEqual(['bleed', 'body'])
  })

  it('a thigh wound near the hip or knee picks a knockdown or a bleed', () => {
    expect(outboxOf(landed('gunshot', 'thigh-L', 3, { 'wound-choice': [1] })).effects!.map((card) => card.cardKey)).toEqual(['down', 'leg'])
    expect(outboxOf(landed('gunshot', 'thigh-L', 3, { 'wound-choice': [2], check: [99], 'timer-bleed': [4] })).effects!.map((card) => card.cardKey)).toEqual(['movement', 'bleed', 'leg'])
  })

  it('Hand 3\'s finger shot off loses one finger, lasting -5 Handle after one rest', () => {
    const cards = outboxOf(landed('gunshot', 'hand-R', 3, { 'wound-choice': [2] })).effects!
    expect(cards.find((card) => card.cardKey === 'fingers')!.steps[0].labels).toEqual(['1 finger lost from the right hand'])
    expect(cards.find((card) => card.cardKey === 'finger')!.steps.map((step) => [step.until, step.modifiers])).toEqual([['long-rest', []], ['lasting', [{ target: 'Handle', amount: -5 }]]])
  })

  it('Hand 4 rolls 1d3 fingers once: -30 Handle after one rest, then lasting -10 and -5 a finger', () => {
    const hand = outboxOf(landed('gunshot', 'hand-L', 4, { fingers: [2] })).effects!.find((card) => card.cardKey === 'hand')!
    expect(hand.steps.map((step) => step.modifiers)).toEqual([[], [{ target: 'Handle', amount: -30 }], [{ target: 'Handle', amount: -20 }]])
  })
})

describe('a countdown that lands', () => {
  it('watches the target through the round it falls due, and lists it for that round\'s log', () => {
    const done = landed('cutting', 'neck', 3, { check: [99], 'timer-bleed': [1] })
    expect(done.fight.state).toMatchObject({ roundWatch: { [ROY]: 2 }, countdowns: [{ key: ROY, wound: 'Bleeding cut', kind: 'bleed', dueRound: 2 }] })
  })
})


it('knockdown only stops an Action that has not opened, preserving earlier rolls', () => {
  for (const acted of [false, true]) {
    const current = fight()
    current.state.round = 3
    current.state.attacked = acted ? [ROY] : []
    const landed = readTableRow(current, hit('fisticuffs', 'shin-L', 8), dice({}))
    expect(landed.state.lost?.[ROY]?.action ?? []).toEqual(acted ? [] : [3])
    expect(landed.state.combatants[1].outReason).toBeNull()
    expect(landed.state.woundOutbox[0].effects!.find((card) => card.cardKey === 'down')).toMatchObject({ steps: [{ until: 'combat-end', restrictions: [{ kind: 'down' }] }] })
  }
})

it('takes this round\'s Action from a target whose own attack turn has not opened, even under Full Defense or after a Run', () => {
  for (const declaration of [RAN, { ...RAN, ran: false, full: true }, null]) {
    const current = fight()
    current.state.round = 3
    current.state.combatants[1].declaration = declaration
    const landed = readTableRow(current, hit('fisticuffs', 'shin-L', 8), dice({}))
    expect(landed.state.lost?.[ROY]?.action).toEqual([3])
  }
})


it('marks only Head 9 for a waking Save and leaves unconscious targets in combat', () => {
  const head = landed('fisticuffs', 'head', 9, { unconscious: [4, 9], 'minimum-stress': [3] })
  expect(outboxOf(head).effects![0]).toMatchObject({ wakeSave: 'severe-concussion' })
  expect(head.fight.state.combatants[1]).toMatchObject({ unconscious: true, outReason: null })
  const neck = landed('fisticuffs', 'neck', 9, { unconscious: [4, 9], 'minimum-stress': [3] })
  expect(outboxOf(neck).effects![0].wakeSave).toBeUndefined()
})


it('keeps a final Thrown Catastrophic target in the fight rather than automatically Out', () => {
  const done = landed('thrown', 'head', 10, { check: [99] })
  expect(done.fight.state.combatants[1].outReason).toBeNull()
})

/** Roy holding things: a knife in the right hand and a lantern in the left, or one two-handed spear. */
const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'thing', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const holding = (...items: ReturnType<typeof inHand>[]): CombatSheet =>
  ({ ...roy, sheet: lubecCharacterSheet({ gear: { ...lubecCharacterSheet().gear, items: items as never } }) })
const knifeAndLantern = holding(inHand('knife', 'Knife', 1), inHand('lantern', 'Lantern', 0))

describe('a drop from the struck hand', () => {
  it('drops automatically: no roll, and the wound carries the struck hand to the sheet', () => {
    const done = landed('fisticuffs', 'forearm-R', 6)
    expect(attackOf(done).checks).toEqual([])
    expect(outboxOf(done)).toMatchObject({ drop: { hand: 'right' }, stressDelta: 0, traumaDelta: 1 })
    expect(attackOf(done)).toMatchObject({ woundId: outboxOf(done).id })
    expect(attackOf(done).rowSections![0]).toEqual({ label: 'Struck hand', items: ['Whatever the right hand holds drops onto the Floor'] })
    expect(lubecEffectWound(outboxOf(done).effects![0])!.drop).toEqual({ hand: 'right' })
  })

  it('reads the left hand from a left part', () => {
    expect(outboxOf(landed('fisticuffs', 'forearm-L', 6)).drop).toEqual({ hand: 'left' })
  })

  it('asks the target for a Handle Check to keep hold', () => {
    const asked = readTableRow(fight(), hit('fisticuffs', 'hand-R', 2), combatEntropy(command))
    expect(asked.state.attack).toMatchObject({ step: 'check', row: { rolls: [{ purpose: 'retention', kind: 'stat-check', against: 'Handle', advantage: 'normal' }] } })
    expect(asked.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'check' }])
  })

  it('keeps hold on a success: nothing drops and no Stress', () => {
    const done = landed('fisticuffs', 'hand-R', 2, { check: [10] }, knifeAndLantern)
    expect(attackOf(done)).toMatchObject({ rowStress: 0, checks: [{ purpose: 'retention', success: true, stress: 0 }] })
    expect(outboxOf(done).drop).toBeUndefined()
    expect(attackOf(done).rowSections).toEqual([{ label: 'Struck hand', items: ['Kept hold of the Knife in the right hand'] }])
  })

  it('drops on a failure, with the ordinary failed-Check Stress once', () => {
    const done = landed('fisticuffs', 'hand-L', 2, { check: [99] }, knifeAndLantern)
    expect(attackOf(done).checks).toMatchObject([{ purpose: 'retention', success: false, stress: 1 }])
    expect(outboxOf(done)).toMatchObject({ stressDelta: 1, drop: { hand: 'left', kept: false, held: 'Lantern' } })
    expect(attackOf(done).rowSections).toEqual([{ label: 'Struck hand', items: ['The Lantern drops from the left hand onto the Floor'] }])
    expect(done.logs[0].event).toBe('Roy rolled a Handle Check.')
  })

  it('rolls nothing for an empty hand: no Check, no Stress, nothing to drop', () => {
    const done = landed('fisticuffs', 'hand-R', 2, { check: [99] }, holding(inHand('lantern', 'Lantern', 0)))
    expect(attackOf(done)).toMatchObject({ rowStress: 0, checks: [] })
    expect(outboxOf(done).drop).toBeUndefined()
    expect(attackOf(done).rowSections).toEqual([{ label: 'Struck hand', items: ['The right hand held nothing to drop'] }])
  })

  it('holds a two-handed thing in the struck hand, whichever side', () => {
    const spear = holding(inHand('spear', 'Spear', 0, { size: 2 }))
    expect(outboxOf(landed('fisticuffs', 'hand-R', 2, { check: [99] }, spear)).drop).toMatchObject({ hand: 'right', held: 'Spear' })
  })

  it('rolls the retention Check against the sheet before this wound: its own Disadvantage does not apply, an earlier card does', () => {
    // Piercing upper arm 3: "Handle rolls at Disadvantage until the end of the next round. Whatever that hand holds is dropped unless a Handle Check succeeds."
    const own = landed('piercing', 'upperarm-R', 3, { check: [10] }, knifeAndLantern)
    expect(attackOf(own).checks).toMatchObject([{ purpose: 'retention', advantage: 'normal', dice: [10] }])
    const old = { id: 'old', name: 'Old wound', cause: '', steps: [{ modifiers: [], labels: [], until: 'long-rest', rolls: [{ scope: 'handle', mode: 'disadvantage' }] } as never] }
    const shaky = { ...knifeAndLantern, sheet: { ...knifeAndLantern.sheet, effects: [old] } }
    const earlier = landed('piercing', 'upperarm-R', 3, { check: [10, 99] }, shaky)
    expect(attackOf(earlier).checks).toMatchObject([{ purpose: 'retention', advantage: 'disadvantage', dice: [10, 99], success: false }])
    expect(outboxOf(earlier).drop).toMatchObject({ hand: 'right', held: 'Knife', kept: false })
  })

  it('names the item on an automatic drop when the target\'s own roll read the sheet', () => {
    // Piercing hand 6: an automatic drop with a prevention Body Save.
    const done = landed('piercing', 'hand-R', 6, { check: [10] }, knifeAndLantern)
    expect(outboxOf(done).drop).toEqual({ hand: 'right', held: 'Knife' })
    expect(attackOf(done).rowSections![0].items).toContain('The Knife drops from the right hand onto the Floor')
  })
})

describe('knocked out of striking reach', () => {
  it('remembers the hit for the attacker\'s next melee aim at the target, and never puts the target out', () => {
    const done = landed('fisticuffs', 'torso', 1)
    expect(done.fight.state.outOfReach).toEqual([{ attackerKey: HERO, targetKey: ROY, round: 1 }])
    expect(done.fight.state.combatants.find((entry) => entry.key === ROY)!.outReason).toBeNull()
    expect(attackOf(done).rowSections).toEqual([])
  })
})

describe('the final Thrown table through landing and sheet cards', () => {
  it.each([[2, 10, 0, 0], [2, 99, 1, 1], [5, 10, 1, 0], [5, 99, 2, 1]])('Head %s, Save %s charges the settled concussion Trauma and Stress once', (impact, check, traumaDelta, stressDelta) => {
    const done = landed('thrown', 'head', impact, { check: [check] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta, stressDelta })
    expect(outboxOf(done).effects!.filter((card) => card.cardKey === 'dazed')).toHaveLength(1)
    const concussion = outboxOf(done).effects!.find((card) => card.cardKey === 'concussion')
    if (impact === 5 && check === 99) expect(concussion!.steps.map((step) => step.modifiers)).toEqual([[{ target: 'Handle', amount: -30 }], [{ target: 'Handle', amount: -10 }], [{ target: 'Intellect', amount: -10 }]])
  })

  it('records a Catastrophic d4 Dazed and lasting aftermath without making the target Out', () => {
    const done = landed('thrown', 'head', 6, { dazed: [3] })
    const wound = outboxOf(done)
    expect(wound).toMatchObject({ traumaDelta: 4, immediateDeathSave: 'Skull fracture' })
    expect(wound.effects!.find((card) => card.cardKey === 'dazed')!.lost).toEqual({ movement: [2, 3, 4], action: [1, 2, 3] })
    expect(lubecEffectWound(wound.effects![0])!.dice).toMatchObject({ 'Dazed 1d4': [3] })
    expect(wound.effects!.find((card) => card.cardKey === 'body')!.steps).toMatchObject([
      { until: 'long-rest', rolls: [{ scope: 'physical', mode: 'disadvantage' }] },
      { until: 'long-rest' },
      { until: 'lasting', modifiers: [{ target: 'Body', amount: -20 }, { target: 'Intellect', amount: -10 }], minimumStress: 4 },
    ])
    expect(done.fight.state.combatants[1].outReason).toBeNull()
  })

  it('keeps the slow bleed manual, with no invented landing Save or d4 timer', () => {
    const done = landed('thrown', 'waist', 6)
    expect(attackOf(done).checks ?? []).toEqual([])
    const cards = outboxOf(done).effects!
    expect(cards.find((card) => card.cardKey === 'slow-bleed')!).toMatchObject({ steps: [{ until: 'treated', labels: ['+1 Trauma every 30 minutes until Basic First Aid; add it with the Trauma counter'] }] })
    expect(cards.every((card) => !card.countdown)).toBe(true)
  })

  it('drops a dislocated shoulder item, unlike Blunt Force, and recovers to its lasting Handle loss', () => {
    const thrown = outboxOf(landed('thrown', 'upperarm-R', 5, {}, knifeAndLantern))
    const blunt = outboxOf(landed('blunt', 'upperarm-R', 5, {}, knifeAndLantern))
    expect(thrown.drop).toEqual({ hand: 'right' })
    expect(blunt.drop).toBeUndefined()
    expect(thrown.effects!.find((card) => card.cardKey === 'shoulder')!.steps).toMatchObject([
      { until: 'put-back', restrictions: [{ kind: 'arm-unusable', side: 'R' }] },
      { until: 'lasting', modifiers: [{ target: 'Handle', amount: -10 }] },
    ])
  })

  it('keeps the two-rest Thrown ribs schedule and visually precise scope distinct', () => {
    expect(outboxOf(landed('thrown', 'torso', 4)).effects![0].steps.map((step) => step.until)).toEqual(['long-rest', 'long-rest'])
    expect(outboxOf(landed('blunt', 'torso', 4)).effects![0].steps.map((step) => step.until)).toEqual(['long-rest'])
    const face = outboxOf(landed('thrown', 'head', 4)).effects!.find((card) => card.cardKey === 'face')!
    expect(face.steps).toMatchObject([{ rolls: [{ scope: { task: 'visually-precise' }, mode: 'disadvantage' }] }, { until: 'lasting', charmReminder: true, modifiers: [] }])
  })

  it('retains exactly the printed crushed-hand steps without adding a lost limb or extra drop Check', () => {
    const done = landed('thrown', 'hand-L', 6, {}, knifeAndLantern)
    expect(attackOf(done).checks ?? []).toEqual([])
    expect(outboxOf(done).drop).toEqual({ hand: 'left' })
    expect(outboxOf(done).effects![0].steps).toMatchObject([
      { until: 'long-rest', restrictions: [{ kind: 'no-two-handed' }], setTo: [{ target: 'Handle', value: 10 }] },
      { until: 'long-rest', modifiers: [{ target: 'Handle', amount: -40 }] },
      { until: 'lasting', modifiers: [{ target: 'Handle', amount: -10 }] },
    ])
  })
})

describe('a wound row saved before its table was final', () => {
  // A fight saved mid-Check while Blunt Force was still provisional keeps the row it read then;
  // the Check it waits on still lands that row's words, never the final table's cards.
  const saved = (fields: Partial<CombatWoundRow>) => {
    const row: CombatWoundRow = {
      group: 'forearm', impact: 4, name: 'Bruised forearm', text: 'Numb fingers for the fight.', injury: 'Stiff wrist',
      severity: 'Serious', trauma: 1, check: { kind: 'stat-check', against: 'Handle', advantage: 'normal' }, table: 'blunt', choice: null, out: false, ...fields,
    }
    const attack: CombatAttack = { ...hit('blunt', 'forearm-L', 4), step: 'check', row }
    const waiting = fight()
    waiting.state.attack = attack
    return tableChecked(waiting, attack, roy, command, dice({ check: [10] })).fight
  }

  it('lands its words and its lasting injury as one card, resolved by hand, with its Trauma', () => {
    const done = saved({})
    expect(outboxOf({ fight: done })).toMatchObject({ traumaDelta: 1, stressDelta: 0 })
    expect(outboxOf({ fight: done }).effect).toMatchObject({
      name: 'Bruised forearm', duration: null, struckLocation: 'forearm-L', cause: 'Blunt Force, left forearm, Impact 4: Serious Bruised forearm',
      steps: [{ modifiers: [], labels: ['Numb fingers for the fight.', 'Lasting injury: Stiff wrist'] }],
      source: { table: 'blunt', group: 'forearm', impact: 4, name: 'Bruised forearm', severity: 'Serious', injury: 'Stiff wrist' },
    })
    expect(attackOf({ fight: done })).toMatchObject({ outcome: 'wounded', rowOutcome: 'Numb fingers for the fight.', check: { success: true } })
  })

  it('lands under its name when it saved no words, and names no lasting injury it never had', () => {
    const card = outboxOf({ fight: saved({ text: '', injury: undefined }) }).effect!
    expect(card.steps).toEqual([{ modifiers: [], labels: ['Bruised forearm.'] }])
    expect(card.source).toMatchObject({ injury: null })
  })
})

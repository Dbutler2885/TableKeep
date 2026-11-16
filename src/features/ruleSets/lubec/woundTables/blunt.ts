import {
  ARM_UNUSABLE, brief, card, charmReminder, CRAWL, DAZED, DAZED_1D4, DEATH_SAVE, dis, DOWN, DROP, DROP_UNLESS, finalRow, handle, lasting,
  LOSE_ACTION, LOSE_MOVEMENT, MINOR_CONCUSSION, mod, NO_TWO_HANDS, outcome, OUT_OF_REACH, rests, SEVERE_CONCUSSION, slowBleed, speech, step,
} from './build'
import { lubecContentVersion } from './finalSources'
import type { LubecWoundOutcome, LubecWoundStepSpec } from './outcome'
import type { LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

// The final Blunt Force table (`final/blunt-force.md`), every row agreed. Each row's text is the file's prose; its
// outcome is how the app plays it under `terms.md`.

const V = lubecContentVersion('blunt-force.md')
type Extras = Parameters<typeof finalRow>[7]
const r = (impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string, what: LubecWoundOutcome, extras?: Extras): LubecWoundTableRow =>
  finalRow(V, impact, severity, trauma, name, text, what, extras)
const MORE = { orMore: true } as const

const once = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, brief(parts))
const fight = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, step('combat-end', parts))
const rest = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>, count = 1) => card(key, part, ...rests(count, parts))

/** "Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting ...", the Catastrophic aftermath. */
const catastrophic = (last: Omit<LubecWoundStepSpec, 'until'>) =>
  outcome([DEATH_SAVE, DOWN, DAZED_1D4], [card('body', 'Body', ...rests(2, { rolls: [dis('physical')] }), lasting(last))])

/** "Crawl only without help until 1 Long Rest. After that, walking is possible with Speed Checks at Disadvantage. After 2 Long Rests: walks with a limp." */
const brokenLeg = () => outcome([], [card('leg', 'Leg',
  step('long-rest', { restrictions: [CRAWL] }), step('long-rest', { rolls: [dis('speed')] }),
  lasting({ modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] }))])

export const LUBEC_BLUNT_TABLE: LubecWoundTable = {
  key: 'blunt',
  name: 'Blunt Force',
  locations: [
    {
      parts: ['head'],
      rows: [
        r(1, 'Minor', 0, 'Rocked', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Serious', 1, 'Eye / face injury', 'Dazed. `-20 Handle` on ranged and visually precise actions until 1 Long Rest. After 1 Long Rest: *Damaged vision*, lasting `-10 Handle` on ranged and visually precise actions.',
          outcome([DAZED], [card('eye', 'Eye', step('long-rest', { taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] }), lasting({ taskModifiers: [{ target: 'Handle', amount: -10, task: 'ranged-visual' }], labels: ['Damaged vision'] }))])),
        r(3, 'Serious', 1, 'Broken jaw or cheekbone', 'Lose the next Action Stage. Speech and eating badly impaired until 1 Long Rest. After 1 Long Rest: *Missing teeth or visibly altered jaw*, lasting `-10 Charm` at GM discretion.',
          outcome([LOSE_ACTION], [card('jaw', 'Jaw', step('long-rest', { restrictions: [speech('Speech and eating badly impaired')] }), charmReminder('Missing teeth or visibly altered jaw'))])),
        r(4, 'Serious', 1, 'Minor Concussion', 'Body Save. Failure: Dazed and `-10 Handle` until 1 Long Rest. Success: Dazed only; 0 Trauma instead of +1.', outcome([]), { concussion: MINOR_CONCUSSION }),
        r(5, 'Severe', 2, 'Severe Concussion', 'Body Save. Failure: Dazed and `-30 Handle`. After 1 Long Rest: `-10 Handle`. After 2 Long Rests: the Handle penalty clears; *Persistent concussion*, lasting `-10 Intellect`. Success: Minor Concussion—Dazed and `-10 Handle` until 1 Long Rest; +1 Trauma instead of +2.',
          outcome([]), { concussion: SEVERE_CONCUSSION }),
        r(6, 'Catastrophic', 4, 'Skull fracture', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body`, `-10 Intellect` and `+4 minimum Stress`.',
          catastrophic({ modifiers: [mod('Body', -20), mod('Intellect', -10)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ['neck'],
      rows: [
        r(1, 'Minor', 0, 'Clipped', 'Attacks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Off guard', { rolls: [dis('attacks')] })])),
        r(2, 'Serious', 1, 'Wrenched neck', '`-10 Handle` for the rest of combat.', outcome([], [fight('neck', 'Neck', { modifiers: [handle(-10)] })])),
        r(3, 'Serious', 1, 'Throat strike', 'Lose the next Action Stage, choking.', outcome([LOSE_ACTION])),
        r(4, 'Serious', 1, 'Bruised windpipe', 'Lose the next Action Stage. Speech badly impaired until 1 Long Rest.', outcome([LOSE_ACTION], [rest('throat', 'Throat', { restrictions: [speech('Speech badly impaired')] })])),
        r(5, 'Severe', 2, 'Fractured larynx', 'Unable to speak until 1 Long Rest; afterward, speech badly impaired until 2 Long Rests. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: *Permanently hoarse or altered voice*, lasting `-10 Charm`.',
          outcome([], [card('larynx', 'Larynx',
            step('long-rest', { restrictions: [speech('Unable to speak')], rolls: [dis('physical')] }),
            step('long-rest', { restrictions: [speech('Speech badly impaired')], rolls: [dis('physical')] }),
            lasting({ modifiers: [mod('Charm', -10)], labels: ['Permanently hoarse or altered voice'] }))])),
        r(6, 'Catastrophic', 4, 'Broken neck or crushed windpipe', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.',
          catastrophic({ modifiers: [mod('Body', -20)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ['torso'],
      rows: [
        r(1, 'Minor', 0, 'Driven back', 'Knocked out of striking reach; lose the next Movement Stage.', outcome([OUT_OF_REACH, LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Winded', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Winded', { rolls: [dis('physical')] })])),
        r(3, 'Serious', 1, 'Bruised ribs', 'Strength and Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('ribs', 'Ribs', { rolls: [dis('strength'), dis('speed')] })])),
        r(4, 'Serious', 1, 'Broken rib(s)', 'Physical Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('ribs', 'Ribs', { rolls: [dis('physical')] })])),
        r(5, 'Serious', 1, 'Broken rib(s)', 'Knocked down. Physical Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('ribs', 'Ribs', { rolls: [dis('physical')] })])),
        r(6, 'Severe', 2, 'Caved ribs', 'Knocked down. Physical Checks at Disadvantage until 2 Long Rests.', outcome([DOWN], [rest('ribs', 'Ribs', { rolls: [dis('physical')] }, 2)])),
        r(7, 'Catastrophic', 4, 'Crushed chest, stopped heart or broken upper back', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.',
          catastrophic({ modifiers: [mod('Body', -20)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ['waist'],
      rows: [
        r(1, 'Minor', 0, 'Doubled over', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Gut blow', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Gut', { rolls: [dis('physical')] })])),
        r(3, 'Serious', 1, 'Deep tissue bruising', 'Physical Checks at Disadvantage for the rest of combat.', outcome([], [fight('body', 'Body', { rolls: [dis('physical')] })])),
        r(4, 'Serious', 1, 'Deep tissue bruising', 'Physical Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('body', 'Body', { rolls: [dis('physical')] })])),
        r(5, 'Serious', 1, 'Kidney blow', 'Knocked down. Physical Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('body', 'Body', { rolls: [dis('physical')] })])),
        r(6, 'Severe', 2, 'Internal bleeding', 'Gain +1 Trauma every half-hour unless stabilized with Basic First Aid. Physical Checks at Disadvantage until 2 Long Rests.',
          outcome([], [slowBleed(), rest('body', 'Body', { rolls: [dis('physical')] }, 2)])),
        r(7, 'Catastrophic', 4, 'Ruptured liver or spleen, or broken lower spine', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.',
          catastrophic({ modifiers: [mod('Body', -20)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ['groin'],
      rows: [
        r(1, 'Minor', 0, 'Off line', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Flinch', 'Attacks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Off guard', { rolls: [dis('attacks')] })])),
        r(3, 'Serious', 1, 'Groin strike', 'Knocked down.', outcome([DOWN])),
        r(4, 'Serious', 1, 'Heavy groin strike', 'Knocked down. Speed Checks at Disadvantage for the rest of combat.', outcome([DOWN], [fight('groin', 'Groin', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Damaged hip', 'Knocked down. Speed Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('hip', 'Hip', { rolls: [dis('speed')] })])),
        r(6, 'Severe', 2, 'Broken pelvis', 'Crawl only without help; all physical Checks at Disadvantage. After 1 Long Rest: walking is possible, with all physical Checks still at Disadvantage. After 2 Long Rests: healed.',
          outcome([], [card('pelvis', 'Pelvis', step('long-rest', { restrictions: [CRAWL], rolls: [dis('physical')] }), step('long-rest', { rolls: [dis('physical')] }))]), MORE),
      ],
    },
    {
      parts: ['upperarm'],
      rows: [
        r(1, 'Minor', 0, 'Stinger', 'Attacks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Arm', { rolls: [dis('attacks')] })])),
        r(2, 'Minor', 0, 'Numb arm', 'Rolls at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Arm', { rolls: [dis('rolls')] })])),
        r(3, 'Serious', 1, 'Shoulder injury', '`-20 Handle` for the rest of combat.', outcome([], [fight('shoulder', 'Shoulder', { modifiers: [handle(-20)] })])),
        r(4, 'Serious', 1, 'Shoulder injury', '`-20 Handle` until 1 Long Rest.', outcome([], [rest('shoulder', 'Shoulder', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Dislocated shoulder', 'Arm unusable until the shoulder is put back in place; afterward, *Lingering shoulder injury*, lasting `-10 Handle`.',
          outcome([], [card('shoulder', 'Shoulder', step('put-back', { restrictions: [ARM_UNUSABLE] }), lasting({ modifiers: [handle(-10)], labels: ['Lingering shoulder injury'] }))])),
        r(6, 'Severe', 2, 'Broken upper arm or collarbone', 'Arm unusable. After 1 Long Rest: usable with `-20 Handle`. After 2 Long Rests: healed.',
          outcome([], [card('arm', 'Arm', step('long-rest', { restrictions: [ARM_UNUSABLE] }), step('long-rest', { modifiers: [handle(-20)] }))]), MORE),
      ],
    },
    {
      parts: ['forearm'],
      rows: [
        r(1, 'Minor', 0, 'Stinger', 'Attacks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Arm', { rolls: [dis('attacks')] })])),
        r(2, 'Minor', 0, 'Knocked loose', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(3, 'Serious', 1, 'Forearm injury', '`-20 Handle` for the rest of combat.', outcome([], [fight('injury', 'Forearm', { modifiers: [handle(-20)] })])),
        r(4, 'Serious', 1, 'Forearm injury', '`-20 Handle` until 1 Long Rest.', outcome([], [rest('injury', 'Forearm', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Sprained forearm', '`-30 Handle` until 1 Long Rest.', outcome([], [rest('injury', 'Forearm', { modifiers: [handle(-30)] })])),
        r(6, 'Severe', 2, 'Shattered forearm, bone through skin', 'Gain +1 Trauma every 30 minutes unless stabilized with Basic First Aid. Arm unusable until 1 Long Rest. After 1 Long Rest: arm usable; *Poorly recovered forearm*, lasting `-10 Handle`.',
          outcome([], [slowBleed(), card('arm', 'Arm', step('long-rest', { restrictions: [ARM_UNUSABLE] }), lasting({ modifiers: [handle(-10)], labels: ['Poorly recovered forearm'] }))]), MORE),
      ],
    },
    {
      parts: ['hand'],
      rows: [
        r(1, 'Minor', 0, 'Stung hand', 'Rolls at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Hand', { rolls: [dis('rolls')] })])),
        r(2, 'Minor', 0, 'Knocked loose', 'Whatever that hand holds is dropped.', outcome([DROP])),
        r(3, 'Serious', 1, 'Hand / wrist injury', 'Whatever that hand holds is dropped. `-20 Handle` for the rest of combat.', outcome([DROP], [fight('hand', 'Hand', { modifiers: [handle(-20)] })])),
        r(4, 'Serious', 1, 'Hand / wrist injury', 'Whatever that hand holds is dropped. `-20 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Fractured hand / wrist', 'Whatever that hand holds is dropped. `-40 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-40)] })])),
        r(6, 'Severe', 2, 'Crushed hand', 'Whatever that hand holds is dropped. Actions requiring two hands are impossible; Handle drops to 10. After 1 Long Rest: two-handed actions are possible again and the penalty becomes `-40 Handle`. After 2 Long Rests: *Lasting hand damage*, `-10 Handle`.',
          outcome([DROP], [card('hand', 'Hand',
            step('long-rest', { restrictions: [NO_TWO_HANDS], setTo: [{ target: 'Handle', value: 10 }] }),
            step('long-rest', { modifiers: [handle(-40)] }),
            lasting({ modifiers: [handle(-10)], labels: ['Lasting hand damage'] }))]), MORE),
      ],
    },
    {
      parts: ['thigh'],
      rows: [
        r(1, 'Minor', 0, 'Driven back', 'Knocked out of striking reach; lose the next Movement Stage.', outcome([OUT_OF_REACH, LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Dead leg', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Leg', { rolls: [dis('physical')] })])),
        r(3, 'Serious', 1, 'Deep thigh bruise', 'Speed Checks at Disadvantage for the rest of combat.', outcome([], [fight('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(4, 'Serious', 1, 'Deep thigh bruise', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Leg buckles', 'Knocked down. Speed Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(6, 'Severe', 2, 'Broken thighbone', 'Crawl only without help until 1 Long Rest. After that, walking is possible with Speed Checks at Disadvantage. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          brokenLeg(), MORE),
      ],
    },
    {
      parts: ['shin', 'feet'],
      rows: [
        r(1, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Barked shin / stamped foot', 'Speed Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Leg', { rolls: [dis('speed')] })])),
        r(3, 'Serious', 1, 'Swept', 'Knocked down.', outcome([DOWN])),
        r(4, 'Serious', 1, 'Knee / ankle injury', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Fractured or dislocated knee / ankle', 'Knocked down. Speed Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(6, 'Severe', 2, 'Shattered knee, shin or ankle', 'Crawl only without help until 1 Long Rest. After that, walking is possible with Speed Checks at Disadvantage. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          brokenLeg(), MORE),
      ],
    },
  ],
}

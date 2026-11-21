import {
  ARM_UNUSABLE, brief, card, charmReminder, CRAWL, DAZED, DAZED_1D4, DEATH_SAVE, dis, DOWN, DROP, DROP_UNLESS, finalRow, handle, lasting,
  LOSE_ACTION, LOSE_MOVEMENT, MINOR_CONCUSSION, mod, NO_TWO_HANDS, outcome, rests, SEVERE_CONCUSSION, slowBleed, speech, step, task,
} from './build'
import { lubecContentVersion } from './finalSources'
import type { LubecWoundOutcome, LubecWoundStepSpec } from './outcome'
import type { LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

// The final Thrown rows are transcribed from final/thrown.md, with their own
// recovery schedules, drops and task scopes. The Heft table is gear work outside these wounds.
const V = lubecContentVersion('thrown.md')
type Extras = Parameters<typeof finalRow>[7]
const r = (impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string, what: LubecWoundOutcome, extras?: Extras): LubecWoundTableRow =>
  finalRow(V, impact, severity, trauma, name, text, what, extras)
const MORE = { orMore: true } as const
const once = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, brief(parts))
const fight = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, step('combat-end', parts))
const rest = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>, count = 1) => card(key, part, ...rests(count, parts))
const catastrophic = (last: Omit<LubecWoundStepSpec, 'until'>) =>
  outcome([DEATH_SAVE, DOWN, DAZED_1D4], [card('body', 'Body', ...rests(2, { rolls: [dis('physical')] }), lasting(last))])
const brokenLeg = () => outcome([], [card('leg', 'Leg',
  step('long-rest', { restrictions: [CRAWL] }), step('long-rest', { rolls: [dis('speed')] }),
  lasting({ modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] }))])

export const LUBEC_THROWN_TABLE: LubecWoundTable = {
  key: 'thrown', name: 'Thrown Objects',
  locations: [
    {
      parts: ["head"],
      rows: [
        r(1, "Minor", 0, "Ducked into it", "Lose the next Movement Stage.",
          outcome([LOSE_MOVEMENT])),
        r(2, "Serious", 1, "Rock to the head", "Minor Concussion. Body Save. Success: only Dazed, and 0 Trauma instead of +1. Failure: Dazed and `-10 Handle` until 1 Long Rest.",
          outcome([]), { concussion: MINOR_CONCUSSION }),
        r(3, "Serious", 1, "Struck in the face", "Dazed. `-20 Handle` on ranged and visually precise actions until 1 Long Rest. After 1 Long Rest: lasting `-10 Handle` on ranged and visually precise actions.",
          outcome([DAZED], [card('eye', 'Vision', step('long-rest', { taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] }), lasting({ taskModifiers: [{ target: 'Handle', amount: -10, task: 'ranged-visual' }] }))])),
        r(4, "Serious", 1, "Broken nose or cheekbone", "Lose the next Action Stage. Visually precise actions at Disadvantage until 1 Long Rest. After 1 Long Rest: lasting `-10 Charm` at GM discretion.",
          outcome([LOSE_ACTION], [card('face', 'Face', step('long-rest', { rolls: [dis(task('visually-precise'))] }), charmReminder('Facial injury'))])),
        r(5, "Severe", 2, "Severe Concussion", "Body Save. Success: Dazed and `-10 Handle` until 1 Long Rest; +1 Trauma instead of +2. Failure: Dazed and `-30 Handle`. After 1 Long Rest: `-10 Handle`. After 2 Long Rests: the Handle penalty clears; lasting `-10 Intellect`.",
          outcome([]), { concussion: SEVERE_CONCUSSION }),
        r(6, "Catastrophic", 4, "Skull fracture", "Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body`, `-10 Intellect` and `+4 minimum Stress`.",
          catastrophic({ modifiers: [mod('Body', -20), mod('Intellect', -10)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ["neck"],
      rows: [
        r(1, "Minor", 0, "Clipped", "Attacks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Off guard', { rolls: [dis('attacks')] })])),
        r(2, "Serious", 1, "Wrenched neck", "`-10 Handle` for the rest of combat.",
          outcome([], [fight('neck', 'Neck', { modifiers: [handle(-10)] })])),
        r(3, "Serious", 1, "Throat strike", "Choking. Lose the next Action Stage.",
          outcome([LOSE_ACTION])),
        r(4, "Serious", 1, "Bruised windpipe", "Lose the next Action Stage. Speech badly impaired until 1 Long Rest.",
          outcome([LOSE_ACTION], [rest('throat', 'Throat', { restrictions: [speech('Speech badly impaired')] })])),
        r(5, "Severe", 2, "Fractured larynx", "Unable to speak until 1 Long Rest; afterward, speech badly impaired until 2 Long Rests. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: permanently hoarse voice, lasting `-10 Charm` at GM discretion.",
          outcome([], [card('larynx', 'Larynx', step('long-rest', { restrictions: [speech('Unable to speak')], rolls: [dis('physical')] }), step('long-rest', { restrictions: [speech('Speech badly impaired')], rolls: [dis('physical')] }), charmReminder('Permanently hoarse voice'))])),
        r(6, "Catastrophic", 4, "Crushed windpipe or broken neck", "Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.",
          catastrophic({ modifiers: [mod('Body', -20)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ["torso"],
      rows: [
        r(1, "Minor", 0, "Thump", "Lose the next Movement Stage.",
          outcome([LOSE_MOVEMENT])),
        r(2, "Minor", 0, "Winded", "Physical Checks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Winded', { rolls: [dis('physical')] })])),
        r(3, "Serious", 1, "Bruised ribs", "Strength and Speed Checks at Disadvantage until 1 Long Rest.",
          outcome([], [rest('ribs', 'Ribs', { rolls: [dis('strength'), dis('speed')] })])),
        r(4, "Serious", 1, "Broken rib(s)", "Physical Checks at Disadvantage until 2 Long Rests.",
          outcome([], [rest('ribs', 'Ribs', { rolls: [dis('physical')] }, 2)])),
        r(5, "Serious", 1, "Broken rib(s)", "Knocked down. Physical Checks at Disadvantage until 2 Long Rests.",
          outcome([DOWN], [rest('ribs', 'Ribs', { rolls: [dis('physical')] }, 2)])),
        r(6, "Severe", 2, "Caved ribs", "Knocked down. Dazed. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body`.",
          outcome([DOWN, DAZED], [card('ribs', 'Ribs', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Body', -10)] }))])),
        r(7, "Catastrophic", 4, "Crushed chest or stopped heart", "Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.",
          catastrophic({ modifiers: [mod('Body', -20)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ["waist"],
      rows: [
        r(1, "Minor", 0, "Thump in the gut", "Lose the next Movement Stage.",
          outcome([LOSE_MOVEMENT])),
        r(2, "Minor", 0, "Doubled over", "Physical Checks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Doubled over', { rolls: [dis('physical')] })])),
        r(3, "Serious", 1, "Deep tissue bruising", "Physical Checks at Disadvantage for the rest of combat.",
          outcome([], [fight('body', 'Bruising', { rolls: [dis('physical')] })])),
        r(4, "Serious", 1, "Deep tissue bruising", "Physical Checks at Disadvantage until 1 Long Rest.",
          outcome([], [rest('body', 'Bruising', { rolls: [dis('physical')] })])),
        r(5, "Serious", 1, "Kidney blow", "Knocked down. Physical Checks at Disadvantage until 1 Long Rest.",
          outcome([DOWN], [rest('body', 'Kidney', { rolls: [dis('physical')] })])),
        r(6, "Severe", 2, "Internal bleeding", "Gain +1 Trauma every 30 minutes until treated with Basic First Aid. Physical Checks at Disadvantage until 2 Long Rests.",
          outcome([], [slowBleed(), rest('body', 'Internal injury', { rolls: [dis('physical')] }, 2)])),
        r(7, "Catastrophic", 4, "Ruptured liver or spleen", "Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.",
          catastrophic({ modifiers: [mod('Body', -20)], minimumStress: 4 }), MORE),
      ],
    },
    {
      parts: ["groin"],
      rows: [
        r(1, "Minor", 0, "Flinch", "Attacks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Flinch', { rolls: [dis('attacks')] })])),
        r(2, "Minor", 0, "Low blow", "Lose the next Movement Stage. Attacks at Disadvantage until the end of the next round.",
          outcome([LOSE_MOVEMENT], [once('brief', 'Low blow', { rolls: [dis('attacks')] })])),
        r(3, "Serious", 1, "Groin strike", "Knocked down.",
          outcome([DOWN])),
        r(4, "Serious", 1, "Heavy groin strike", "Knocked down. Speed Checks at Disadvantage for the rest of combat.",
          outcome([DOWN], [fight('hip', 'Hip', { rolls: [dis('speed')] })])),
        r(5, "Serious", 1, "Damaged hip", "Knocked down. Speed Checks at Disadvantage until 1 Long Rest.",
          outcome([DOWN], [rest('hip', 'Hip', { rolls: [dis('speed')] })])),
        r(6, "Severe", 2, "Broken pelvis", "Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest: walking is possible, but Physical Checks remain at Disadvantage.",
          outcome([], [card('pelvis', 'Pelvis', step('long-rest', { restrictions: [CRAWL], rolls: [dis('physical')] }), step('long-rest', { rolls: [dis('physical')] }))]), MORE),
      ],
    },
    {
      parts: ["upperarm"],
      rows: [
        r(1, "Minor", 0, "Stinger", "Attacks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Stinger', { rolls: [dis('attacks')] })])),
        r(2, "Minor", 0, "Numb arm", "Handle rolls, including attacks, at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Numb arm', { rolls: [dis('handle')] })])),
        r(3, "Serious", 1, "Shoulder injury", "`-20 Handle` for the rest of combat.",
          outcome([], [fight('shoulder', 'Shoulder', { modifiers: [handle(-20)] })])),
        r(4, "Serious", 1, "Shoulder injury", "`-20 Handle` until 1 Long Rest.",
          outcome([], [rest('shoulder', 'Shoulder', { modifiers: [handle(-20)] })])),
        r(5, "Serious", 1, "Dislocated shoulder", "Whatever that hand holds is dropped. Arm unusable until the shoulder is put back in place; afterward, lasting `-10 Handle`.",
          outcome([DROP], [card('shoulder', 'Shoulder', step('put-back', { restrictions: [ARM_UNUSABLE] }), lasting({ modifiers: [handle(-10)] }))])),
        r(6, "Severe", 2, "Broken collarbone", "Whatever that hand holds is dropped. Arm unusable until 1 Long Rest. After 1 Long Rest: arm usable, with `-20 Handle` until 2 Long Rests.",
          outcome([DROP], [card('collarbone', 'Collarbone', step('long-rest', { restrictions: [ARM_UNUSABLE] }), step('long-rest', { modifiers: [handle(-20)] }))]), MORE),
      ],
    },
    {
      parts: ["forearm"],
      rows: [
        r(1, "Minor", 0, "Blocked it", "Attacks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Blocked it', { rolls: [dis('attacks')] })])),
        r(2, "Minor", 0, "Knocked loose", "Whatever that hand holds is dropped unless a Handle Check succeeds.",
          outcome([DROP_UNLESS])),
        r(3, "Serious", 1, "Forearm injury", "`-20 Handle` for the rest of combat.",
          outcome([], [fight('forearm', 'Forearm', { modifiers: [handle(-20)] })])),
        r(4, "Serious", 1, "Forearm injury", "`-20 Handle` until 1 Long Rest.",
          outcome([], [rest('forearm', 'Forearm', { modifiers: [handle(-20)] })])),
        r(5, "Serious", 1, "Sprained forearm", "`-30 Handle` until 1 Long Rest.",
          outcome([], [rest('forearm', 'Forearm', { modifiers: [handle(-30)] })])),
        r(6, "Severe", 2, "Shattered forearm", "Whatever that hand holds is dropped. Arm unusable until 1 Long Rest. After 1 Long Rest: arm usable; lasting `-10 Handle`.",
          outcome([DROP], [card('forearm', 'Forearm', step('long-rest', { restrictions: [ARM_UNUSABLE] }), lasting({ modifiers: [handle(-10)] }))]), MORE),
      ],
    },
    {
      parts: ["hand"],
      rows: [
        r(1, "Minor", 0, "Stung hand", "Handle rolls, including attacks, at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Stung hand', { rolls: [dis('handle')] })])),
        r(2, "Minor", 0, "Knocked loose", "Whatever that hand holds is dropped.",
          outcome([DROP])),
        r(3, "Serious", 1, "Jammed fingers", "Whatever that hand holds is dropped. `-20 Handle` for the rest of combat.",
          outcome([DROP], [fight('hand', 'Hand', { modifiers: [handle(-20)] })])),
        r(4, "Serious", 1, "Jammed fingers", "Whatever that hand holds is dropped. `-20 Handle` until 1 Long Rest.",
          outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-20)] })])),
        r(5, "Serious", 1, "Fractured hand / wrist", "Whatever that hand holds is dropped. `-40 Handle` until 1 Long Rest.",
          outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-40)] })])),
        r(6, "Severe", 2, "Crushed hand", "Whatever that hand holds is dropped. Actions requiring two hands are impossible until 1 Long Rest; Handle drops to 10 until 1 Long Rest. After 1 Long Rest: two-handed actions become possible, with `-40 Handle` until 2 Long Rests. After 2 Long Rests: lasting `-10 Handle`.",
          outcome([DROP], [card('hand', 'Hand', step('long-rest', { restrictions: [NO_TWO_HANDS], setTo: [{ target: 'Handle', value: 10 }] }), step('long-rest', { modifiers: [handle(-40)] }), lasting({ modifiers: [handle(-10)] }))]), MORE),
      ],
    },
    {
      parts: ["thigh"],
      rows: [
        r(1, "Minor", 0, "Thump", "Lose the next Movement Stage.",
          outcome([LOSE_MOVEMENT])),
        r(2, "Minor", 0, "Dead leg", "Physical Checks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Dead leg', { rolls: [dis('physical')] })])),
        r(3, "Serious", 1, "Deep thigh bruise", "Speed Checks at Disadvantage for the rest of combat.",
          outcome([], [fight('leg', 'Thigh', { rolls: [dis('speed')] })])),
        r(4, "Serious", 1, "Deep thigh bruise", "Speed Checks at Disadvantage until 1 Long Rest.",
          outcome([], [rest('leg', 'Thigh', { rolls: [dis('speed')] })])),
        r(5, "Serious", 1, "Leg buckles", "Knocked down. Speed Checks at Disadvantage until 1 Long Rest.",
          outcome([DOWN], [rest('leg', 'Thigh', { rolls: [dis('speed')] })])),
        r(6, "Severe", 2, "Broken thighbone", "Crawl only without help until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.",
          brokenLeg(), MORE),
      ],
    },
    {
      parts: ["shin", "feet"],
      rows: [
        r(1, "Minor", 0, "Barked shin / stubbed foot", "Speed Checks at Disadvantage until the end of the next round.",
          outcome([], [once('brief', 'Shin / foot', { rolls: [dis('speed')] })])),
        r(2, "Minor", 0, "Hard knock to the shin or foot", "Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.",
          outcome([LOSE_MOVEMENT], [once('brief', 'Shin / foot', { rolls: [dis('speed')] })])),
        r(3, "Serious", 1, "Knee / ankle injury", "Speed Checks at Disadvantage for the rest of combat.",
          outcome([], [fight('leg', 'Knee / ankle', { rolls: [dis('speed')] })])),
        r(4, "Serious", 1, "Knee / ankle injury", "Speed Checks at Disadvantage until 1 Long Rest.",
          outcome([], [rest('leg', 'Knee / ankle', { rolls: [dis('speed')] })])),
        r(5, "Serious", 1, "Fractured or dislocated knee / ankle", "Knocked down. Speed Checks at Disadvantage until 1 Long Rest.",
          outcome([DOWN], [rest('leg', 'Knee / ankle', { rolls: [dis('speed')] })])),
        r(6, "Severe", 2, "Shattered knee, shin or ankle", "Crawl only without help until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.",
          brokenLeg(), MORE),
      ],
    },
  ],
}

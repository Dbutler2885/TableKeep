import {
  adv, brief, card, charmReminder, DAZED, DEATH_SAVE, dis, DOWN, DROP, DROP_UNLESS, finalRow, handle, lasting, LOSE_ACTION, LOSE_MOVEMENT,
  MINOR_CONCUSSION, mod, NO_EVASIVE, NO_RUN, outcome, OUT_OF_REACH, rests, SEVERE_CONCUSSION, speech, step, task,
} from './build'
import { lubecContentVersion } from './finalSources'
import type { LubecWoundOutcome, LubecWoundStepSpec } from './outcome'
import type { LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

// The final Fisticuffs table (`final/fisticuffs.md`), every row agreed. Each row's text is the file's prose; its
// outcome is how the app plays it under `terms.md`. Fisticuffs reads shin and foot as rows of their own.

const V = lubecContentVersion('fisticuffs.md')
type Extras = Parameters<typeof finalRow>[7]
const r = (impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string, what: LubecWoundOutcome, extras?: Extras): LubecWoundTableRow =>
  finalRow(V, impact, severity, trauma, name, text, what, extras)
const MORE = { orMore: true } as const

const STAND = 'Drop to the ground. Standing uses Movement and Action unless a Speed Check succeeds, in which case it uses Movement only.'
const DOWN_WORDS = 'Knocked down. Standing uses Movement and Action unless a Speed Check succeeds, in which case it uses Movement only.'

const once = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, brief(parts))
const fight = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, step('combat-end', parts))
const rest = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>, count = 1) => card(key, part, ...rests(count, parts))

const attacksDis = () => once('brief', 'Off guard', { rolls: [dis('attacks')] })
const physicalDis = () => once('brief', 'Shaken', { rolls: [dis('physical')] })
const speedDisFight = () => fight('speed', 'Legs', { rolls: [dis('speed')] })

export const LUBEC_FISTICUFFS_TABLE: LubecWoundTable = {
  key: 'fisticuffs',
  name: 'Fisticuffs',
  locations: [
    {
      parts: ['head'],
      rows: [
        r(1, 'Minor', 0, 'Rocked', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Cover up / flinch', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Seeing stars', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalDis()])),
        r(4, 'Serious', 1, 'Knocked down', STAND, outcome([DOWN])),
        r(5, 'Serious', 1, 'Broken jaw or cheekbone', 'Lose the next Action Stage. Speech and eating badly impaired until 1 Long Rest. After 1 Long Rest: *Missing teeth or visibly altered jaw*, lasting `-10 Charm` at GM discretion.',
          outcome([LOSE_ACTION], [card('jaw', 'Jaw', step('long-rest', { restrictions: [speech('Speech and eating badly impaired')] }), charmReminder('Missing teeth or visibly altered jaw'))])),
        r(6, 'Serious', 1, 'Eye / face injury', '`-20 Handle` on ranged and visually precise actions until 1 Long Rest. After 1 Long Rest: *Damaged vision*, lasting `-10 Handle` on ranged and visually precise actions.',
          outcome([], [card('eye', 'Eye', step('long-rest', { taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] }), lasting({ taskModifiers: [{ target: 'Handle', amount: -10, task: 'ranged-visual' }], labels: ['Damaged vision'] }))])),
        r(7, 'Serious', 1, 'Minor Concussion', 'Body Save:<br>• **Success:** Dazed only; 0 Trauma instead of +1.<br>• **Failure:** Dazed and `-10 Handle` until a Long Rest; +1 Trauma.',
          outcome([]), { concussion: MINOR_CONCUSSION }),
        r(8, 'Severe', 2, 'Severe Concussion', 'Body Save. Success: a Minor Concussion instead (Dazed and `-10 Handle` until 1 Long Rest), and +1 Trauma instead of +2. Failure: Dazed and `-30 Handle`. After 1 Long Rest: `-10 Handle`. After 2 Long Rests: the Handle penalty clears; *Persistent concussion*, lasting `-10 Intellect`.',
          outcome([]), { concussion: SEVERE_CONCUSSION }),
        r(9, 'Severe', 2, 'Knocked unconscious', 'Unconscious for 2d10 minutes. Increase minimum Stress by 1d5; concussion consequences afterward.',
          outcome([{ kind: 'unconscious', aftermath: 'severe-concussion' }])),
        r(10, 'Catastrophic', 4, 'Catastrophic head injury', 'Immediate Death Save.', outcome([DEATH_SAVE]), MORE),
      ],
    },
    {
      parts: ['neck'],
      rows: [
        r(1, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Flinch', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Choking', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalDis()])),
        r(4, 'Serious', 1, 'Knocked down, gagging', STAND, outcome([DOWN])),
        r(5, 'Serious', 1, 'Throat punch', 'Dazed. Speech hoarse until a Long Rest.', outcome([DAZED], [rest('throat', 'Throat', { restrictions: [speech('Speech hoarse')] })])),
        r(6, 'Serious', 1, 'Wrenched neck', '`-10 Handle` until 1 Long Rest.', outcome([], [rest('neck', 'Neck', { modifiers: [handle(-10)] })])),
        r(7, 'Serious', 1, 'Wrenched neck', '`-10 Handle` until 1 Long Rest.', outcome([], [rest('neck', 'Neck', { modifiers: [handle(-10)] })])),
        r(8, 'Severe', 2, 'Wrenched neck', '`-10 Handle` until 2 Long Rests.', outcome([], [rest('neck', 'Neck', { modifiers: [handle(-10)] }, 2)])),
        r(9, 'Severe', 2, 'Blow to the side of the neck', 'Knocked unconscious for 2d10 minutes. Increase minimum Stress by 1d5.', outcome([{ kind: 'unconscious' }])),
        r(10, 'Catastrophic', 4, 'Catastrophic neck injury', 'Immediate Death Save.', outcome([DEATH_SAVE]), MORE),
      ],
    },
    {
      parts: ['torso'],
      rows: [
        r(1, 'Minor', 0, 'Driven back', 'Knocked out of striking reach; lose the next Movement Stage.', outcome([OUT_OF_REACH, LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Cover up', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Winded', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalDis()])),
        r(4, 'Serious', 1, 'Doubled over', DOWN_WORDS, outcome([DOWN])),
        r(5, 'Serious', 1, 'Breath knocked out', 'Dazed.', outcome([DAZED])),
        r(6, 'Serious', 1, 'Bruised ribs', 'Disadvantage on Strength and Speed Checks until after 1 Long Rest. No Evasive Movement until after 1 Long Rest.',
          outcome([], [rest('ribs', 'Ribs', { rolls: [dis('strength'), dis('speed')], restrictions: [NO_EVASIVE] })])),
        r(7, 'Serious', 1, 'Broken rib(s)', 'Physical Checks at Disadvantage until after 2 Long Rests.', outcome([], [rest('ribs', 'Ribs', { rolls: [dis('physical')] }, 2)])),
        r(8, 'Severe', 2, 'Body shot drop', `${DOWN_WORDS} Disadvantage on all physical Checks until 1 Long Rest.`, outcome([DOWN], [rest('body', 'Body', { rolls: [dis('physical')] })]), MORE),
      ],
    },
    {
      parts: ['waist'],
      rows: [
        r(1, 'Minor', 0, 'Driven back', 'Knocked out of striking reach; lose the next Movement Stage.', outcome([OUT_OF_REACH, LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Cover up', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Winded', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalDis()])),
        r(4, 'Serious', 1, 'Doubled over', DOWN_WORDS, outcome([DOWN])),
        r(5, 'Serious', 1, 'Breath knocked out', 'Dazed.', outcome([DAZED])),
        r(6, 'Serious', 1, 'Deep tissue bruising', 'Disadvantage on physical Checks until after 1 Long Rest.', outcome([], [rest('body', 'Body', { rolls: [dis('physical')] })])),
        r(7, 'Serious', 1, 'Liver or kidney shot', `${DOWN_WORDS} Disadvantage on physical Checks until after 1 Long Rest.`, outcome([DOWN], [rest('body', 'Body', { rolls: [dis('physical')] })])),
        r(8, 'Severe', 2, 'Body shot drop', `${DOWN_WORDS} Disadvantage on all physical Checks until 1 Long Rest.`, outcome([DOWN], [rest('body', 'Body', { rolls: [dis('physical')] })]), MORE),
      ],
    },
    {
      parts: ['groin'],
      rows: [
        r(1, 'Minor', 0, 'A near miss', 'Not near enough. Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Low blow', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Direct hit', 'A dull ache reaches your stomach. Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalDis()])),
        r(4, 'Serious', 1, 'Crushing blow', 'You hit the ground without a word. Knocked down and Dazed. Standing uses Movement and Action unless a Speed Check succeeds, in which case it uses Movement only.', outcome([DOWN, DAZED])),
        r(5, 'Serious', 1, 'Mashed soft tissue', `The pain is immediate. Inspecting the damage can wait. ${DOWN_WORDS} Disadvantage on physical Checks until after 1 Long Rest.`,
          outcome([DOWN], [rest('body', 'Groin', { rolls: [dis('physical')] })]), MORE),
      ],
    },
    {
      parts: ['upperarm'],
      rows: [
        r(1, 'Minor', 0, 'Shoulder checked', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(2, 'Minor', 0, 'Stinging biceps', 'Strength Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Biceps', { rolls: [dis('strength')] })])),
        r(3, 'Minor', 0, 'Arm jolted', 'Attacks at Disadvantage until the end of the next round. Strength Checks at Disadvantage until the end of the next round.',
          outcome([], [once('brief', 'Arm', { rolls: [dis('attacks'), dis('strength')] })])),
        r(4, 'Minor', 0, 'Bruised upper arm', 'Punches and throws are at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Arm', { rolls: [dis(task('punch-throw'))] })])),
        r(5, 'Minor', 0, 'Sore shoulder', 'Attacks, grappling and climbing are at Disadvantage until the end of the next round.',
          outcome([], [once('brief', 'Shoulder', { rolls: [dis('attacks'), dis(task('grapple-climb'))] })])),
        r(6, 'Serious', 1, 'Heavy shoulder bruise', '`-10 Handle` until after 1 Long Rest.', outcome([], [rest('shoulder', 'Shoulder', { modifiers: [handle(-10)] })])),
        r(7, 'Serious', 1, 'Deep muscle bruise', '`-20 Handle` until after 1 Long Rest. The arm remains usable.', outcome([], [rest('arm', 'Arm', { modifiers: [handle(-20)] })]), MORE),
      ],
    },
    {
      parts: ['forearm'],
      rows: [
        r(1, 'Minor', 0, 'Grip jolted', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(2, 'Minor', 0, 'Guard knocked aside', 'Defense rolls at Disadvantage until the end of the next round, regardless of which hand is used.', outcome([], [once('brief', 'Guard', { rolls: [dis('defense')] })])),
        r(3, 'Minor', 0, 'Stung forearm', 'Checks are at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Forearm', { rolls: [dis('checks')] })])),
        r(4, 'Serious', 1, 'Bruised forearm', 'Checks are at Disadvantage for the rest of the fight.', outcome([], [fight('forearm', 'Forearm', { rolls: [dis('checks')] })])),
        r(5, 'Serious', 1, 'Sore forearm', '`-10 Handle` on Checks for the rest of the fight.', outcome([], [fight('forearm', 'Forearm', { modifiers: [handle(-10)] })])),
        r(6, 'Serious', 1, 'Heavy forearm bruise', 'Whatever that hand holds is dropped. `-10 Handle` on Checks using hands until after 1 Long Rest.', outcome([DROP], [rest('forearm', 'Forearm', { modifiers: [handle(-10)] })])),
        r(7, 'Serious', 1, 'Deep forearm bruise', 'Whatever that hand holds is dropped. `-20 Handle` on Checks using hands until after 1 Long Rest.', outcome([DROP], [rest('forearm', 'Forearm', { modifiers: [handle(-20)] })]), MORE),
      ],
    },
    {
      parts: ['hand'],
      rows: [
        r(1, 'Minor', 0, 'Catch their fist', "Make a Handle Check. Success: catch the attacker's fist and gain Advantage on attacks until the end of the next round. Failure: no effect, no wound and no Stress from this Check.",
          outcome([], [once('caught', 'Caught their fist', { rolls: [adv('attacks')] })]), { fistCatch: true }),
        r(2, 'Minor', 0, 'Hand knocked open', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(3, 'Minor', 0, 'Stung fingers', 'Checks for precise work at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Fingers', { rolls: [dis(task('precise-work'))] })])),
        r(4, 'Minor', 0, 'Battered knuckles', 'Punches at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Knuckles', { rolls: [dis(task('punch'))] })])),
        r(5, 'Serious', 1, 'Swollen hand', '`-10 Handle` until after 1 Long Rest.', outcome([], [rest('hand', 'Hand', { modifiers: [handle(-10)] })])),
        r(6, 'Serious', 1, 'Badly bruised hand', '`-20 Handle` until after 1 Long Rest. The character can still grip, attack, reload and use tools.', outcome([], [rest('hand', 'Hand', { modifiers: [handle(-20)] })]), MORE),
      ],
    },
    {
      parts: ['thigh'],
      rows: [
        r(1, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Dead leg', 'Lose the next Movement Stage. Speed Checks are at Disadvantage for the rest of combat.', outcome([LOSE_MOVEMENT], [speedDisFight()])),
        r(4, 'Minor', 0, 'Legs kicked out', `${DOWN_WORDS} Speed Checks are at Disadvantage for the rest of combat.`, outcome([DOWN], [speedDisFight()])),
        r(5, 'Minor', 0, 'Legs kicked out', `${DOWN_WORDS} Speed Checks are at Disadvantage for the rest of combat.`, outcome([DOWN], [speedDisFight()])),
        r(6, 'Serious', 1, 'Dead leg', 'Cannot run or use Evasive Movement until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { restrictions: [NO_RUN, NO_EVASIVE] })])),
        r(7, 'Serious', 1, 'Leg buckles', `${DOWN_WORDS} Cannot run until 1 Long Rest.`, outcome([DOWN], [rest('leg', 'Leg', { restrictions: [NO_RUN] })]), MORE),
      ],
    },
    {
      parts: ['shin'],
      rows: [
        r(1, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Dead leg', 'Lose the next Movement Stage. Speed Checks are at Disadvantage for the rest of combat.', outcome([LOSE_MOVEMENT], [speedDisFight()])),
        r(4, 'Minor', 0, 'Legs kicked out', `${DOWN_WORDS} Speed Checks are at Disadvantage for the rest of combat.`, outcome([DOWN], [speedDisFight()])),
        r(5, 'Minor', 0, 'Legs kicked out', `${DOWN_WORDS} Speed Checks are at Disadvantage for the rest of combat.`, outcome([DOWN], [speedDisFight()])),
        r(6, 'Serious', 1, 'Knee injury', 'Cannot run. No Evasive Movement. Both restrictions last until 1 Long Rest.', outcome([], [rest('knee', 'Knee', { restrictions: [NO_RUN, NO_EVASIVE] })])),
        r(7, 'Serious', 1, 'Knee buckles', `${DOWN_WORDS} Cannot run. No Evasive Movement. Both restrictions last until 1 Long Rest.`, outcome([DOWN], [rest('knee', 'Knee', { restrictions: [NO_RUN, NO_EVASIVE] })])),
        r(8, 'Severe', 2, 'Fractured shin or knee', `${DOWN_WORDS} Speed Checks are at Disadvantage until 1 Long Rest. No Evasive Movement until treated. After 1 Long Rest: *Lasting limp*, \`-10 Speed\`.`,
          outcome([DOWN], [
            card('leg', 'Leg', step('long-rest', { rolls: [dis('speed')] }), lasting({ modifiers: [mod('Speed', -10)], labels: ['Lasting limp'] })),
            card('evasive', 'No Evasive Movement', step('treated', { restrictions: [NO_EVASIVE] })),
          ]), MORE),
      ],
    },
    {
      parts: ['feet'],
      rows: [
        r(1, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(2, 'Minor', 0, 'Off balance', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Stung foot', 'Lose the next Movement Stage. Speed Checks are at Disadvantage for the rest of combat.', outcome([LOSE_MOVEMENT], [speedDisFight()])),
        r(4, 'Minor', 0, 'Foot jolted', 'Lose the next Movement Stage. Speed Checks are at Disadvantage for the rest of combat.', outcome([LOSE_MOVEMENT], [speedDisFight()])),
        r(5, 'Minor', 0, 'Foot swept out', `${DOWN_WORDS} Speed Checks are at Disadvantage for the rest of combat.`, outcome([DOWN], [speedDisFight()])),
        r(6, 'Minor', 0, 'Bruised foot', `${DOWN_WORDS} Speed Checks are at Disadvantage for the rest of combat.`, outcome([DOWN], [speedDisFight()])),
        r(7, 'Serious', 1, 'Sprained ankle', `${DOWN_WORDS} Cannot run or use Evasive Movement until 1 Long Rest.`, outcome([DOWN], [rest('ankle', 'Ankle', { restrictions: [NO_RUN, NO_EVASIVE] })]), MORE),
      ],
    },
  ],
}

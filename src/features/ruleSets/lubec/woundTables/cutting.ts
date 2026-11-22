import {
  ARM_UNUSABLE, brief, card, CRAWL, DAZED, DEATH_SAVE, dis, DOWN, DROP, DROP_UNLESS, finalRow, handle, lasting, LOSE_ACTION, LOSE_MOVEMENT,
  mod, NO_EVASIVE, NO_GRIP, NO_RUN, NO_TWO_HANDS, outcome, rests, speech, step, timers,
} from './build'
import { lubecContentVersion } from './finalSources'
import type { LubecWoundNow, LubecWoundOutcome, LubecWoundStepSpec } from './outcome'
import type { LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

// The final Cutting table (`final/cutting.md`), every row agreed. Each row's text is the file's prose; its outcome is
// how the app plays it under `terms.md`. A d4 bleeding timer or Critical countdown is stopped by one Body Save made
// when the wound lands.

const V = lubecContentVersion('cutting.md')
type Extras = Parameters<typeof finalRow>[7]
const r = (impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string, what: LubecWoundOutcome, extras?: Extras): LubecWoundTableRow =>
  finalRow(V, impact, severity, trauma, name, text, what, extras)
const MORE = { orMore: true } as const

const once = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, brief(parts))
const fight = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, step('combat-end', parts))
const rest = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>, count = 1) => card(key, part, ...rests(count, parts))

const BLEED = timers('bleed')
const CRITICAL = timers('critical')
const DOWN_WORDS = 'Knocked down (drop to the ground; standing uses Movement and Action unless a Speed Check succeeds, in which case it uses Movement only).'

const attacksDis = (part = 'Off guard') => once('brief', part, { rolls: [dis('attacks')] })
const handleDis = () => once('brief', 'Grip', { rolls: [dis('handle')] })
const physical2 = (part = 'Body') => rest('body', part, { rolls: [dis('physical')] }, 2)
/** A Critical row: what happens at once, and a Death Save in d4 rounds unless the landing Body Save succeeds. */
const critical = (now: LubecWoundNow[], cards = outcome([]).cards) => outcome(now, cards, CRITICAL)
/** A lasting consequence with no temporary schedule before it, which applies the moment the wound lands. */
const lastingCard = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, lasting(parts))

/** "Crawl only until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest walking is possible. Lasting: Cut muscle, -10 Speed." */
const cutLegMuscle = () => outcome([], [card('leg', 'Leg',
  step('long-rest', { restrictions: [CRAWL], rolls: [dis('physical')] }), step('long-rest', { rolls: [dis('physical')] }),
  lasting({ modifiers: [mod('Speed', -10)], labels: ['Cut muscle'] }))], BLEED)

export const LUBEC_CUTTING_TABLE: LubecWoundTable = {
  key: 'cutting',
  name: 'Cutting',
  locations: [
    {
      parts: ['head'],
      rows: [
        r(1, 'Minor', 0, 'Scalp or face cut', 'Blood runs into the eyes. Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis('Blood in the eyes')])),
        r(2, 'Minor', 0, 'Cut across the brow', 'Blood runs into the eyes. All Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Blood in the eyes', { rolls: [dis('checks')] })])),
        r(3, 'Serious', 1, 'Scalp cut, bleeding hard', 'Attacks at Disadvantage until the end of the next round. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [attacksDis()], BLEED)),
        r(4, 'Serious', 1, 'Face slash near the eye', '`-20 Handle` on ranged and visually precise actions until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [rest('eye', 'Eye', { taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] })], BLEED)),
        r(5, 'Severe', 2, 'Eye cut', 'Lose the next Action Stage. `-20 Handle` on ranged and visually precise actions until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: *Damaged vision*, lasting `-10 Handle` on ranged and visually precise actions.',
          outcome([LOSE_ACTION], [card('eye', 'Eye', ...rests(2, { taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] }), lasting({ taskModifiers: [{ target: 'Handle', amount: -10, task: 'ranged-visual' }], labels: ['Damaged vision'] }))], BLEED)),
        r(6, 'Severe', 2, 'Cheek laid open or ear cut off', 'Dazed. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests, beginning immediately. Lasting: *Scarred face*; a lost ear remains lost.',
          outcome([DAZED], [physical2('Face'), lastingCard('scar', 'Scar', { labels: ['Scarred face; a lost ear remains lost'] })], BLEED)),
        r(7, 'Critical', 2, 'Temple artery opened, or scalp laid open to the bone', 'Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.', critical([LOSE_ACTION]), MORE),
      ],
    },
    {
      parts: ['neck'],
      rows: [
        r(1, 'Minor', 0, 'Nick', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(2, 'Minor', 0, 'Shallow cut across the neck', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Serious', 1, 'Bleeding cut', 'Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [], BLEED)),
        r(4, 'Serious', 1, 'Long neck cut', 'Dazed (lose the next Movement and Action Stages). Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([DAZED], [], BLEED)),
        r(5, 'Severe', 2, 'Windpipe opened', 'Whisper only until 1 Long Rest. After 1 Long Rest: Body Save. Failure: *Speech damaged*, lasting `-10 Charm` at GM discretion. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [
            card('speech', 'Speech', step('long-rest', { restrictions: [speech('Whisper only')] }),
              step('by-hand', { onReach: { save: 'Body', failure: 'Speech damaged' }, labels: ['Body Save: failure leaves Speech damaged, and the GM may call for Disadvantage on a relevant Charm Check'] })),
            physical2('Throat'),
          ], BLEED)),
        r(6, 'Severe', 2, 'Back of the neck cut deep', 'Dazed. `-20 Handle` until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([DAZED], [rest('neck', 'Neck', { modifiers: [handle(-20)] }, 2)], BLEED)),
        r(7, 'Critical', 2, 'Neck vein opened', 'Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.', critical([LOSE_ACTION])),
        r(8, 'Critical', 2, 'Neck artery opened', 'Dazed. Death Save in d4 turns unless a Body Save succeeds.', critical([DAZED])),
        r(9, 'Catastrophic', 4, 'Throat cut through', 'Immediate Death Save.', outcome([DEATH_SAVE]), MORE),
      ],
    },
    {
      parts: ['torso'],
      rows: [
        r(1, 'Minor', 0, 'Slash across the chest', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Chest', { rolls: [dis('physical')] })])),
        r(2, 'Minor', 0, 'Shallow cut across the ribs', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Long shallow cut', 'Lose the next Movement Stage. Attacks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [attacksDis()])),
        r(4, 'Serious', 1, 'Long chest cut', 'Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [], BLEED)),
        r(5, 'Serious', 1, 'Chest muscle cut', 'Strength Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('chest', 'Chest', { rolls: [dis('strength')] })], BLEED)),
        r(6, 'Severe', 2, 'Gash to the ribs', 'Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [physical2('Ribs')], BLEED)),
        r(7, 'Severe', 2, 'Back laid open', 'A deep slash parts the muscles across the back. Dazed. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: *Cut muscle*, lasting `-1d10 Body` (roll once).',
          outcome([DAZED], [card('body', 'Back', ...rests(2, { rolls: [dis('physical')] }), lasting({ rolled: [{ target: 'Body', sides: 10, what: 'Cut muscle Body' }], labels: ['Cut muscle'] }))], BLEED)),
        r(8, 'Critical', 2, 'Chest wall opened', 'Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.', critical([LOSE_ACTION])),
        r(9, 'Critical', 2, 'Cut between the ribs into the lung', `${DOWN_WORDS} Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.`, critical([DOWN, LOSE_ACTION])),
        r(10, 'Catastrophic', 4, 'Chest hewn open', 'Immediate Death Save.', outcome([DEATH_SAVE]), MORE),
      ],
    },
    {
      parts: ['waist'],
      rows: [
        r(1, 'Minor', 0, 'Slash across the belly or side', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Belly', { rolls: [dis('physical')] })])),
        r(2, 'Minor', 0, 'Cut across the belt line', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Minor', 0, 'Long shallow cut', 'Lose the next Movement Stage. Attacks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [attacksDis()])),
        r(4, 'Serious', 1, 'Flesh wound', 'Physical Checks at Disadvantage for the rest of combat.', outcome([], [fight('body', 'Side', { rolls: [dis('physical')] })])),
        r(5, 'Serious', 1, 'Long belly cut', 'Physical Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('body', 'Belly', { rolls: [dis('physical')] })], BLEED)),
        r(6, 'Severe', 2, 'Belly muscles cut through', 'Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: lasting `-10` to Body Saves.',
          outcome([], [card('body', 'Belly', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Body', -10)] }))], BLEED)),
        r(7, 'Severe', 2, 'Lower back cut deep', `${DOWN_WORDS} Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: lasting \`-10 Strength\`.`,
          outcome([DOWN], [card('body', 'Back', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Strength', -10)] }))], BLEED)),
        r(8, 'Critical', 2, 'Belly laid open', 'Dazed. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting `-10 Body`.', critical([DAZED], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })])),
        r(9, 'Critical', 2, 'Belly laid open, bowel cut', `${DOWN_WORDS} Dazed. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting \`-10 Body\`.`,
          critical([DOWN, DAZED], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })])),
        r(10, 'Catastrophic', 4, 'Cut through to the spine', 'Immediate Death Save. If survived: lasting `-10 Body`.', outcome([DEATH_SAVE], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })]), MORE),
      ],
    },
    {
      parts: ['groin'],
      rows: [
        r(1, 'Minor', 0, 'Cut', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Groin', { rolls: [dis('physical')] })])),
        r(2, 'Minor', 0, 'Cut at the hip', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Cut across the top of the thigh', 'Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [once('brief', 'Thigh', { rolls: [dis('speed')] })])),
        r(4, 'Serious', 1, 'Hip or inner-thigh cut', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Hip', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Inner-thigh cut, heavy bleeding', 'Speed Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('leg', 'Thigh', { rolls: [dis('speed')] })], BLEED)),
        r(6, 'Severe', 2, 'Gash across the groin', 'Physical Checks at Disadvantage until 2 Long Rests, beginning immediately. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [physical2('Groin')], BLEED)),
        r(7, 'Severe', 2, 'Hip muscles cut through', 'Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 1 Long Rest: walking is possible, but physical Checks remain at Disadvantage. Lasting: *Cut muscle*, `-10 Speed`.',
          cutLegMuscle()),
        r(8, 'Critical', 2, 'Big artery at the groin', 'Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.', critical([LOSE_ACTION])),
        r(9, 'Critical', 2, 'Big artery at the groin, cut through', `${DOWN_WORDS} Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.`, critical([DOWN, LOSE_ACTION])),
        r(10, 'Catastrophic', 4, 'Pelvic artery cut through', 'Immediate Death Save.', outcome([DEATH_SAVE]), MORE),
      ],
    },
    {
      parts: ['upperarm'],
      rows: [
        r(1, 'Minor', 0, 'Slash across the arm', 'Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([], [handleDis()])),
        r(2, 'Minor', 0, 'Sleeve and skin cut', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(3, 'Minor', 0, 'Long shallow cut', 'Handle rolls, including attacks, at Disadvantage until the end of the next round. Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS], [handleDis()])),
        r(4, 'Serious', 1, 'Arm wound', '`-20 Handle` until 1 Long Rest.', outcome([], [rest('arm', 'Arm', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Long arm cut', '`-20 Handle` until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('arm', 'Arm', { modifiers: [handle(-20)] })], BLEED)),
        r(6, 'Severe', 2, 'Muscle cut through', 'Arm unusable. After 1 Long Rest: arm usable, with `-40 Handle`. After 2 Long Rests: the temporary penalty clears. Lasting: *Cut muscle*, `-10 Handle`.',
          outcome([], [card('arm', 'Arm', step('long-rest', { restrictions: [ARM_UNUSABLE] }), step('long-rest', { modifiers: [handle(-40)] }), lasting({ modifiers: [handle(-10)], labels: ['Cut muscle'] }))])),
        r(7, 'Severe', 2, 'Shoulder cut to the bone', 'Arm unusable. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 1 Long Rest: arm usable, with `-40 Handle`. After 2 Long Rests: the temporary penalty clears. Lasting: *Cut muscle*, `-1d20 Handle` (roll once).',
          outcome([], [card('arm', 'Arm', step('long-rest', { restrictions: [ARM_UNUSABLE] }), step('long-rest', { modifiers: [handle(-40)] }), lasting({ rolled: [{ target: 'Handle', sides: 20, what: 'Cut muscle Handle' }], labels: ['Cut muscle'] }))], BLEED)),
        r(8, 'Critical', 2, 'Arm artery', 'Dazed. Death Save in d4 turns unless a Body Save succeeds.', critical([DAZED])),
        r(9, 'Critical', 2, 'Armpit artery', `${DOWN_WORDS} Death Save in d4 turns unless a Body Save succeeds.`, critical([DOWN])),
        r(10, 'Catastrophic', 4, 'Arm cut off', 'Immediate Death Save. If survived: lasting Handle halved, `-10 Charm`, `-10 Speed` and `-10 Body`.',
          outcome([DEATH_SAVE], [lastingCard('lasting', 'Arm cut off', { fractions: [{ target: 'Handle', factor: 0.5 }], modifiers: [mod('Charm', -10), mod('Speed', -10), mod('Body', -10)] })]), MORE),
      ],
    },
    {
      parts: ['forearm'],
      rows: [
        r(1, 'Minor', 0, 'Defensive cut', 'Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([], [handleDis()])),
        r(2, 'Minor', 0, 'Cut on the outside of the forearm', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(3, 'Minor', 0, 'Long defensive cut', 'Handle rolls, including attacks, at Disadvantage until the end of the next round. Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS], [handleDis()])),
        r(4, 'Serious', 1, 'Bleeding forearm cut', 'Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [], BLEED)),
        r(5, 'Serious', 1, 'Tendons nicked', '`-10 Handle` until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Whatever that hand holds is dropped unless a Handle Check succeeds.',
          outcome([DROP_UNLESS], [rest('forearm', 'Forearm', { modifiers: [handle(-10)] })], BLEED)),
        r(6, 'Severe', 2, 'Wrist slashed', 'Whatever that hand holds is dropped. Hand cannot grip for the rest of combat. `-40 Handle` until 1 Long Rest, then `-20 Handle` until 2 Long Rests. After 2 Long Rests: the temporary penalty clears. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Lasting: *Cut tendons*, `-10 Handle`.',
          outcome([DROP], [
            fight('grip', 'Grip', { restrictions: [NO_GRIP] }),
            card('wrist', 'Wrist', step('long-rest', { modifiers: [handle(-40)] }), step('long-rest', { modifiers: [handle(-20)] }), lasting({ modifiers: [handle(-10)], labels: ['Cut tendons'] })),
          ], BLEED), MORE),
      ],
    },
    {
      parts: ['hand'],
      rows: [
        r(1, 'Minor', 0, 'Cut fingers', 'Whatever that hand holds is dropped.', outcome([DROP])),
        r(2, 'Minor', 0, 'Cut across the back of the hand', 'Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([], [handleDis()])),
        r(3, 'Minor', 0, 'Fingers cut grabbing at the blade', 'Whatever that hand holds is dropped. Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([DROP], [handleDis()])),
        r(4, 'Serious', 1, 'Cut palm', 'Whatever that hand holds is dropped. `-20 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Finger tendons cut', 'Whatever that hand holds is dropped. `-40 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-40)] })])),
        r(6, 'Severe', 2, 'Fingers lost', 'Whatever that hand holds is dropped. Actions requiring two hands are impossible until 1 Long Rest; Handle drops to 10 until 1 Long Rest. After 1 Long Rest: two-handed actions become possible, with `-20 Handle` until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Roll 1d5 once for the number of fingers lost from that hand; they remain lost. After 2 Long Rests: lasting `-5 Handle` per lost finger (up to `-25 Handle`).',
          outcome([DROP], [
            lastingCard('fingers', 'Lost fingers', { labels: ['{fingers} lost from the {side} hand'] }),
            card('hand', 'Hand',
              step('long-rest', { restrictions: [NO_TWO_HANDS], setTo: [{ target: 'Handle', value: 10 }] }),
              step('long-rest', { modifiers: [handle(-20)] }),
              lasting({ perFinger: -5, labels: ['Lost fingers'] })),
          ], { ...BLEED, fingers: { sides: 5 } }), MORE),
      ],
    },
    {
      parts: ['thigh'],
      rows: [
        r(1, 'Minor', 0, 'Shallow cut', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Thigh', { rolls: [dis('physical')] })])),
        r(2, 'Minor', 0, 'Cut on the outer thigh', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Long shallow cut', 'Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [once('brief', 'Thigh', { rolls: [dis('speed')] })])),
        r(4, 'Serious', 1, 'Leg wound', 'Lose the next Movement Stage. Speed Checks at Disadvantage until 1 Long Rest.', outcome([LOSE_MOVEMENT], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Long thigh gash', 'Lose the next Movement Stage. Speed Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([LOSE_MOVEMENT], [rest('leg', 'Leg', { rolls: [dis('speed')] })], BLEED)),
        r(6, 'Severe', 2, 'Major bleeding', 'Lose the next Movement Stage. Physical Checks at Disadvantage until 2 Long Rests, beginning immediately. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([LOSE_MOVEMENT], [physical2('Leg')], BLEED)),
        r(7, 'Severe', 2, 'Thigh muscle cut through', 'Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 1 Long Rest: walking is possible, but physical Checks remain at Disadvantage. Lasting: *Cut muscle*, `-10 Speed`.',
          cutLegMuscle()),
        r(8, 'Critical', 2, 'Thigh artery', 'Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.', critical([LOSE_ACTION])),
        r(9, 'Critical', 2, 'Thigh artery, cut through', `${DOWN_WORDS} Lose the next Action Stage. Death Save in d4 turns unless a Body Save succeeds.`, critical([DOWN, LOSE_ACTION])),
        r(10, 'Catastrophic', 4, 'Leg hewn through', 'Immediate Death Save. If survived: lasting *Missing leg*. Only one leg remains; Speed is reduced to one quarter. `-10 Charm` or `+10 Charm`, at GM discretion.',
          outcome([DEATH_SAVE], [lastingCard('lasting', 'Missing leg', { fractions: [{ target: 'Speed', factor: 0.25 }], charmReminder: true, labels: ['Missing leg'] })]), MORE),
      ],
    },
    {
      parts: ['shin', 'feet'],
      rows: [
        r(1, 'Minor', 0, 'Shallow cut', 'Speed Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Leg', { rolls: [dis('speed')] })])),
        r(2, 'Minor', 0, 'Cut across the shin or foot', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Long shallow cut', 'Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [once('brief', 'Leg', { rolls: [dis('speed')] })])),
        r(4, 'Serious', 1, 'Leg / foot wound', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Calf / foot gash', 'Speed Checks at Disadvantage until 1 Long Rest. Cannot run or use Evasive Movement until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')], restrictions: [NO_RUN, NO_EVASIVE] })])),
        r(6, 'Severe', 2, 'Tendon behind the knee or ankle cut', 'Crawl only without help until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: the temporary penalty clears. Walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          outcome([], [card('leg', 'Leg', step('long-rest', { restrictions: [CRAWL] }), step('long-rest', { rolls: [dis('speed')] }), lasting({ modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] }))]), MORE),
      ],
    },
  ],
}

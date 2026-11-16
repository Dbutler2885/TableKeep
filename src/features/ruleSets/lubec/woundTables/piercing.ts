import {
  ARM_UNUSABLE, brief, card, charmReminder, CRAWL, DAZED, DAZED_1D4, DEATH_SAVE, dis, DOWN, DROP, DROP_UNLESS, finalRow, handle, lasting,
  LOSE_ACTION, LOSE_MOVEMENT, mod, NO_GRIP, NO_TWO_HANDS, outcome, rests, speech, step, timers,
} from './build'
import { lubecContentVersion } from './finalSources'
import type { LubecWoundNow, LubecWoundOutcome, LubecWoundStepSpec } from './outcome'
import type { LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

// The final Piercing table (`final/piercing.md`), every row agreed. Each row's text is the file's prose; its outcome
// is how the app plays it under `terms.md`. One landing Body Save stops every d4 countdown a wound carries.

const V = lubecContentVersion('piercing.md')
type Extras = Parameters<typeof finalRow>[7]
const r = (impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string, what: LubecWoundOutcome, extras?: Extras): LubecWoundTableRow =>
  finalRow(V, impact, severity, trauma, name, text, what, extras)
const MORE = { orMore: true } as const

const once = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, brief(parts))
const fight = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, step('combat-end', parts))
const rest = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>, count = 1) => card(key, part, ...rests(count, parts))
const lastingCard = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, lasting(parts))

const BLEED = timers('bleed')
const CRITICAL = timers('critical')
const critical = (now: LubecWoundNow[], cards = outcome([]).cards) => outcome(now, cards, CRITICAL)

const attacksDis = (part = 'Off guard') => once('brief', part, { rolls: [dis('attacks')] })
const physicalBrief = (part: string) => once('brief', part, { rolls: [dis('physical')] })
const speedBrief = (part = 'Leg') => once('brief', part, { rolls: [dis('speed')] })
const handleDis = () => once('brief', 'Grip', { rolls: [dis('handle')] })
const physical2 = (part = 'Body') => rest('body', part, { rolls: [dis('physical')] }, 2)
const rangedVisual = (amount: number) => ({ taskModifiers: [{ target: 'Handle' as const, amount, task: 'ranged-visual' as const }] })
const lostEye = () => lasting({ ...rangedVisual(-10), labels: ['Lost eye; the eye remains lost'] })
/** "Crawl only until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest walking is possible. After 2 Long Rests: walks with a limp." */
const limp = () => card('leg', 'Leg',
  step('long-rest', { restrictions: [CRAWL], rolls: [dis('physical')] }), step('long-rest', { rolls: [dis('physical')] }),
  lasting({ modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] }))
/** "Arm unusable until 1 Long Rest. After 1 Long Rest: usable with -40 Handle until 2 Long Rests. After 2 Long Rests: Damaged shoulder, lasting -10 Handle." */
const shoulderJoint = () => card('arm', 'Shoulder',
  step('long-rest', { restrictions: [ARM_UNUSABLE] }), step('long-rest', { modifiers: [handle(-40)] }), lasting({ modifiers: [handle(-10)], labels: ['Damaged shoulder'] }))

export const LUBEC_PIERCING_TABLE: LubecWoundTable = {
  key: 'piercing',
  name: 'Piercing',
  locations: [
    {
      parts: ['head'],
      rows: [
        r(1, 'Minor', 0, 'Point skids off the skull', 'Blood runs into the eyes. Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis('Blood in the eyes')])),
        r(2, 'Minor', 0, 'Point across the brow', 'Blood runs into the eyes. All Checks at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Blood in the eyes', { rolls: [dis('checks')] })])),
        r(3, 'Minor', 0, 'Point catches the jaw', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(4, 'Serious', 1, 'Stab through the cheek', 'Speech impaired until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('cheek', 'Cheek', { restrictions: [speech('Speech impaired')] })], BLEED)),
        r(5, 'Serious', 1, 'Point glances off the eye socket', 'Dazed. `-20 Handle` on ranged and visually precise actions until 1 Long Rest. After 1 Long Rest: *Damaged vision*, lasting `-10 Handle` on ranged and visually precise actions.',
          outcome([DAZED], [card('eye', 'Eye', step('long-rest', rangedVisual(-20)), lasting({ ...rangedVisual(-10), labels: ['Damaged vision'] }))])),
        r(6, 'Severe', 2, 'Eye put out', 'Lose the next Action Stage. `-20 Handle` on ranged and visually precise actions until 2 Long Rests. After 2 Long Rests: *Lost eye*, lasting `-10 Handle` on ranged and visually precise actions. The eye remains lost.',
          outcome([LOSE_ACTION], [card('eye', 'Eye', ...rests(2, rangedVisual(-20)), lostEye())])),
        r(7, 'Severe', 2, 'Point lodged in the skull', 'Dazed. Gain +1 Trauma in d4 turns unless a Body Save succeeds. `-20 Handle` until 2 Long Rests. After 2 Long Rests: *Persistent head injury*, lasting `-10 Intellect`.',
          outcome([DAZED], [card('head', 'Head', ...rests(2, { modifiers: [handle(-20)] }), lasting({ modifiers: [mod('Intellect', -10)], labels: ['Persistent head injury'] }))], BLEED)),
        r(8, 'Critical', 2, 'Stab through the temple', 'Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting `-10 Intellect`.',
          critical([DAZED_1D4], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Intellect', -10)] })])),
        r(9, 'Critical', 2, 'Stab through the eye socket', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. If survived: *Lost eye*, lasting `-10 Handle` on ranged and visually precise actions. The eye remains lost.',
          critical([DOWN, DAZED_1D4], [card('eye', 'Lost eye', lostEye())])),
        r(10, 'Catastrophic', 4, 'Into the brain', 'Immediate Death Save. If survived: lasting `-20 Intellect`.', outcome([DEATH_SAVE], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Intellect', -20)] })]), MORE),
      ],
    },
    {
      parts: ['neck'],
      rows: [
        r(1, 'Minor', 0, 'Nick', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(2, 'Minor', 0, 'Grazing jab', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Serious', 1, 'Bleeding puncture', 'Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [], BLEED)),
        r(4, 'Serious', 1, 'Stab beside the windpipe', 'Dazed. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([DAZED], [], BLEED)),
        r(5, 'Severe', 2, 'Windpipe punctured', 'Physical Checks at Disadvantage until 2 Long Rests, beginning immediately. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Whisper only until 1 Long Rest. After 1 Long Rest: make a Body Save; failure leaves *Speech damaged*, lasting `-10 Charm` at GM discretion.',
          outcome([], [
            physical2('Throat'),
            card('speech', 'Speech', step('long-rest', { restrictions: [speech('Whisper only')] }),
              step('by-hand', { onReach: { save: 'Body', failure: 'Speech damaged' }, labels: ['Body Save: failure leaves Speech damaged, and the GM may call for Disadvantage on a relevant Charm Check'] })),
          ], BLEED)),
        r(6, 'Severe', 2, 'Stab through the throat, choking on blood', 'Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Dazed. Unable to speak until 1 Long Rest; afterward, speech badly impaired until 2 Long Rests. After 2 Long Rests: *Permanently altered voice*, lasting `-10 Charm` at GM discretion.',
          outcome([DAZED], [
            physical2('Throat'),
            card('speech', 'Speech', step('long-rest', { restrictions: [speech('Unable to speak')] }), step('long-rest', { restrictions: [speech('Speech badly impaired')] }), charmReminder('Permanently altered voice')),
          ], BLEED)),
        r(7, 'Critical', 2, 'Neck vein opened', 'Dazed. Death Save in d4 turns unless a Body Save succeeds.', critical([DAZED])),
        r(8, 'Critical', 2, 'Neck artery opened', 'Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds.', critical([DAZED_1D4])),
        r(9, 'Catastrophic', 4, 'Blade into the spine', 'Immediate Death Save.', outcome([DEATH_SAVE]), MORE),
      ],
    },
    {
      parts: ['torso'],
      rows: [
        r(1, 'Minor', 0, 'Jab turned by a rib', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalBrief('Ribs')])),
        r(2, 'Minor', 0, 'Point in the chest muscle', 'Attacks at Disadvantage until the end of the next round.', outcome([], [attacksDis()])),
        r(3, 'Serious', 1, 'Puncture between the ribs', 'Physical Checks at Disadvantage for the rest of combat. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [fight('body', 'Ribs', { rolls: [dis('physical')] })], BLEED)),
        r(4, 'Serious', 1, '', 'Roll d2. **1 — Stab stopped by a rib:** Strength and Speed Checks at Disadvantage until 1 Long Rest. **2 — Point lodged:** a blade tip, glass or nail is left in; `-10 Strength` and `-10 Speed` until 1 Long Rest.',
          outcome([]), {
            choices: [
              { name: 'Stab stopped by a rib', text: 'Strength and Speed Checks at Disadvantage until 1 Long Rest.', outcome: outcome([], [rest('ribs', 'Ribs', { rolls: [dis('strength'), dis('speed')] })]) },
              { name: 'Point lodged', text: 'a blade tip, glass or nail is left in; `-10 Strength` and `-10 Speed` until 1 Long Rest.', outcome: outcome([], [rest('lodged', 'Lodged point', { modifiers: [mod('Strength', -10), mod('Speed', -10)], labels: ['A blade tip, glass or nail is left in'] })]) },
            ],
          }),
        r(5, 'Severe', 2, 'Stab into the chest', 'Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body`.', outcome([], [card('body', 'Chest', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Body', -10)] }))])),
        r(6, 'Severe', 2, 'Lung nicked', 'Dazed. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: *Chest wound*, lasting `-10 Body`.',
          outcome([DAZED], [card('body', 'Chest', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Body', -10)], labels: ['Chest wound'] }))], BLEED)),
        r(7, 'Critical', 2, 'Lung punctured', 'Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting `-10 Body`.',
          critical([DOWN, DAZED_1D4], [physical2('Chest'), lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })])),
        r(8, 'Critical', 2, 'Major vessel in the chest', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds.', critical([DOWN, DAZED_1D4])),
        r(9, 'Catastrophic', 4, 'Heart', 'Immediate Death Save. If survived: lasting `-20 Body`.', outcome([DEATH_SAVE], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -20)] })]), MORE),
      ],
    },
    {
      parts: ['waist'],
      rows: [
        r(1, 'Minor', 0, 'Jab into the side', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalBrief('Side')])),
        r(2, 'Minor', 0, 'Point skids off the hip bone', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Serious', 1, 'Shallow gut stab', 'Physical Checks at Disadvantage for the rest of combat. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [fight('body', 'Gut', { rolls: [dis('physical')] })], BLEED)),
        r(4, 'Serious', 1, 'Stab through the flank', 'Physical Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('body', 'Flank', { rolls: [dis('physical')] })], BLEED)),
        r(5, 'Severe', 2, 'Deep gut stab, bleeding inside', 'Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: lasting `-10 Body`.',
          outcome([], [card('body', 'Gut', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Body', -10)] }))], BLEED)),
        r(6, 'Severe', 2, 'Kidney stab', 'Dazed. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: *Internal injury*, lasting `-10 Body`.',
          outcome([DAZED], [card('body', 'Kidney', ...rests(2, { rolls: [dis('physical')] }), lasting({ modifiers: [mod('Body', -10)], labels: ['Internal injury'] }))], BLEED)),
        r(7, 'Critical', 2, 'Bowel or kidney', 'Dazed. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting `-10 Body`.', critical([DAZED], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })])),
        r(8, 'Critical', 2, 'Liver', 'Knocked down. Dazed. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting `-10 Body`.', critical([DOWN, DAZED], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })])),
        r(9, 'Catastrophic', 4, 'Main artery or spine', 'Immediate Death Save. If survived: lasting `-10 Body`.', outcome([DEATH_SAVE], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Body', -10)] })]), MORE),
      ],
    },
    {
      parts: ['groin'],
      rows: [
        r(1, 'Minor', 0, 'Jab', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalBrief('Groin')])),
        r(2, 'Minor', 0, 'Jab at the hip', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Point glances off the pelvis', 'Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [speedBrief('Hip')])),
        r(4, 'Serious', 1, 'Puncture at the hip', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Hip', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Inner-thigh stab, heavy bleeding', 'Speed Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('leg', 'Thigh', { rolls: [dis('speed')] })], BLEED)),
        r(6, 'Severe', 2, 'Deep groin stab', 'Physical Checks at Disadvantage until 2 Long Rests, beginning immediately. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [physical2('Groin')], BLEED)),
        r(7, 'Severe', 2, 'Stab into the hip joint', 'Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest: walking is possible, but physical Checks remain at Disadvantage. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          outcome([], [limp()])),
        r(8, 'Critical', 2, 'Big artery at the groin', 'Knocked down. Dazed. Physical Checks at Disadvantage until 2 Long Rests. Death Save in d4 turns unless a Body Save succeeds.', critical([DOWN, DAZED], [physical2('Groin')])),
        r(9, 'Critical', 2, 'Big artery at the groin, opened wide', 'Knocked down. Dazed. Physical Checks at Disadvantage until 2 Long Rests. Death Save in d4 turns unless a Body Save succeeds. If survived: lasting `-10 Speed`.',
          critical([DOWN, DAZED], [physical2('Groin'), lastingCard('lasting', 'Lasting', { modifiers: [mod('Speed', -10)] })])),
        r(10, 'Catastrophic', 4, 'Pelvic artery opened', 'Knocked down. Dazed. Physical Checks at Disadvantage until 2 Long Rests. Immediate Death Save. If survived: lasting `-10 Speed`.',
          outcome([DOWN, DAZED, DEATH_SAVE], [physical2('Groin'), lastingCard('lasting', 'Lasting', { modifiers: [mod('Speed', -10)] })]), MORE),
      ],
    },
    {
      parts: ['upperarm'],
      rows: [
        r(1, 'Minor', 0, 'Jab into the arm', 'Handle rolls at Disadvantage until the end of the next round.', outcome([], [handleDis()])),
        r(2, 'Minor', 0, 'Point in the shoulder', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(3, 'Minor', 0, 'Jab into the biceps', 'Handle rolls at Disadvantage until the end of the next round. Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS], [handleDis()])),
        r(4, 'Serious', 1, 'Puncture through the arm muscle', '`-20 Handle` until 1 Long Rest.', outcome([], [rest('arm', 'Arm', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Shoulder stab', '`-30 Handle` until 1 Long Rest.', outcome([], [rest('arm', 'Shoulder', { modifiers: [handle(-30)] })])),
        r(6, 'Severe', 2, 'Stab into the shoulder joint', 'Arm unusable until 1 Long Rest. After 1 Long Rest: arm usable, with `-40 Handle` until 2 Long Rests. After 2 Long Rests: *Damaged shoulder*, lasting `-10 Handle`.', outcome([], [shoulderJoint()])),
        r(7, 'Severe', 2, 'Stab under the collarbone', 'Arm unusable until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 1 Long Rest: arm usable, with `-40 Handle` until 2 Long Rests. After 2 Long Rests: *Damaged shoulder*, lasting `-10 Handle`.',
          outcome([], [shoulderJoint()], BLEED)),
        r(8, 'Critical', 2, 'Armpit artery, or into the chest under the shoulder', 'Dazed. Death Save in d4 turns unless a Body Save succeeds.', critical([DAZED]), MORE),
      ],
    },
    {
      parts: ['forearm'],
      rows: [
        r(1, 'Minor', 0, 'Jab caught on the arm', 'Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([], [handleDis()])),
        r(2, 'Minor', 0, 'Point skids along the bone', 'Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS])),
        r(3, 'Minor', 0, 'Shallow puncture', 'Handle rolls, including attacks, at Disadvantage until the end of the next round. Whatever that hand holds is dropped unless a Handle Check succeeds.', outcome([DROP_UNLESS], [handleDis()])),
        r(4, 'Serious', 1, 'Puncture through the forearm', '`-20 Handle` until 1 Long Rest.', outcome([], [rest('forearm', 'Forearm', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Stab between the forearm bones', '`-20 Handle` until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('forearm', 'Forearm', { modifiers: [handle(-20)] })], BLEED)),
        r(6, 'Severe', 2, 'Stab through the wrist', 'Whatever that hand holds is dropped. Hand cannot grip for the rest of combat. `-40 Handle` until 1 Long Rest, then `-20 Handle` until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: *Cut tendons*, lasting `-10 Handle`.',
          outcome([DROP], [
            fight('grip', 'Grip', { restrictions: [NO_GRIP] }),
            card('wrist', 'Wrist', step('long-rest', { modifiers: [handle(-40)] }), step('long-rest', { modifiers: [handle(-20)] }), lasting({ modifiers: [handle(-10)], labels: ['Cut tendons'] })),
          ], BLEED), MORE),
      ],
    },
    {
      parts: ['hand'],
      rows: [
        r(1, 'Minor', 0, 'Jab to the knuckles', 'Whatever that hand holds is dropped.', outcome([DROP])),
        r(2, 'Minor', 0, 'Nicked fingers', 'Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([], [handleDis()])),
        r(3, 'Minor', 0, 'Point between the knuckles', 'Whatever that hand holds is dropped. Handle rolls at Disadvantage until the end of the next round.', outcome([DROP], [handleDis()])),
        r(4, 'Serious', 1, 'Puncture in the palm', 'Whatever that hand holds is dropped. `-20 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-20)] })])),
        r(5, 'Serious', 1, 'Stab through the hand', 'Whatever that hand holds is dropped. `-40 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-40)] })])),
        r(6, 'Severe', 2, 'Hand bones split', 'Whatever that hand holds is dropped. Actions requiring two hands are impossible until 1 Long Rest; Handle drops to 10 until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 1 Long Rest: two-handed actions become possible, with `-40 Handle` until 2 Long Rests. After 2 Long Rests: *Lasting hand damage*, `-10 Handle`.',
          outcome([DROP], [card('hand', 'Hand',
            step('long-rest', { restrictions: [NO_TWO_HANDS], setTo: [{ target: 'Handle', value: 10 }] }),
            step('long-rest', { modifiers: [handle(-40)] }),
            lasting({ modifiers: [handle(-10)], labels: ['Lasting hand damage'] }))], BLEED), MORE),
      ],
    },
    {
      parts: ['thigh'],
      rows: [
        r(1, 'Minor', 0, 'Jab into the thigh', 'Physical Checks at Disadvantage until the end of the next round.', outcome([], [physicalBrief('Thigh')])),
        r(2, 'Minor', 0, 'Point in the outer thigh', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Stab glances off the thighbone', 'Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [speedBrief()])),
        r(4, 'Serious', 1, 'Thigh stab', 'Lose the next Movement Stage. Speed Checks at Disadvantage until 1 Long Rest.', outcome([LOSE_MOVEMENT], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Thigh stab, bleeding', 'Lose the next Movement Stage. Speed Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([LOSE_MOVEMENT], [rest('leg', 'Leg', { rolls: [dis('speed')] })], BLEED)),
        r(6, 'Severe', 2, 'Major bleeding', 'Lose the next Movement Stage. Physical Checks at Disadvantage until 2 Long Rests, beginning immediately. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([LOSE_MOVEMENT], [physical2('Leg')], BLEED)),
        r(7, 'Severe', 2, 'Stab to the bone through the thigh muscle', 'Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 1 Long Rest: walking is possible, but physical Checks remain at Disadvantage. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          outcome([], [limp()], BLEED)),
        r(8, 'Critical', 2, 'Thigh artery', 'Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Death Save in d4 turns unless a Body Save succeeds. After 1 Long Rest: walking is possible, but physical Checks remain at Disadvantage. After 2 Long Rests, if survived: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          outcome([], [limp()], timers('bleed', 'critical')), MORE),
      ],
    },
    {
      parts: ['shin', 'feet'],
      rows: [
        r(1, 'Minor', 0, 'Jab', 'Speed Checks at Disadvantage until the end of the next round.', outcome([], [speedBrief()])),
        r(2, 'Minor', 0, 'Point in the calf or the top of the foot', 'Lose the next Movement Stage.', outcome([LOSE_MOVEMENT])),
        r(3, 'Minor', 0, 'Stab glances off the shinbone', 'Lose the next Movement Stage. Speed Checks at Disadvantage until the end of the next round.', outcome([LOSE_MOVEMENT], [speedBrief()])),
        r(4, 'Serious', 1, 'Calf or foot puncture', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(5, 'Serious', 1, 'Stab through the calf or foot', 'Knocked down. Speed Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(6, 'Severe', 2, 'Point into the knee or ankle joint', 'Crawl only without help until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          outcome([], [card('leg', 'Leg', step('long-rest', { restrictions: [CRAWL] }), step('long-rest', { rolls: [dis('speed')] }), lasting({ modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] }))]), MORE),
      ],
    },
  ],
}

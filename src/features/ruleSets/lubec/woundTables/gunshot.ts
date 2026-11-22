import {
  ARM_UNUSABLE, brief, card, charmReminder, CRAWL, DAZED, DAZED_1D4, DEATH_SAVE, dis, DOWN, DROP, finalRow, handle, lasting, LOSE_ACTION,
  LOSE_MOVEMENT, MINOR_CONCUSSION, mod, NO_TWO_HANDS, outcome, rests, SEVERE_CONCUSSION, speech, step, timers,
} from './build'
import { lubecContentVersion } from './finalSources'
import type { LubecWoundNow, LubecWoundOutcome, LubecWoundStepSpec } from './outcome'
import type { LubecWoundChoice, LubecWoundSeverity, LubecWoundTable, LubecWoundTableRow } from './types'

// The final Gunshot table (`final/gunshot.md`), every row agreed. Each row's text is the file's prose, except the
// head rows `finalOverrides.ts` lists, where the terms' concussion reading replaces the row's; its outcome is how
// the app plays it under `terms.md`.

const V = lubecContentVersion('gunshot.md')
type Extras = Parameters<typeof finalRow>[7]
const r = (impact: number, severity: LubecWoundSeverity, trauma: number, name: string, text: string, what: LubecWoundOutcome, extras?: Extras): LubecWoundTableRow =>
  finalRow(V, impact, severity, trauma, name, text, what, extras)
const MORE = { orMore: true } as const

const once = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, brief(parts))
const rest = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>, count = 1) => card(key, part, ...rests(count, parts))
const lastingCard = (key: string, part: string, parts: Omit<LubecWoundStepSpec, 'until'>) => card(key, part, lasting(parts))

const BLEED = timers('bleed')
const graze = (part = 'Graze') => outcome([], [once('brief', part, { rolls: [dis('physical')] })])
/** "Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting ...". */
const physicalThen = (part: string, last: Omit<LubecWoundStepSpec, 'until'>) => card('body', part, ...rests(2, { rolls: [dis('physical')] }), lasting(last))
/** A Critical wound: knocked down, Dazed for 1d4 turns, a Death Save countdown, and Physical Checks at Disadvantage until 2 Long Rests, then lasting -10 Body and +2 minimum Stress. */
const critical = (part: string, now: LubecWoundNow[] = []) =>
  outcome([DOWN, DAZED_1D4, ...now], [physicalThen(part, { modifiers: [mod('Body', -10)], minimumStress: 2 })], timers('critical'))
/** A Catastrophic wound below the head: Immediate Death Save, knocked down, Dazed for 1d4 turns, then lasting -20 Body and +4 minimum Stress. */
const catastrophic = (part: string) => outcome([DEATH_SAVE, DOWN, DAZED_1D4], [physicalThen(part, { modifiers: [mod('Body', -20)], minimumStress: 4 })])
/** "Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest: walking is possible." */
const crawlThen = (part: string, last: Omit<LubecWoundStepSpec, 'until'>) =>
  card('body', part, step('long-rest', { restrictions: [CRAWL], rolls: [dis('physical')] }), step('long-rest', { rolls: [dis('physical')] }), lasting(last))
/** "Crawl only until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: walks with a limp." */
const shatteredLeg = () => outcome([], [card('leg', 'Leg', step('long-rest', { restrictions: [CRAWL] }), step('long-rest', { rolls: [dis('speed')] }),
  lasting({ modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] }))])
/** "Whatever that hand holds is dropped. Arm unusable until 1 Long Rest. After 1 Long Rest: usable, with -30 Handle until 2 Long Rests. After 2 Long Rests: lasting -10 Handle." */
const shatteredArm = (part: string) => outcome([DROP], [card('arm', part,
  step('long-rest', { restrictions: [ARM_UNUSABLE] }), step('long-rest', { modifiers: [handle(-30)] }), lasting({ modifiers: [handle(-10)] }))])
/** "Roll d2. 2 — Bleeding wound: also gain +1 Trauma in d4 turns unless a Body Save succeeds." */
const bleedingD2 = (name: string): [LubecWoundChoice, LubecWoundChoice] => [
  { name, text: '', outcome: outcome([]) },
  { name: 'Bleeding wound', text: 'also gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome: outcome([], [], BLEED) },
]
const SKULL_HIT = { ...SEVERE_CONCUSSION, keepTrauma: true, noLasting: true } as const

export const LUBEC_GUNSHOT_TABLE: LubecWoundTable = {
  key: 'gunshot',
  name: 'Gunshot',
  locations: [
    {
      parts: ['head'],
      rows: [
        r(1, 'Serious', 1, 'Bullet glances off the skull', 'Minor Concussion. Body Save. Success: only Dazed, and 0 Trauma instead of +1. Failure: Minor Concussion, which is Dazed and `-10 Handle` until 1 Long Rest.',
          outcome([]), { concussion: MINOR_CONCUSSION }),
        r(2, 'Serious', 1, 'Face, jaw or ear wound', 'Lose the next Action Stage. Speech badly impaired until 1 Long Rest. `-20 Handle` on ranged and visually precise actions until 1 Long Rest. After 1 Long Rest: *Facial injury*, lasting `-10 Charm` at GM discretion.',
          outcome([LOSE_ACTION], [card('face', 'Face', step('long-rest', { restrictions: [speech('Speech badly impaired')], taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] }), charmReminder('Facial injury'))])),
        r(3, 'Severe', 2, 'Skull hit', 'Severe Concussion. Body Save. Success: Minor Concussion—Dazed, with `-10 Handle` until 1 Long Rest; +1 Trauma instead of +2. Failure: Dazed and `-30 Handle`. After 1 Long Rest: `-10 Handle`. After 2 Long Rests: the Handle penalty clears; *Persistent concussion*, lasting `-10 Intellect`.',
          outcome([]), { concussion: SEVERE_CONCUSSION }),
        r(4, 'Critical', 2, 'Bullet in the skull', 'Apply the Skull hit concussion effects at Impact 3, including Dazed, its concussion Body Save, penalties and recovery. Retain +2 Trauma regardless of the concussion Save. Death Save in d4 turns unless a separate Body Save succeeds. If survived, lasting: `-10 Intellect`, `-10 Body`, and `+4 minimum Stress`. The concussion adds no lasting Intellect of its own: this is the wound\'s whole lasting Intellect loss.',
          outcome([], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Intellect', -10), mod('Body', -10)], minimumStress: 4 })], timers('critical')), { concussion: SKULL_HIT }),
        r(5, 'Catastrophic', 4, 'Brain', 'Immediate Death Save. If survived: apply the Skull hit concussion effects at Impact 3, including Dazed, its concussion Body Save, penalties and recovery. Retain +4 Trauma regardless of the concussion Save. If survived, lasting: `-20 Intellect`, `-20 Body`, and `+8 minimum Stress`. The concussion adds no lasting Intellect of its own: this is the wound\'s whole lasting Intellect loss.',
          outcome([DEATH_SAVE], [lastingCard('lasting', 'Lasting', { modifiers: [mod('Intellect', -20), mod('Body', -20)], minimumStress: 8 })]), { concussion: SKULL_HIT, orMore: true }),
      ],
    },
    {
      parts: ['neck'],
      rows: [
        r(1, 'Serious', 1, 'Bleeding graze', 'Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [], BLEED)),
        r(2, 'Serious', 1, 'Through the side of the neck', 'Dazed. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([DAZED], [], BLEED)),
        r(3, 'Severe', 2, 'Windpipe hit', 'Choking on blood. Dazed. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: *Permanently altered voice*, lasting `-10 Charm` at GM discretion.',
          outcome([DAZED], [card('body', 'Throat', ...rests(2, { rolls: [dis('physical')] }), charmReminder('Permanently altered voice'))], BLEED)),
        r(4, 'Critical', 2, 'Neck artery or vein', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body` and `+2 minimum Stress`.', critical('Neck')),
        r(5, 'Catastrophic', 4, 'Spine or neck vessels destroyed', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.', catastrophic('Neck'), MORE),
      ],
    },
    {
      parts: ['torso'],
      rows: [
        r(1, 'Minor', 0, 'Graze across the ribs', 'Physical Checks at Disadvantage until the end of the next round.', graze()),
        r(2, 'Serious', 1, 'Flesh wound', 'Physical Checks at Disadvantage until 1 Long Rest. Roll d2. **2 — Bleeding wound:** also gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [rest('body', 'Chest', { rolls: [dis('physical')] })]), { choices: bleedingD2('Flesh wound') }),
        r(3, 'Serious', 1, 'Bullet along the ribs', 'Physical Checks at Disadvantage until 2 Long Rests. Roll d2. **2 — Bleeding wound:** also gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [rest('body', 'Ribs', { rolls: [dis('physical')] }, 2)]), { choices: bleedingD2('Bullet along the ribs') }),
        r(4, 'Severe', 2, 'Shot through the chest', 'Dazed. Gain +1 Trauma in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body`.',
          outcome([DAZED], [physicalThen('Chest', { modifiers: [mod('Body', -10)] })], BLEED)),
        r(5, 'Critical', 2, 'Lung or major vessel', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body` and `+2 minimum Stress`.', critical('Chest')),
        r(6, 'Catastrophic', 4, 'Heart or upper spine', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.', catastrophic('Chest'), MORE),
      ],
    },
    {
      parts: ['waist'],
      rows: [
        r(1, 'Minor', 0, 'Graze across the side', 'Physical Checks at Disadvantage until the end of the next round.', graze()),
        r(2, 'Serious', 1, 'Flesh wound through the side', 'Physical Checks at Disadvantage until 1 Long Rest. Roll d2. **2 — Bleeding wound:** also gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [rest('body', 'Side', { rolls: [dis('physical')] })]), { choices: bleedingD2('Flesh wound through the side') }),
        r(3, 'Serious', 1, 'Bullet through the side muscles', 'Physical Checks at Disadvantage until 2 Long Rests. Roll d2. **2 — Bleeding wound:** also gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [rest('body', 'Side', { rolls: [dis('physical')] }, 2)]), { choices: bleedingD2('Bullet through the side muscles') }),
        r(4, 'Severe', 2, 'Gut shot', 'Physical Checks at Disadvantage until 2 Long Rests. Gain +1 Trauma in d4 turns unless a Body Save succeeds. After 2 Long Rests: lasting `-10 Body`.',
          outcome([], [physicalThen('Gut', { modifiers: [mod('Body', -10)] })], BLEED)),
        r(5, 'Critical', 2, 'Liver, kidney or bowel', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body` and `+2 minimum Stress`.', critical('Gut')),
        r(6, 'Catastrophic', 4, 'Main artery or lower spine', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest: walking is possible, but Physical Checks remain at Disadvantage. After 2 Long Rests: lasting `-20 Body` and `+4 minimum Stress`.',
          outcome([DEATH_SAVE, DOWN, DAZED_1D4], [crawlThen('Spine', { modifiers: [mod('Body', -20)], minimumStress: 4 })]), MORE),
      ],
    },
    {
      parts: ['groin'],
      rows: [
        r(1, 'Minor', 0, 'Graze', 'Physical Checks at Disadvantage until the end of the next round.', graze()),
        r(2, 'Serious', 1, 'Hip flesh wound', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Hip', { rolls: [dis('speed')] })])),
        r(3, 'Serious', 1, 'Heavy bleeding', 'Speed Checks at Disadvantage until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('leg', 'Hip', { rolls: [dis('speed')] })], BLEED)),
        r(4, 'Severe', 2, 'Shattered hip or pelvis', 'Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest: walking is possible, but Physical Checks remain at Disadvantage. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.',
          outcome([], [crawlThen('Hip', { modifiers: [mod('Speed', -10)], charmReminder: true, labels: ['Walks with a limp'] })])),
        r(5, 'Critical', 2, 'Big artery at the groin', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body` and `+2 minimum Stress`.', critical('Groin')),
        r(6, 'Catastrophic', 4, 'Pelvic vessels destroyed', 'Immediate Death Save. Knocked down. Dazed for 1d4 turns. Crawl only without help until 1 Long Rest. Physical Checks at Disadvantage until 2 Long Rests. After 1 Long Rest: walking is possible, but Physical Checks remain at Disadvantage. After 2 Long Rests: lasting `-20 Body`, `-10 Speed` and `+4 minimum Stress`.',
          outcome([DEATH_SAVE, DOWN, DAZED_1D4], [crawlThen('Pelvis', { modifiers: [mod('Body', -20), mod('Speed', -10)], minimumStress: 4 })]), MORE),
      ],
    },
    {
      parts: ['upperarm'],
      rows: [
        r(1, 'Minor', 0, 'Graze', 'Physical Checks at Disadvantage until the end of the next round.', graze()),
        r(2, 'Serious', 1, 'Arm wound', 'Through-and-through muscle wound. `-10 Handle` until 1 Long Rest.', outcome([], [rest('arm', 'Arm', { modifiers: [handle(-10)] })])),
        r(3, 'Serious', 1, 'Damaged shoulder', '`-20 Handle` until 1 Long Rest.', outcome([], [rest('arm', 'Shoulder', { modifiers: [handle(-20)] })])),
        r(4, 'Severe', 2, 'Shattered arm', 'Whatever that hand holds is dropped. Arm unusable until 1 Long Rest. After 1 Long Rest: arm usable, with `-30 Handle` until 2 Long Rests. After 2 Long Rests: lasting `-10 Handle`.', shatteredArm('Arm')),
        r(5, 'Critical', 2, 'Armpit artery, or into the chest under the shoulder', 'Knocked down. Dazed for 1d4 turns. Whatever that hand holds is dropped. Death Save in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body` and `+2 minimum Stress`.',
          critical('Chest', [DROP]), MORE),
      ],
    },
    {
      parts: ['forearm'],
      rows: [
        r(1, 'Minor', 0, 'Graze', 'Handle rolls, including attacks, at Disadvantage until the end of the next round.', outcome([], [once('brief', 'Grip', { rolls: [dis('handle')] })])),
        r(2, 'Serious', 1, 'Arm wound', '`-10 Handle` until 1 Long Rest.', outcome([], [rest('forearm', 'Forearm', { modifiers: [handle(-10)] })])),
        r(3, 'Serious', 1, 'Chipped bone', '`-20 Handle` until 1 Long Rest. Gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome([], [rest('forearm', 'Forearm', { modifiers: [handle(-20)] })], BLEED)),
        r(4, 'Severe', 2, 'Shattered forearm', 'Whatever that hand holds is dropped. Arm unusable until 1 Long Rest. After 1 Long Rest: arm usable, with `-30 Handle` until 2 Long Rests. After 2 Long Rests: lasting `-10 Handle`.', shatteredArm('Forearm'), MORE),
      ],
    },
    {
      parts: ['hand'],
      rows: [
        r(1, 'Minor', 0, 'Nicked hand', 'Whatever that hand holds is dropped.', outcome([DROP])),
        r(2, 'Serious', 1, 'Damaged hand / wrist', 'Whatever that hand holds is dropped. `-10 Handle` until 1 Long Rest.', outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-10)] })])),
        r(3, 'Serious', 1, 'Fingers or wrist bones hit', 'Whatever that hand holds is dropped. `-20 Handle` until 1 Long Rest. Roll d2. **2 — Finger shot off:** 1 finger is lost; after 1 Long Rest, lasting `-5 Handle`.',
          outcome([DROP], [rest('hand', 'Hand', { modifiers: [handle(-20)] })]), {
            choices: [
              { name: 'Fingers or wrist bones hit', text: '', outcome: outcome([]) },
              {
                name: 'Finger shot off', text: '1 finger is lost; after 1 Long Rest, lasting `-5 Handle`.',
                outcome: outcome([], [
                  lastingCard('fingers', 'Lost finger', { labels: ['{fingers} lost from the {side} hand'] }),
                  card('finger', 'Finger', step('long-rest', { labels: ['Lasting -5 Handle after 1 Long Rest'] }), lasting({ perFinger: -5, labels: ['Lost finger'] })),
                ], { fingers: { count: 1 } }),
              },
            ],
          }),
        r(4, 'Severe', 2, 'Shattered hand', 'Whatever that hand holds is dropped. Roll 1d3 for fingers lost. Actions requiring two hands are impossible until 1 Long Rest; Handle drops to 10 until 1 Long Rest. After 1 Long Rest: two-handed actions become possible, with `-30 Handle` until 2 Long Rests. After 2 Long Rests: lasting `-10 Handle`, plus `-5 Handle` per lost finger.',
          outcome([DROP], [
            lastingCard('fingers', 'Lost fingers', { labels: ['{fingers} lost from the {side} hand'] }),
            card('hand', 'Hand',
              step('long-rest', { restrictions: [NO_TWO_HANDS], setTo: [{ target: 'Handle', value: 10 }] }),
              step('long-rest', { modifiers: [handle(-30)] }),
              lasting({ modifiers: [handle(-10)], perFinger: -5, labels: ['Lost fingers'] })),
          ], { fingers: { sides: 3 } }), MORE),
      ],
    },
    {
      parts: ['thigh'],
      rows: [
        r(1, 'Minor', 0, 'Graze', 'Physical Checks at Disadvantage until the end of the next round.', graze()),
        r(2, 'Serious', 1, 'Leg wound', 'Lose the next Movement Stage. Speed Checks at Disadvantage until 1 Long Rest.', outcome([LOSE_MOVEMENT], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(3, 'Serious', 1, 'Leg wound near the hip or knee', 'Speed Checks at Disadvantage until 1 Long Rest. Roll d2. **1 — Leg gives out:** Knocked down. **2 — Heavy bleeding:** lose the next Movement Stage; gain +1 Trauma in d4 turns unless a Body Save succeeds.',
          outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')] })]), {
            choices: [
              { name: 'Leg gives out', text: 'Knocked down.', outcome: outcome([DOWN]) },
              { name: 'Heavy bleeding', text: 'lose the next Movement Stage; gain +1 Trauma in d4 turns unless a Body Save succeeds.', outcome: outcome([LOSE_MOVEMENT], [], BLEED) },
            ],
          }),
        r(4, 'Severe', 2, 'Shattered leg', 'Crawl only without help until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.', shatteredLeg()),
        r(5, 'Critical', 2, 'Thigh artery', 'Knocked down. Dazed for 1d4 turns. Death Save in d4 turns unless a Body Save succeeds. Physical Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: lasting `-10 Body` and `+2 minimum Stress`.', critical('Leg'), MORE),
      ],
    },
    {
      parts: ['shin', 'feet'],
      rows: [
        r(1, 'Minor', 0, 'Graze', 'Physical Checks at Disadvantage until the end of the next round.', graze()),
        r(2, 'Serious', 1, 'Leg / foot wound', 'Speed Checks at Disadvantage until 1 Long Rest.', outcome([], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(3, 'Serious', 1, 'Knee / ankle wound', 'Knocked down. Speed Checks at Disadvantage until 1 Long Rest.', outcome([DOWN], [rest('leg', 'Leg', { rolls: [dis('speed')] })])),
        r(4, 'Severe', 2, 'Shattered knee, shin or ankle', 'Crawl only without help until 1 Long Rest. After 1 Long Rest: walking is possible, with Speed Checks at Disadvantage until 2 Long Rests. After 2 Long Rests: walks with a limp, lasting `-10 Speed` and `-10 Charm` at GM discretion.', shatteredLeg(), MORE),
      ],
    },
  ],
}

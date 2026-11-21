/**
 * Asking Jev whether a stretch of the table's talk holds a rules question,
 * and what that question needs.
 *
 * Jev is TypeSafe's classifier: it is given a JSON state and typed questions,
 * and answers each with a probability. It does not write text. Each window is
 * asked one yes-or-no question, whether it holds a new rules question, and the
 * probability of yes comes back. For a rule set whose rules have parts sent
 * only when a question needs them, the same request asks, of each part,
 * whether the question needs something in it; each is answered on its own.
 *
 * The bot posts its answers in the text channel, so they are not in the
 * transcript. Jev is shown every answer posted in the session beside it, so
 * that a question the bot has already answered is not taken for a new one.
 */
import type { Supplement } from './books.ts'
import { postJson } from './http.ts'
import { postedAnswersText, transcriptText, type PostedAnswer, type TranscriptLine } from './transcriptWindow.ts'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
export const JEV_MODEL = 'jev-latest'
const JEV_TIMEOUT_MS = 5_000

const SETTING =
  'A group is playing a tabletop role-playing game together over voice chat. One of them is the game master (GM), who runs the game; the others are players. ' +
  '`transcript` is a live, imperfect speech-to-text transcript of the last minute or so of the table, oldest line first. ' +
  'Each line starts with the name of the person speaking. Words may be misheard, and lines from different people can interleave. ' +
  'A bot at the table answers rules questions in the text chat; `rules_answers_this_session` is every rules answer it has posted in this session. ' +
  'Those answers are not in the transcript.'

const QUESTION =
  "Judging by the end of the transcript, is someone at the table asking a new question about the game's rules that the bot's rules answers this session do not already cover, and that nobody has answered yet?"

const CRITERIA = {
  true:
    'Someone asks how a rule of the game works or what the rules allow: combat, actions, attacks, dice rolls and what to add to them, damage, wounds, healing, movement, conditions, ' +
    'spells, monsters and creatures, magic items, equipment, weapons, armor, treasure, or other game mechanics. ' +
    "Nobody has answered it later in the transcript, and the bot's rules answers this session do not already answer it. " +
    'It need not be phrased as a question: wondering aloud about a rule counts as asking, and so does the GM or a player saying they forget, ' +
    'do not know or are not sure how the rules handle the situation at hand. A follow-up that asks something those answers did not cover counts too.',
  false:
    'Nobody is asking about the rules. In-character talk, the story, planning what to do, asking someone what they want to do, ' +
    'the GM asking for a roll, small talk and anything outside the game are not rules questions. ' +
    'A rules question that someone has already answered later in the transcript does not count either, ' +
    "nor does one the bot's rules answers this session already cover: that is not a new rules question, even when it is asked again in other words, much later, or is still being talked about.",
}

type JevQuestion = { type: 'noul'; instructions: string; criteria: { true: string; false: string } }

/**
 * What is asked of each part of the rules sent only when needed. Jev cannot
 * know what the core rules hold, so each names the things it can hear asked
 * about. Each is asked on its own, beside the rules question: a question can
 * need both, or neither.
 */
const NEEDS: Record<Supplement, { name: string; question: JevQuestion }> = {
  monsters: {
    name: 'monster_question',
    question: {
      type: 'noul',
      instructions:
        'Judging by the end of the transcript, does the new rules question being asked there need the game statistics or abilities of a particular monster or creature?',
      criteria: {
        true:
          'The new rules question at the end of the transcript is about a particular monster, creature, animal or kind of foe, named or described ' +
          '(a goblin, an ogre, a dragon, the giant spider, the ghoul that just hit me): its armor class, hit dice, hit points, attacks, damage, movement, ' +
          'saving throws, morale, alignment, how many appear or what treasure it has, or how one of its special abilities works ' +
          "(a ghoul's paralysis, a wight's level drain, a basilisk's gaze, a dragon's breath), what harms it or what it is immune to. " +
          'A rule applied to a particular creature counts too, when its statistics or abilities decide the answer ' +
          '(can I turn that wight, does sleep work on an ogre). So does asking what might be met in a dungeon or the wilderness.',
        false:
          'There is no new rules question at the end of the transcript, or the question is about how a rule works in general ' +
          '(how combat, saving throws, morale or turning the undead work) without needing any particular creature, ' +
          "or it is only about a player character, a spell, an item or the characters' own abilities.",
      },
    },
  },
  spellsAndItems: {
    name: 'spell_or_item_question',
    question: {
      type: 'noul',
      instructions:
        'Judging by the end of the transcript, does the new rules question being asked there need the details of a particular spell, magic item, ' +
        'piece of equipment, weapon, armor, mount, vehicle or treasure?',
      criteria: {
        true:
          'The new rules question at the end of the transcript is about a particular spell (sleep, magic missile, fireball, cure light wounds, light), ' +
          'a magic item (a potion, a scroll, a ring, a wand, a staff, a bag of holding, a +1 sword, magic armor), ' +
          'a piece of equipment, weapon or armor (a longbow, a crossbow, a dagger, chain mail, a shield, rope, a lantern, rations), ' +
          'a mount or vehicle (a horse, a mule, a cart, a boat, a ship), or treasure (gems, jewellery, what a treasure type holds): ' +
          'what it does, its range, duration or area, its damage, its cost or weight, its armor class, how far it carries or travels, or how it works. ' +
          'Asking which spells there are at a level, what a spell list holds, what can be bought or what something costs counts too.',
        false:
          'There is no new rules question at the end of the transcript, or the question is about how a rule works in general ' +
          '(how casting and memorising spells, encumbrance, combat or movement work) without needing any particular spell, item, weapon, armor, mount, vehicle or treasure, ' +
          'or it is only about a creature.',
      },
    },
  },
}

export type JevRequest = {
  model: string
  state: { setting: string; rules_answers_this_session: string; transcript: string }
  questions: Record<string, JevQuestion>
}

/**
 * The request for one window, with every rules answer the bot has posted in
 * the session. Beside the rules question, it asks whether that question needs
 * each of the parts in `supplements`.
 */
export function jevRequest(window: readonly TranscriptLine[], posted: readonly PostedAnswer[], supplements: readonly Supplement[] = []): JevRequest {
  const questions: Record<string, JevQuestion> = { rules_question: { type: 'noul', instructions: QUESTION, criteria: CRITERIA } }
  for (const supplement of supplements) questions[NEEDS[supplement].name] = NEEDS[supplement].question
  return {
    model: JEV_MODEL,
    state: { setting: SETTING, rules_answers_this_session: postedAnswersText(posted), transcript: transcriptText(window) },
    questions,
  }
}

/** What Jev made of a window: how likely it holds a new rules question, and how likely that question needs each part asked about. */
export type JevVerdict = { rulesQuestion: number; needs: Partial<Record<Supplement, number>> }

function probabilityOf(body: unknown, name: string, what: string): number {
  const probability = (body as { answers?: Record<string, { noul?: unknown } | undefined> } | null)?.answers?.[name]?.noul
  if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) throw new Error(`Jev gave no probability for ${what}.`)
  return probability
}

/** Jev's probabilities that the window holds a rules question nobody has answered, and that it needs each of `supplements`. */
export function jevVerdict(body: unknown, supplements: readonly Supplement[] = []): JevVerdict {
  const needs: JevVerdict['needs'] = {}
  for (const supplement of supplements) needs[supplement] = probabilityOf(body, NEEDS[supplement].name, `the ${NEEDS[supplement].name}`)
  return { rulesQuestion: probabilityOf(body, 'rules_question', 'the rules question'), needs }
}

export type AskJev = (window: readonly TranscriptLine[], posted: readonly PostedAnswer[], supplements: readonly Supplement[]) => Promise<JevVerdict>

/** Asks the real Jev, through TypeSafe's API. */
export function typesafeJev({ apiKey, fetch }: { apiKey: string; fetch?: typeof globalThis.fetch }): AskJev {
  return async (window, posted, supplements) => {
    const body = jevRequest(window, posted, supplements)
    return jevVerdict(await postJson({ service: 'TypeSafe', url: JEV_URL, apiKey, body, timeoutMs: JEV_TIMEOUT_MS, fetch }), supplements)
  }
}

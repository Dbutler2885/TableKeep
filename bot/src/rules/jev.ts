/**
 * Asking Jev whether a stretch of the table's talk holds a rules question.
 *
 * Jev is TypeSafe's classifier: it is given a JSON state and typed questions,
 * and answers each with a probability. It does not write text. One yes-or-no
 * question is asked of each window, and the probability of yes comes back.
 *
 * The bot posts its answers in the text channel, so they are not in the
 * transcript. Jev is shown every answer posted in the session beside it, so
 * that a question the bot has already answered is not taken for a new one.
 */
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
    'Someone asks how a rule of the game works or what the rules allow: combat, actions, attacks, dice rolls and what to add to them, damage, wounds, healing, movement, conditions, equipment, or other game mechanics. ' +
    "Nobody has answered it later in the transcript, and the bot's rules answers this session do not already answer it. " +
    'It need not be phrased as a question: wondering aloud about a rule counts as asking, and so does the GM or a player saying they forget, ' +
    'do not know or are not sure how the rules handle the situation at hand. A follow-up that asks something those answers did not cover counts too.',
  false:
    'Nobody is asking about the rules. In-character talk, the story, planning what to do, asking someone what they want to do, ' +
    'the GM asking for a roll, small talk and anything outside the game are not rules questions. ' +
    'A rules question that someone has already answered later in the transcript does not count either, ' +
    "nor does one the bot's rules answers this session already cover: that is not a new rules question, even when it is asked again in other words, much later, or is still being talked about.",
}

export type JevRequest = {
  model: string
  state: { setting: string; rules_answers_this_session: string; transcript: string }
  questions: { rules_question: { type: 'noul'; instructions: string; criteria: typeof CRITERIA } }
}

/** The request for one window, with every rules answer the bot has posted in the session. */
export function jevRequest(window: readonly TranscriptLine[], posted: readonly PostedAnswer[]): JevRequest {
  return {
    model: JEV_MODEL,
    state: { setting: SETTING, rules_answers_this_session: postedAnswersText(posted), transcript: transcriptText(window) },
    questions: { rules_question: { type: 'noul', instructions: QUESTION, criteria: CRITERIA } },
  }
}

/** Jev's probability that the window holds a rules question nobody has answered. */
export function jevProbability(body: unknown): number {
  const probability = (body as { answers?: { rules_question?: { noul?: unknown } } } | null)?.answers?.rules_question?.noul
  if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) throw new Error('Jev gave no probability for the rules question.')
  return probability
}

export type AskJev = (window: readonly TranscriptLine[], posted: readonly PostedAnswer[]) => Promise<number>

/** Asks the real Jev, through TypeSafe's API. */
export function typesafeJev({ apiKey, fetch }: { apiKey: string; fetch?: typeof globalThis.fetch }): AskJev {
  return async (window, posted) =>
    jevProbability(await postJson({ service: 'TypeSafe', url: JEV_URL, apiKey, body: jevRequest(window, posted), timeoutMs: JEV_TIMEOUT_MS, fetch }))
}

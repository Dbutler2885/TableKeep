/**
 * Asking Jev whether a stretch of the table's talk holds a rules question.
 *
 * Jev is TypeSafe's classifier: it is given a JSON state and typed questions,
 * and answers each with a probability. It does not write text. One yes-or-no
 * question is asked of each window, and the probability of yes comes back.
 *
 * The bot posts its answers in the text channel, so they are not in the
 * transcript. Jev is shown them beside it, so that a question the bot has
 * already answered is not taken for a new one.
 */
import { postJson } from './http.ts'
import { recentAnswersText, transcriptText, type RecentAnswer, type TranscriptLine } from './transcriptWindow.ts'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
export const JEV_MODEL = 'jev-latest'
const JEV_TIMEOUT_MS = 5_000

const SETTING =
  'A group is playing a tabletop role-playing game together over voice chat. One of them is the game master (GM), who runs the game; the others are players. ' +
  '`transcript` is a live, imperfect speech-to-text transcript of the last minute or so of the table, oldest line first. ' +
  'Each line starts with the name of the person speaking. Words may be misheard, and lines from different people can interleave. ' +
  'A bot at the table answers rules questions in the text chat; `recent_rules_answers` is what it has answered in the last few minutes. ' +
  'Those answers are not in the transcript.'

const QUESTION =
  "Judging by the end of the transcript, is someone at the table asking a new question about the game's rules that the bot's recent rules answers do not already cover, and that nobody has answered yet?"

const CRITERIA = {
  true:
    'Someone asks how a rule of the game works or what the rules allow: combat, actions, attacks, dice rolls and what to add to them, damage, wounds, healing, movement, conditions, equipment, or other game mechanics. ' +
    'Nobody has answered it later in the transcript, and the recent rules answers do not already answer it. ' +
    'It need not be phrased as a question: wondering aloud about a rule counts as asking, and so does the GM or a player saying they forget, ' +
    'do not know or are not sure how the rules handle the situation at hand. A follow-up that asks something the recent answers did not cover counts too.',
  false:
    'Nobody is asking about the rules. In-character talk, the story, planning what to do, asking someone what they want to do, ' +
    'the GM asking for a roll, small talk and anything outside the game are not rules questions. ' +
    'A rules question that someone has already answered later in the transcript does not count either, ' +
    'nor does one the recent rules answers already answer, even when it is asked again in other words or is still being talked about.',
}

export type JevRequest = {
  model: string
  state: { setting: string; recent_rules_answers: string; transcript: string }
  questions: { rules_question: { type: 'noul'; instructions: string; criteria: typeof CRITERIA } }
}

/** The request for one window, with the bot's recent answers. */
export function jevRequest(window: readonly TranscriptLine[], recent: readonly RecentAnswer[]): JevRequest {
  return {
    model: JEV_MODEL,
    state: { setting: SETTING, recent_rules_answers: recentAnswersText(recent), transcript: transcriptText(window) },
    questions: { rules_question: { type: 'noul', instructions: QUESTION, criteria: CRITERIA } },
  }
}

/** Jev's probability that the window holds a rules question nobody has answered. */
export function jevProbability(body: unknown): number {
  const probability = (body as { answers?: { rules_question?: { noul?: unknown } } } | null)?.answers?.rules_question?.noul
  if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) throw new Error('Jev gave no probability for the rules question.')
  return probability
}

export type AskJev = (window: readonly TranscriptLine[], recent: readonly RecentAnswer[]) => Promise<number>

/** Asks the real Jev, through TypeSafe's API. */
export function typesafeJev({ apiKey, fetch }: { apiKey: string; fetch?: typeof globalThis.fetch }): AskJev {
  return async (window, recent) =>
    jevProbability(await postJson({ service: 'TypeSafe', url: JEV_URL, apiKey, body: jevRequest(window, recent), timeoutMs: JEV_TIMEOUT_MS, fetch }))
}

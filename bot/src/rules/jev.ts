/**
 * Asking Jev whether a stretch of the table's talk holds a rules question.
 *
 * Jev is TypeSafe's classifier: it is given a JSON state and typed questions,
 * and answers each with a probability. It does not write text. One yes-or-no
 * question is asked of each window, and the probability of yes comes back.
 */
import { transcriptText, type TranscriptLine } from './transcriptWindow.ts'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
export const JEV_MODEL = 'jev-latest'
const JEV_TIMEOUT_MS = 5_000

const SETTING =
  'A group is playing a tabletop role-playing game together over voice chat. One of them is the game master (GM), who runs the game; the others are players. ' +
  '`transcript` is a live, imperfect speech-to-text transcript of the last minute or so of the table, oldest line first. ' +
  'Each line starts with the name of the person speaking. Words may be misheard, and lines from different people can interleave.'

const QUESTION =
  "Judging by the end of the transcript, is someone at the table asking a question about the game's rules that nobody has answered yet?"

const CRITERIA = {
  true:
    'Someone asks how a rule of the game works or what the rules allow: combat, actions, attacks, dice rolls and what to add to them, damage, wounds, healing, movement, conditions, equipment, or other game mechanics. ' +
    'Nobody has answered it later in the transcript. Wondering aloud about a rule counts as asking.',
  false:
    'Nobody is asking about the rules. In-character talk, the story, planning what to do, asking someone what they want to do, ' +
    'the GM asking for a roll, small talk and anything outside the game are not rules questions. ' +
    'A rules question that someone has already answered later in the transcript does not count either.',
}

export type JevRequest = {
  model: string
  state: { setting: string; transcript: string }
  questions: { rules_question: { type: 'noul'; instructions: string; criteria: typeof CRITERIA } }
}

/** The request for one window. */
export function jevRequest(window: readonly TranscriptLine[]): JevRequest {
  return {
    model: JEV_MODEL,
    state: { setting: SETTING, transcript: transcriptText(window) },
    questions: { rules_question: { type: 'noul', instructions: QUESTION, criteria: CRITERIA } },
  }
}

/** Jev's probability that the window holds a rules question nobody has answered. */
export function jevProbability(body: unknown): number {
  const probability = (body as { answers?: { rules_question?: { noul?: unknown } } } | null)?.answers?.rules_question?.noul
  if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) throw new Error('Jev gave no probability for the rules question.')
  return probability
}

export type AskJev = (window: readonly TranscriptLine[]) => Promise<number>

/** Asks the real Jev, through TypeSafe's API. */
export function typesafeJev({ apiKey, fetch: request = fetch }: { apiKey: string; fetch?: typeof fetch }): AskJev {
  return async (window) => {
    let response: Response
    try {
      response = await request(JEV_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(jevRequest(window)),
        signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
      })
    } catch (error) {
      // Only the kind of failure is passed on: the error itself can carry the request, key and all.
      throw new Error(`TypeSafe could not be reached (${(error as Error)?.name === 'TimeoutError' ? 'no answer in time' : 'connection failed'}).`)
    }
    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403 ? '' : (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`TypeSafe answered ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return jevProbability(await response.json())
  }
}

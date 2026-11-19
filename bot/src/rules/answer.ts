/**
 * Answering a rules question from the group's rules document.
 *
 * The whole document goes to the model with the stretch of transcript the
 * question was heard in. The document is the instructions' fixed tail, so
 * every request in a session starts with the same long prefix and the
 * service can reuse it. Parts of the rules sent only when a question needs
 * them follow the document, always in the same order, so that prefix holds
 * whichever are sent. The answer comes back in a fixed shape, so the bot
 * decides how it reads in Discord and can tell when there was no question.
 */
import { SUPPLEMENTS, type Supplement } from './books.ts'
import { postJson } from './http.ts'
import { postedAnswersText, transcriptText, type PostedAnswer, type TranscriptLine } from './transcriptWindow.ts'

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
export const RULES_ANSWER_MODEL = 'gpt-6-luna'
const ANSWER_TIMEOUT_MS = 60_000
/**
 * How hard the model thinks before answering. On the captain's racing question
 * and on initiative, answers without reasoning kept every step, number and the
 * worked example as well as those with low or default reasoning did, and came
 * back in about 2.6 seconds instead of 3.5 or 5.
 */
const ANSWER_REASONING = 'none'
/** Room for the model's own reasoning as well as a whole procedure with its worked example. */
const MAX_OUTPUT_TOKENS = 12_000

const GUIDANCE = `You answer rules questions for a group playing a tabletop role-playing game, while they play.

You are given the group's rules document, below, a stretch of the live transcript of the table, and every rules answer you have already posted in this session. The transcript is speech-to-text and imperfect: words may be misheard. Each line starts with the speaker's name. Your earlier answers were posted in the text chat, so they are not in the transcript.

Find the latest rules question in the transcript that nobody has answered yet and that your earlier answers do not already cover, and answer it from the rules document alone. A follow-up that asks something your earlier answers did not cover is a new question. A player asking the GM whether their character may do something in the story ("can I climb it?", "can I open the door?") is a request to the GM, not a rules question.

- Give the whole procedure the rules document sets out for the question: every step, in order, with every number it uses (dice, targets, modifiers, distances, limits) and every condition or exception that applies, and the document's worked example when it has one.
- Word it concisely, but never summarise in a way that drops a step, a number or a condition. A short answer that leaves the table unable to play it out is wrong.
- Give the document's worked example after the steps, in full, with its numbers.
- Write it for Discord: numbered steps or short bullet points, with **bold** for the key numbers. No headings and no tables.
- In "section", name the section of the rules document your answer comes from, as the document titles it.
- If the document does not cover the question, set "kind" to "not_covered" and say plainly that the rules document does not cover it.
- If the document says the rule is not decided yet (for example it is marked as undecided, to be decided, TBD or an open question), set "kind" to "not_decided" and say that the rule is not decided yet, with whatever the document does say about it.
- Never guess beyond the document. Do not fill a gap from other games, editions or general knowledge.
- If nobody in the transcript is asking a rules question that is still unanswered, or your earlier answers in this session already answer it, even asked again in other words or much later, set "kind" to "no_question" and leave the other fields empty.

# The rules document

`

export type RulesAnswer = {
  kind: 'answered' | 'not_covered' | 'not_decided' | 'no_question'
  /** The question as it was asked, shortened, in the asker's words. */
  question: string
  askedBy: string
  answer: string
  /** The section of the rules document the answer comes from, or empty. */
  section: string
}

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'question', 'asked_by', 'answer', 'section'],
  properties: {
    kind: { type: 'string', enum: ['answered', 'not_covered', 'not_decided', 'no_question'] },
    question: { type: 'string', description: "The rules question as it was asked, shortened, in the asker's own words." },
    asked_by: { type: 'string', description: 'The name of the person who asked it, as the transcript gives it.' },
    answer: {
      type: 'string',
      description: "The whole procedure from the rules document: every step, every number, and the document's worked example when it has one, as Discord markdown.",
    },
    section: { type: 'string', description: 'The section of the rules document the answer comes from, as the document titles it; empty if none.' },
  },
} as const

export type AnswerRequest = {
  model: string
  instructions: string
  input: string
  text: { format: { type: 'json_schema'; name: 'rules_answer'; strict: true; schema: typeof ANSWER_SCHEMA } }
  max_output_tokens: number
  reasoning: { effort: 'none' }
  store: false
}

/** The request for one rules question: the document in the instructions, the earlier answers and the window as the input. */
export function answerRequest(
  rulesDocument: string,
  window: readonly TranscriptLine[],
  posted: readonly PostedAnswer[],
  model = RULES_ANSWER_MODEL,
): AnswerRequest {
  return {
    model,
    instructions: `${GUIDANCE}${rulesDocument.trim()}\n`,
    input: `Your rules answers in this session, oldest first:\n\n${postedAnswersText(posted)}\n\nThe transcript, oldest line first:\n\n${transcriptText(window)}`,
    text: { format: { type: 'json_schema', name: 'rules_answer', strict: true, schema: ANSWER_SCHEMA } },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    reasoning: { effort: ANSWER_REASONING },
    store: false,
  }
}

type ResponsesBody = {
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[]
}

/** Why a reply holds no text. */
function whyNoText(reply: ResponsesBody): string {
  if (reply.status !== 'incomplete') return 'it wrote no text'
  return `it stopped early (${reply.incomplete_details?.reason ?? 'no reason given'})`
}

/** The text of a reply's message, or why there is none. */
function answerText(reply: ResponsesBody): string {
  const content = (reply.output ?? []).filter((item) => item.type === 'message').flatMap((item) => item.content ?? [])
  if (content.some((part) => part.type === 'refusal')) throw new Error('The model refused to answer.')
  const text = content.find((part) => part.type === 'output_text')?.text
  if (!text) throw new Error(`The model gave no answer: ${whyNoText(reply)}.`)
  return text
}

const KINDS: readonly string[] = ['answered', 'not_covered', 'not_decided', 'no_question']

/** Reads the answer out of a Responses API reply. */
export function readAnswer(body: unknown): RulesAnswer {
  const parsed = JSON.parse(answerText(body as ResponsesBody)) as Record<string, unknown>
  if (!KINDS.includes(parsed.kind as string)) throw new Error('The model gave an answer of no known kind.')
  const field = (name: string) => (typeof parsed[name] === 'string' ? parsed[name].trim() : '')
  return {
    kind: parsed.kind as RulesAnswer['kind'],
    question: field('question'),
    askedBy: field('asked_by'),
    answer: field('answer'),
    section: field('section'),
  }
}

/** Answers the question in a window, from the rules document and the parts of the rules in `needs`. */
export type AnswerRulesQuestion = (window: readonly TranscriptLine[], posted: readonly PostedAnswer[], needs?: readonly Supplement[]) => Promise<RulesAnswer>

/** The rules document with those of `supplements` that are in `needs` after it, in their fixed order. */
export function withSupplements(rulesDocument: string, supplements: Partial<Record<Supplement, string>>, needs: readonly Supplement[]): string {
  const parts = SUPPLEMENTS.filter((supplement) => needs.includes(supplement)).flatMap((supplement) => supplements[supplement] ?? [])
  return [rulesDocument, ...parts].map((part) => part.trim()).join('\n\n')
}

/** Answers through OpenAI's Responses API. */
export function openAiRulesAnswerer({
  apiKey,
  rulesDocument,
  supplements = {},
  model = RULES_ANSWER_MODEL,
  fetch,
}: {
  apiKey: string
  rulesDocument: string
  /** Parts of the rules, by name, sent after the document when a question needs them. */
  supplements?: Partial<Record<Supplement, string>>
  model?: string
  fetch?: typeof globalThis.fetch
}): AnswerRulesQuestion {
  return async (window, posted, needs = []) => {
    const body = answerRequest(withSupplements(rulesDocument, supplements, needs), window, posted, model)
    return readAnswer(await postJson({ service: 'OpenAI', url: OPENAI_RESPONSES_URL, apiKey, body, timeoutMs: ANSWER_TIMEOUT_MS, fetch }))
  }
}

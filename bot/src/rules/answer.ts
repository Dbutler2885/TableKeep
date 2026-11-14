/**
 * Answering a rules question from the group's rules document.
 *
 * The whole document goes to the model with the stretch of transcript the
 * question was heard in. The document is the instructions' fixed tail, so
 * every request in a session starts with the same long prefix and the
 * service can reuse it. The answer comes back in a fixed shape, so the bot
 * decides how it reads in Discord and can tell when there was no question.
 */
import { transcriptText, type TranscriptLine } from './transcriptWindow.ts'

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
export const RULES_ANSWER_MODEL = 'gpt-6-luna'
const ANSWER_TIMEOUT_MS = 60_000
/** Room for the model's own reasoning as well as the short answer. */
const MAX_OUTPUT_TOKENS = 4_000

const GUIDANCE = `You answer rules questions for a group playing a tabletop role-playing game, while they play.

You are given the group's rules document, below, and a stretch of the live transcript of the table. The transcript is speech-to-text and imperfect: words may be misheard. Each line starts with the speaker's name.

Find the most recent rules question in the transcript that nobody has answered yet, and answer it from the rules document alone.

- Answer in at most three short sentences of plain text, the way you would say it across the table.
- In "section", name the section of the rules document your answer comes from, as the document titles it.
- If the document does not cover the question, set "kind" to "not_covered" and say plainly that the rules document does not cover it.
- If the document says the rule is not decided yet (for example it is marked as undecided, to be decided, TBD or an open question), set "kind" to "not_decided" and say that the rule is not decided yet, with whatever the document does say about it.
- Never guess beyond the document. Do not fill a gap from other games, editions or general knowledge.
- If nobody in the transcript is asking a rules question that is still unanswered, set "kind" to "no_question" and leave the other fields empty.

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
    answer: { type: 'string', description: 'The answer, in at most three short sentences.' },
    section: { type: 'string', description: 'The section of the rules document the answer comes from, as the document titles it; empty if none.' },
  },
} as const

export type AnswerRequest = {
  model: string
  instructions: string
  input: string
  text: { format: { type: 'json_schema'; name: 'rules_answer'; strict: true; schema: typeof ANSWER_SCHEMA } }
  max_output_tokens: number
  store: false
}

/** The request for one rules question: the document in the instructions, the window as the input. */
export function answerRequest(rulesDocument: string, window: readonly TranscriptLine[], model = RULES_ANSWER_MODEL): AnswerRequest {
  return {
    model,
    instructions: `${GUIDANCE}${rulesDocument.trim()}\n`,
    input: `The transcript, oldest line first:\n\n${transcriptText(window)}`,
    text: { format: { type: 'json_schema', name: 'rules_answer', strict: true, schema: ANSWER_SCHEMA } },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  }
}

type ResponsesBody = {
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[]
}

/** Reads the answer out of a Responses API reply. */
export function readAnswer(body: unknown): RulesAnswer {
  const reply = body as ResponsesBody
  const content = (reply.output ?? []).filter((item) => item.type === 'message').flatMap((item) => item.content ?? [])
  const refusal = content.find((part) => part.type === 'refusal')
  if (refusal) throw new Error('The model refused to answer.')
  const text = content.find((part) => part.type === 'output_text')?.text
  if (!text) {
    const why = reply.status === 'incomplete' ? `it stopped early (${reply.incomplete_details?.reason ?? 'no reason given'})` : 'it wrote no text'
    throw new Error(`The model gave no answer: ${why}.`)
  }
  const parsed = JSON.parse(text) as Record<string, unknown>
  const kinds = ['answered', 'not_covered', 'not_decided', 'no_question']
  if (typeof parsed.kind !== 'string' || !kinds.includes(parsed.kind)) throw new Error('The model gave an answer of no known kind.')
  const field = (name: string) => (typeof parsed[name] === 'string' ? (parsed[name] as string).trim() : '')
  return {
    kind: parsed.kind as RulesAnswer['kind'],
    question: field('question'),
    askedBy: field('asked_by'),
    answer: field('answer'),
    section: field('section'),
  }
}

export type AnswerRulesQuestion = (window: readonly TranscriptLine[]) => Promise<RulesAnswer>

/** Answers through OpenAI's Responses API. */
export function openAiRulesAnswerer({
  apiKey,
  rulesDocument,
  model = RULES_ANSWER_MODEL,
  fetch: request = fetch,
}: {
  apiKey: string
  rulesDocument: string
  model?: string
  fetch?: typeof fetch
}): AnswerRulesQuestion {
  return async (window) => {
    let response: Response
    try {
      response = await request(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(answerRequest(rulesDocument, window, model)),
        signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
      })
    } catch (error) {
      throw new Error(`OpenAI could not be reached (${(error as Error)?.name === 'TimeoutError' ? 'no answer in time' : 'connection failed'}).`)
    }
    if (!response.ok) {
      // A refused key is named in part in the reply, so a refusal is reported without it.
      const detail = response.status === 401 || response.status === 403 ? '' : (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`OpenAI answered ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return readAnswer(await response.json())
  }
}

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
 * How hard the model thinks before answering. Kept at `none` for low latency;
 * lean schema and prompt rules keep answers tight and scannable.
 */
const ANSWER_REASONING = 'none'
/** Room for a tight JSON card (~120 words max) without runaway multi-paragraph essays. */
export const MAX_OUTPUT_TOKENS = 1_200

const GUIDANCE = `You post ultra-lean rules lookups in Discord for a live tabletop role-playing game session.

You are given the group's rules document below, a stretch of live speech-to-text transcript (imperfect: words may be misheard), and every rules answer you have already posted in this session. Each transcript line starts with the speaker's name; when the GM is identified, their lines are marked "(GM)". Your earlier answers were posted in text chat, so they are not in the transcript.

Decide whether there is an unanswered rules question at the end of the transcript that your earlier answers do not already cover. When lines are marked "(GM)", answer only an unanswered rules question the GM is asking, wondering aloud about, or uncertain of (including a player's concrete rules question that the GM echoes or says they do not know or need to check). A follow-up that asks something your earlier answers did not cover is a new question.

Set "kind" to "no_question" (and leave all other fields empty) if:
- Nobody is asking an unanswered rules question, or your earlier answers in this session already cover it (even asked again in other words or much later).
- A player is asking the GM for a situational ruling, permission, or judgment call ("can I climb it?", "can I open the door?", "can I use Teacher's Pet?", "can I use Politician?", "do I have advantage or disadvantage?", "what do I roll?") and the GM has not asked to look up a rule.
- The GM is simply narrating, calling for a roll, making a ruling, or answering a player's question.

When answering from the rules document alone:
- Answer ONLY what was asked. Never re-explain baseline mechanics the table already knows (such as how Stat Checks or Saves roll d100, failed-Check Stress, Overachiever +2 Stress, or "When to roll") unless the question is specifically about them.
- Keep every required step, die, threshold, modifier, tiebreaker, and exception for the asked rule. Never drop a mechanical fact needed to run it, and never guess beyond the document. Do not fill a gap from other games, editions, or general knowledge.
- Format as 2 to 5 short bullet points (or numbered steps when order matters) with **bold** for key dice, numbers, and outcomes. Target 25-80 words (hard cap ~120 words even for multi-step combat procedures). No prose paragraphs, no headings, no tables.
- Never include worked examples unless the GM explicitly asks for an example. Never write meta-commentary such as "The document gives no worked example", "The GM must judge...", or "The GM decides whether a roll is needed...".
- Set "title" to a short 1-5 word rule label (for example "Panic Check", "Politician", "Initiative").
- Set "section" to the section heading of the rules document your answer comes from, as the document titles it.
- If the document does not cover the question, set "kind" to "not_covered" and say so plainly in 1 short sentence (<= 25 words), with no filler from other sections.
- If the document marks the rule as not decided yet (undecided, TBD, or an open question), set "kind" to "not_decided" and state that plus any brief recommendation in 1 short sentence (<= 25 words), with no filler from other sections.

# The rules document

`

export type RulesAnswer = {
  kind: 'answered' | 'not_covered' | 'not_decided' | 'no_question'
  /** Short 1-5 word rule label for the Discord card header (e.g. "Panic Check"), or empty. */
  title: string
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
  required: ['kind', 'title', 'question', 'asked_by', 'answer', 'section'],
  properties: {
    kind: { type: 'string', enum: ['answered', 'not_covered', 'not_decided', 'no_question'] },
    title: {
      type: 'string',
      description: 'Short 1-5 word rule label (e.g. "Panic Check", "Teacher\'s Pet", "Initiative"); empty if no_question.',
    },
    question: { type: 'string', description: "The rules question as it was asked, shortened, in the asker's own words." },
    asked_by: { type: 'string', description: 'The name of the person who asked it, as the transcript gives it without "(GM)".' },
    answer: {
      type: 'string',
      description:
        'Concise, scannable Discord markdown bullets (2-5 short bullets, target 25-80 words, max ~120 words) for "answered", or 1 short sentence (<= 25 words) for "not_covered" or "not_decided". Answer ONLY the asked rule with **bold** key dice, numbers, and outcomes. No prose paragraphs, no worked examples unless asked, no meta-commentary.',
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
    title: field('title'),
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

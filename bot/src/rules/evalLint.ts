/**
 * Mechanical quality checks and evaluation runner helpers for rules-bot fixtures.
 *
 * Used by `bot/scripts/rules-eval.ts` (opt-in live calibration against Jev + Luna)
 * and pinned by `bot/test/rulesEval.test.ts` in CI so the fixture schema and
 * Neon brevity/clarity guardrails never drift.
 */
import { rulesAnswerMessages } from '../discord/replies.ts'
import type { AnswerRulesQuestion, RulesAnswer } from './answer.ts'
import { readRulesBook, RULES_BOOKS, type RuleSet, type RulesBook, type Supplement } from './books.ts'
import type { AskJev } from './jev.ts'
import { SESSION_SAMPLE_RATE, type PostedAnswer, type TranscriptLine } from './transcriptWindow.ts'
import { SUPPLEMENT_THRESHOLD } from './watcher.ts'

export type EvalLine = { speaker: string; isGm?: boolean; text: string }

export type RulesEvalCase = {
  id: string
  ruleSet: RuleSet
  gmKnown: boolean
  posted?: PostedAnswer[]
  lines: EvalLine[]
  /** Whether a GM-gated watcher should wake Jev on the final line. */
  expectWatcherTriggers: boolean
  /** Whether Jev should flag the window at or above threshold (when called). */
  expectJevTrigger: boolean
  /** Expected supplements (for OSE cases). */
  expectSupplements?: Supplement[]
  /** Allowed `kind` values from the answering model. */
  expectKinds: RulesAnswer['kind'][]
  /** Hard word ceiling on `answer` when an answer is posted. */
  maxWords?: number
  /** Substrings (case-insensitive) that must appear in `answer` when answered. */
  requiredTerms?: string[]
  /** Substrings (case-insensitive) forbidden in `answer` (e.g. unasked boilerplate). */
  forbiddenTerms?: string[]
}

export type LoadedEvalBook = {
  book: RulesBook
  document: string
  supplements: Partial<Record<Supplement, string>>
  supplementNames: Supplement[]
}

export type EvalCaseOutcome = {
  probability: number
  answer: RulesAnswer
  failures: string[]
}

const BANNED_META_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'worked-example meta-commentary', pattern: /\b(worked example|the document gives no)\b/i },
  { label: 'unasked GM-roll philosophy', pattern: /\bthe GM decides whether a roll is needed\b/i },
  { label: 'unasked GM-must-judge filler', pattern: /\bthe GM must judge\b/i },
]

/** Maximum length of a single non-bullet prose line before it counts as a wall of text. */
const MAX_PROSE_PARAGRAPH_CHARS = 300
const DEFAULT_EVAL_THRESHOLD = 0.8

/** Converts fixture lines into a timeline-ordered `TranscriptLine[]` window. */
export function evalWindow(lines: readonly EvalLine[]): TranscriptLine[] {
  return lines.map((line, index) => ({
    speaker: line.speaker,
    isGm: line.isGm ?? false,
    startSamples: index * 3 * SESSION_SAMPLE_RATE,
    endSamples: (index * 3 + 2) * SESSION_SAMPLE_RATE,
    text: line.text,
  }))
}

/** Word count of an answer string. */
export function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Whether an answered reply contains an unbroken prose block longer than the table-scannability ceiling. */
function hasWallOfProse(answer: string): boolean {
  return answer
    .split('\n')
    .some((line) => !/^\s*(?:[-*]|\d+\.)\s/.test(line) && line.trim().length > MAX_PROSE_PARAGRAPH_CHARS)
}

function lengthIssues(evalCase: RulesEvalCase, reply: RulesAnswer): string[] {
  const issues: string[] = []
  const words = wordCount(reply.answer)
  if (evalCase.maxWords !== undefined && words > evalCase.maxWords) {
    issues.push(`too long: ${words} words > max ${evalCase.maxWords}`)
  }
  if (reply.kind === 'answered' && hasWallOfProse(reply.answer)) {
    issues.push(`contains unbroken prose line over ${MAX_PROSE_PARAGRAPH_CHARS} chars`)
  }
  return issues
}

function missingTerms(answer: string, terms: readonly string[] | undefined): string[] {
  const lower = answer.toLowerCase()
  return (terms ?? []).filter((term) => !lower.includes(term.toLowerCase())).map((term) => `missing required term "${term}"`)
}

function forbiddenTerms(answer: string, terms: readonly string[] | undefined): string[] {
  const lower = answer.toLowerCase()
  return (terms ?? []).filter((term) => lower.includes(term.toLowerCase())).map((term) => `contains forbidden term "${term}"`)
}

function checkMetaCommentary(answer: string): string[] {
  return BANNED_META_PATTERNS.filter(({ pattern }) => pattern.test(answer)).map(({ label }) => `contains ${label}`)
}

/**
 * Checks a model's `RulesAnswer` against a fixture's Neon quality rubric.
 * Returns a list of failure descriptions; empty means the answer passed.
 */
export function lintRulesAnswer(evalCase: RulesEvalCase, reply: RulesAnswer): string[] {
  const kindIssue = evalCase.expectKinds.includes(reply.kind)
    ? []
    : [`kind "${reply.kind}" not in expected [${evalCase.expectKinds.join(', ')}]`]
  if (reply.kind === 'no_question') return kindIssue
  return [
    ...kindIssue,
    ...lengthIssues(evalCase, reply),
    ...checkMetaCommentary(reply.answer),
    ...missingTerms(reply.answer, evalCase.requiredTerms),
    ...forbiddenTerms(reply.answer, evalCase.forbiddenTerms),
  ]
}

/** Selects all fixtures, or those whose id contains `filter`. */
export function filterEvalCases(cases: readonly RulesEvalCase[], filter: string): RulesEvalCase[] {
  return filter ? cases.filter((item) => item.id.includes(filter)) : [...cases]
}

/** Reads a rule set's document and supplements from under `root`. */
export function loadEvalBook(root: string, ruleSet: RuleSet, books: Partial<Record<RuleSet, RulesBook>> = RULES_BOOKS): LoadedEvalBook {
  const book = books[ruleSet]!
  const document = readRulesBook(root, book)
  const supplements = Object.fromEntries(
    Object.entries(book.supplements ?? {}).map(([name, part]) => [name, readRulesBook(root, part)]),
  ) as Partial<Record<Supplement, string>>
  return { book, document, supplements, supplementNames: Object.keys(supplements) as Supplement[] }
}

function triggerIssues(evalCase: RulesEvalCase, probability: number, threshold: number): string[] {
  const triggered = probability >= threshold
  return triggered === evalCase.expectJevTrigger
    ? []
    : [`Jev ${probability.toFixed(2)} (triggered=${triggered}, expected=${evalCase.expectJevTrigger})`]
}

/** Runs one evaluation case against Jev and an answering model and returns its lint results. */
export async function evaluateRulesCase({
  evalCase,
  supplementNames,
  askJev,
  answer,
  threshold = DEFAULT_EVAL_THRESHOLD,
}: {
  evalCase: RulesEvalCase
  supplementNames: readonly Supplement[]
  askJev: AskJev
  answer: AnswerRulesQuestion
  threshold?: number
}): Promise<EvalCaseOutcome> {
  const window = evalWindow(evalCase.lines)
  const posted = evalCase.posted ?? []
  const verdict = await askJev(window, posted, supplementNames, { gmKnown: evalCase.gmKnown })
  const needs = supplementNames.filter((name) => (verdict.needs[name] ?? 0) >= SUPPLEMENT_THRESHOLD)
  const reply = await answer(window, posted, needs)
  const failures = [...triggerIssues(evalCase, verdict.rulesQuestion, threshold), ...lintRulesAnswer(evalCase, reply)]
  return { probability: verdict.rulesQuestion, answer: reply, failures }
}

/** Formats one case outcome for terminal inspection during live calibration runs. */
export function formatEvalOutcome(evalCase: RulesEvalCase, outcome: EvalCaseOutcome, citedAs: string | null): string {
  const status = outcome.failures.length === 0 ? 'PASS' : 'FAIL'
  const lines = [
    `[${status}] ${evalCase.id} — Jev=${outcome.probability.toFixed(2)} kind=${outcome.answer.kind} words=${wordCount(outcome.answer.answer)}`,
    ...outcome.failures.map((failure) => `  ! ${failure}`),
  ]
  const rendered = rulesAnswerMessages(outcome.answer, citedAs)
  if (rendered.length > 0) lines.push(rendered.join('\n---\n').replace(/^/gm, '  | '))
  return lines.join('\n')
}

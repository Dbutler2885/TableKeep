/**
 * Mechanical quality checks for rules-bot evaluation fixtures.
 *
 * Used by `bot/scripts/rules-eval.ts` (opt-in live calibration against Jev + Luna)
 * and pinned by `bot/test/rulesEval.test.ts` in CI so the fixture schema and
 * Neon brevity/clarity guardrails never drift.
 */
import type { RulesAnswer } from './answer.ts'
import type { RuleSet, Supplement } from './books.ts'
import { SESSION_SAMPLE_RATE, type PostedAnswer, type TranscriptLine } from './transcriptWindow.ts'

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

const BANNED_META_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'worked-example meta-commentary', pattern: /\b(worked example|the document gives no)\b/i },
  { label: 'unasked GM-roll philosophy', pattern: /\bthe GM decides whether a roll is needed\b/i },
  { label: 'unasked GM-must-judge filler', pattern: /\bthe GM must judge\b/i },
]

/** Maximum length of a single non-bullet prose line before it counts as a wall of text. */
const MAX_PROSE_PARAGRAPH_CHARS = 300

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

function checkTerms(answer: string, terms: readonly string[] | undefined, wantPresent: boolean): string[] {
  const lower = answer.toLowerCase()
  const issues: string[] = []
  for (const term of terms ?? []) {
    const found = lower.includes(term.toLowerCase())
    if (wantPresent && !found) issues.push(`missing required term "${term}"`)
    if (!wantPresent && found) issues.push(`contains forbidden term "${term}"`)
  }
  return issues
}

function checkMetaCommentary(answer: string): string[] {
  return BANNED_META_PATTERNS.filter(({ pattern }) => pattern.test(answer)).map(({ label }) => `contains ${label}`)
}

/**
 * Checks a model's `RulesAnswer` against a fixture's Neon quality rubric.
 * Returns a list of failure descriptions; empty means the answer passed.
 */
export function lintRulesAnswer(evalCase: RulesEvalCase, reply: RulesAnswer): string[] {
  const issues: string[] = []
  if (!evalCase.expectKinds.includes(reply.kind)) {
    issues.push(`kind "${reply.kind}" not in expected [${evalCase.expectKinds.join(', ')}]`)
  }
  if (reply.kind === 'no_question') return issues
  const words = wordCount(reply.answer)
  if (evalCase.maxWords !== undefined && words > evalCase.maxWords) {
    issues.push(`too long: ${words} words > max ${evalCase.maxWords}`)
  }
  if (reply.kind === 'answered' && hasWallOfProse(reply.answer)) {
    issues.push(`contains unbroken prose line over ${MAX_PROSE_PARAGRAPH_CHARS} chars`)
  }
  issues.push(...checkMetaCommentary(reply.answer))
  issues.push(...checkTerms(reply.answer, evalCase.requiredTerms, true))
  issues.push(...checkTerms(reply.answer, evalCase.forbiddenTerms, false))
  return issues
}

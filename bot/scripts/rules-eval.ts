/**
 * Opt-in calibration & regression runner for Jev + the answering model across
 * the 16-case fixture suite (`bot/test/fixtures/rules-eval-cases.json`).
 *
 *   TYPESAFE_API_KEY=... OPENAI_API_KEY=... node scripts/rules-eval.ts [case-id-filter]
 *
 * Calls live TypeSafe and OpenAI APIs (never run in CI) and checks trigger
 * accuracy plus the Neon brevity/scannability rubric (`evalLint.ts`).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rulesAnswerMessages } from '../src/discord/replies.ts'
import { openAiRulesAnswerer } from '../src/rules/answer.ts'
import { readRulesBook, RULES_BOOKS, type RuleSet, type Supplement } from '../src/rules/books.ts'
import { evalWindow, lintRulesAnswer, wordCount, type RulesEvalCase } from '../src/rules/evalLint.ts'
import { typesafeJev } from '../src/rules/jev.ts'
import { SUPPLEMENT_THRESHOLD } from '../src/rules/watcher.ts'

const THRESHOLD = 0.8
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '../..')

function loadBook(ruleSet: RuleSet) {
  const book = RULES_BOOKS[ruleSet]!
  const document = readRulesBook(root, book)
  const supplements = Object.fromEntries(
    Object.entries(book.supplements ?? {}).map(([name, part]) => [name, readRulesBook(root, part)]),
  ) as Partial<Record<Supplement, string>>
  return { book, document, supplements, supplementNames: Object.keys(supplements) as Supplement[] }
}

function printCaseResult(
  evalCase: RulesEvalCase,
  probability: number,
  answer: Awaited<ReturnType<ReturnType<typeof openAiRulesAnswerer>>>,
  citedAs: string | null,
  failures: readonly string[],
): void {
  const status = failures.length === 0 ? 'PASS' : 'FAIL'
  console.log(`\n[${status}] ${evalCase.id} — Jev=${probability.toFixed(2)} kind=${answer.kind} words=${wordCount(answer.answer)}`)
  for (const failure of failures) console.log(`  ! ${failure}`)
  const rendered = rulesAnswerMessages(answer, citedAs)
  if (rendered.length > 0) console.log(rendered.join('\n---\n').replace(/^/gm, '  | '))
}

async function runCase(
  evalCase: RulesEvalCase,
  askJev: ReturnType<typeof typesafeJev>,
  openAiKey: string,
  books: Map<RuleSet, ReturnType<typeof loadBook>>,
): Promise<string[]> {
  const loaded = books.get(evalCase.ruleSet) ?? loadBook(evalCase.ruleSet)
  books.set(evalCase.ruleSet, loaded)
  const window = evalWindow(evalCase.lines)
  const posted = evalCase.posted ?? []
  const verdict = await askJev(window, posted, loaded.supplementNames, { gmKnown: evalCase.gmKnown })
  const triggered = verdict.rulesQuestion >= THRESHOLD
  const triggerIssue =
    triggered === evalCase.expectJevTrigger
      ? []
      : [`Jev ${verdict.rulesQuestion.toFixed(2)} (triggered=${triggered}, expected=${evalCase.expectJevTrigger})`]
  const needs = loaded.supplementNames.filter((name) => (verdict.needs[name] ?? 0) >= SUPPLEMENT_THRESHOLD)
  const answer = await openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument: loaded.document, supplements: loaded.supplements })(
    window,
    posted,
    needs,
  )
  const failures = [...triggerIssue, ...lintRulesAnswer(evalCase, answer)]
  printCaseResult(evalCase, verdict.rulesQuestion, answer, loaded.book.citedAs, failures)
  return failures
}

const typesafeKey = process.env.TYPESAFE_API_KEY
const openAiKey = process.env.OPENAI_API_KEY
if (!typesafeKey || !openAiKey) throw new Error('Set TYPESAFE_API_KEY and OPENAI_API_KEY.')

const filter = process.argv[2] ?? ''
const fixtures = JSON.parse(readFileSync(path.join(here, '../test/fixtures/rules-eval-cases.json'), 'utf8')) as RulesEvalCase[]
const cases = filter ? fixtures.filter((item) => item.id.includes(filter)) : fixtures
const askJev = typesafeJev({ apiKey: typesafeKey })
const books = new Map<RuleSet, ReturnType<typeof loadBook>>()

let failed = 0
for (const evalCase of cases) {
  const issues = await runCase(evalCase, askJev, openAiKey, books)
  if (issues.length > 0) failed += 1
}
console.log(`\nSummary: ${cases.length - failed}/${cases.length} passed.`)
if (failed > 0) process.exitCode = 1

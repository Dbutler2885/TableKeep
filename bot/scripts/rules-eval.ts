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
import { openAiRulesAnswerer } from '../src/rules/answer.ts'
import type { RuleSet } from '../src/rules/books.ts'
import { evaluateRulesCase, filterEvalCases, formatEvalOutcome, loadEvalBook, type LoadedEvalBook, type RulesEvalCase } from '../src/rules/evalLint.ts'
import { typesafeJev } from '../src/rules/jev.ts'

const typesafeKey = process.env.TYPESAFE_API_KEY
const openAiKey = process.env.OPENAI_API_KEY
if (!typesafeKey || !openAiKey) throw new Error('Set TYPESAFE_API_KEY and OPENAI_API_KEY.')

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '../..')
const filter = process.argv[2] ?? ''
const fixtures = JSON.parse(readFileSync(path.join(here, '../test/fixtures/rules-eval-cases.json'), 'utf8')) as RulesEvalCase[]
const cases = filterEvalCases(fixtures, filter)
const askJev = typesafeJev({ apiKey: typesafeKey })
const books = new Map<RuleSet, LoadedEvalBook>()

let failed = 0
for (const evalCase of cases) {
  const loaded = books.get(evalCase.ruleSet) ?? loadEvalBook(root, evalCase.ruleSet)
  books.set(evalCase.ruleSet, loaded)
  const answer = openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument: loaded.document, supplements: loaded.supplements })
  const outcome = await evaluateRulesCase({ evalCase, supplementNames: loaded.supplementNames, askJev, answer })
  console.log(`\n${formatEvalOutcome(evalCase, outcome, loaded.book.citedAs)}`)
  if (outcome.failures.length > 0) failed += 1
}
console.log(`\nSummary: ${cases.length - failed}/${cases.length} passed.`)
if (failed > 0) process.exitCode = 1

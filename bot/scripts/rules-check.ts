/**
 * Puts one made-up stretch of table talk through the real rules answering,
 * Jev and the answering model both, and prints what the bot would post. Run
 * it before a session to see that the keys, the models and a rule set's rules
 * all work, without recording anything or posting to Discord.
 *
 *   TYPESAFE_API_KEY=... OPENAI_API_KEY=... node scripts/rules-check.ts [lubec|ose] ["the question to ask"]
 *
 * It answers from the rules of the rule set named (Lubec unless named), read
 * from the repository as the bot reads them, with the parts of them Jev says
 * the question needs, as the bot sends them. Each run makes one call to each
 * service.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rulesAnswerMessages } from '../src/discord/replies.ts'
import { openAiRulesAnswerer } from '../src/rules/answer.ts'
import { readRulesBook, RULES_BOOKS, type RuleSet, type Supplement } from '../src/rules/books.ts'
import { typesafeJev } from '../src/rules/jev.ts'
import { SESSION_SAMPLE_RATE, type TranscriptLine } from '../src/rules/transcriptWindow.ts'
import { SUPPLEMENT_THRESHOLD } from '../src/rules/watcher.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const typesafeKey = process.env.TYPESAFE_API_KEY
const openAiKey = process.env.OPENAI_API_KEY
if (!typesafeKey || !openAiKey) throw new Error('Set TYPESAFE_API_KEY and OPENAI_API_KEY.')

const named = process.argv[2] && Object.hasOwn(RULES_BOOKS, process.argv[2]) ? (process.argv[2] as RuleSet) : null
const ruleSet = named ?? 'lubec'
const book = RULES_BOOKS[ruleSet]!
const question = process.argv[named ? 3 : 2] ?? 'Wait, if I attack with a weapon in each hand, do I get two attacks?'
const window: TranscriptLine[] = [
  { speaker: 'GM', text: 'The goblin lunges at you from behind the barrel.', startSamples: 0, endSamples: 2 * SESSION_SAMPLE_RATE },
  { speaker: 'Player', text: 'Okay, I draw both my daggers.', startSamples: 3 * SESSION_SAMPLE_RATE, endSamples: 5 * SESSION_SAMPLE_RATE },
  { speaker: 'Player', text: question, startSamples: 6 * SESSION_SAMPLE_RATE, endSamples: 8 * SESSION_SAMPLE_RATE },
]

const root = path.join(here, '../..')
const supplements = Object.fromEntries(Object.entries(book.supplements ?? {}).map(([name, part]) => [name, readRulesBook(root, part)]))
const withParts = Object.keys(supplements) as Supplement[]
// As at the start of a session: the bot has answered nothing yet.
const verdict = await typesafeJev({ apiKey: typesafeKey })(window, [], withParts)
console.log(`Jev: ${verdict.rulesQuestion.toFixed(2)} that a rules question is waiting for an answer (the bot answers at 0.80 or more).`)
for (const [name, probability] of Object.entries(verdict.needs)) {
  console.log(`Jev: ${probability.toFixed(2)} that it needs the ${name} part (sent at ${SUPPLEMENT_THRESHOLD.toFixed(2)} or more).`)
}
const needs = withParts.filter((name) => (verdict.needs[name] ?? 0) >= SUPPLEMENT_THRESHOLD)
const started = Date.now()
const rulesDocument = readRulesBook(root, book)
const answer = await openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument, supplements })(window, [], needs)
const sent = needs.length > 0 ? `, with ${needs.join(' and ')}` : ''
console.log(`Answered in ${((Date.now() - started) / 1000).toFixed(1)}s, from the ${ruleSet} rules in ${book.file}${sent}. The bot would post:\n`)
const messages = rulesAnswerMessages(answer, book.citedAs)
console.log(messages.length > 0 ? messages.join('\n\n--- next message ---\n\n') : '(nothing: the model found no question to answer)')

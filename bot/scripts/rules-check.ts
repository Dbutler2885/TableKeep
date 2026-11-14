/**
 * Puts one made-up stretch of table talk through the real rules answering,
 * Jev and the answering model both, and prints what the bot would post. Run
 * it before a session to see that the keys, the models and the rules document
 * all work, without recording anything or posting to Discord.
 *
 *   TYPESAFE_API_KEY=... OPENAI_API_KEY=... node scripts/rules-check.ts ["the question to ask"]
 *
 * It reads the rules document from RULES_DOCUMENT_PATH, or the repository's
 * docs/lubec/combat-rules.md. Each run makes one call to each service.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rulesAnswerMessage } from '../src/discord/replies.ts'
import { openAiRulesAnswerer } from '../src/rules/answer.ts'
import { typesafeJev } from '../src/rules/jev.ts'
import { SESSION_SAMPLE_RATE, type TranscriptLine } from '../src/rules/transcriptWindow.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const rulesPath = process.env.RULES_DOCUMENT_PATH ?? path.join(here, '../../docs/lubec/combat-rules.md')
const typesafeKey = process.env.TYPESAFE_API_KEY
const openAiKey = process.env.OPENAI_API_KEY
if (!typesafeKey || !openAiKey) throw new Error('Set TYPESAFE_API_KEY and OPENAI_API_KEY.')

const question = process.argv[2] ?? 'Wait, if I attack with a weapon in each hand, do I get two attacks?'
const window: TranscriptLine[] = [
  { speaker: 'GM', text: 'The goblin lunges at you from behind the barrel.', startSamples: 0, endSamples: 2 * SESSION_SAMPLE_RATE },
  { speaker: 'Player', text: 'Okay, I draw both my daggers.', startSamples: 3 * SESSION_SAMPLE_RATE, endSamples: 5 * SESSION_SAMPLE_RATE },
  { speaker: 'Player', text: question, startSamples: 6 * SESSION_SAMPLE_RATE, endSamples: 8 * SESSION_SAMPLE_RATE },
]

// As at the start of a session: the bot has answered nothing yet.
const probability = await typesafeJev({ apiKey: typesafeKey })(window, [])
console.log(`Jev: ${probability.toFixed(2)} that a rules question is waiting for an answer (the bot answers at 0.85 or more).`)
const started = Date.now()
const answer = await openAiRulesAnswerer({ apiKey: openAiKey, rulesDocument: readFileSync(rulesPath, 'utf8') })(window, [])
console.log(`Answered in ${((Date.now() - started) / 1000).toFixed(1)}s, from ${rulesPath}. The bot would post:\n`)
console.log(rulesAnswerMessage(answer) ?? '(nothing: the model found no question to answer)')

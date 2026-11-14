import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { rulesAnswerMessages, splitMessages } from '../src/discord/replies.ts'
import { answerRequest, openAiRulesAnswerer, readAnswer, RULES_ANSWER_MODEL } from '../src/rules/answer.ts'
import { jevProbability, jevRequest, typesafeJev } from '../src/rules/jev.ts'
import type { PostedAnswer, TranscriptLine } from '../src/rules/transcriptWindow.ts'

const RULES = readFileSync(new URL('./fixtures/rules-stand-in.md', import.meta.url), 'utf8')
const WINDOW: TranscriptLine[] = [
  { speaker: 'Dave', text: 'Roll it.', startSamples: 0, endSamples: 48_000 },
  { speaker: 'Peter', text: 'Wait, do I add strength to the attack roll?', startSamples: 96_000, endSamples: 192_000 },
]
const POSTED: PostedAnswer[] = [{ askedBy: 'Ann', question: 'does a shield count against arrows?', answer: 'No, melee only.' }]

/** A stand-in for `fetch` that records what it was sent and answers with `body`. */
function fakeFetch(body: unknown, status = 200) {
  const sent: { url: string; init: RequestInit }[] = []
  const request = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { sent, request }
}

test("Jev is asked one yes-or-no question about the transcript, with speakers named, beside every answer posted in the session", () => {
  const request = jevRequest(WINDOW, POSTED)
  assert.equal(request.model, 'jev-latest')
  assert.equal(request.state.transcript, 'Dave: Roll it.\nPeter: Wait, do I add strength to the attack roll?')
  assert.equal(request.state.rules_answers_this_session, 'Ann asked: does a shield count against arrows?\nThe bot answered: No, melee only.')
  assert.deepEqual(Object.keys(request.questions), ['rules_question'])
  assert.equal(request.questions.rules_question.type, 'noul')
  assert.match(request.questions.rules_question.instructions, /new question about the game's rules that the bot's rules answers this session do not already cover/)
  assert.match(request.questions.rules_question.criteria.true, /follow-up/)
  assert.ok(request.questions.rules_question.criteria.true)
  assert.match(request.questions.rules_question.criteria.false, /the bot's rules answers this session already cover: that is not a new rules question/)
})

test("Jev's answer is read as the probability of yes, and anything else is refused", () => {
  assert.equal(jevProbability({ answers: { rules_question: { type: 'noul', noul: 0.93 } } }), 0.93)
  assert.throws(() => jevProbability({ answers: {} }), /no probability/)
  assert.throws(() => jevProbability({ answers: { rules_question: { noul: 2 } } }), /no probability/)
})

test('the call to TypeSafe carries the key, and a refusal is reported without the key in it', async () => {
  const ok = fakeFetch({ answers: { rules_question: { noul: 0.88 } } })
  assert.equal(await typesafeJev({ apiKey: 'secret-key', fetch: ok.request })(WINDOW, []), 0.88)
  assert.equal(ok.sent[0]!.url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal((ok.sent[0]!.init.headers as Record<string, string>).authorization, 'Bearer secret-key')
  assert.match(JSON.parse(String(ok.sent[0]!.init.body)).state.rules_answers_this_session, /has not answered any/)

  const refused = fakeFetch({ detail: { error_type: 'authentication_error' } }, 401)
  await assert.rejects(typesafeJev({ apiKey: 'secret-key', fetch: refused.request })(WINDOW, []), (error: Error) => {
    assert.match(error.message, /TypeSafe answered 401/)
    assert.doesNotMatch(error.message, /secret-key/)
    return true
  })
})

test("the answering model gets the whole rules document as instructions, and the session's answers and the transcript as input", () => {
  const request = answerRequest(RULES, WINDOW, POSTED)
  assert.equal(request.model, RULES_ANSWER_MODEL)
  assert.equal(request.model, 'gpt-6-luna')
  assert.ok(request.instructions.endsWith(`${RULES.trim()}\n`), 'the rules document is the tail of the instructions')
  assert.match(request.instructions, /Give the whole procedure the rules document sets out/)
  assert.match(request.instructions, /never summarise in a way that drops a step, a number or a condition/)
  assert.match(request.instructions, /the document's worked example after the steps, in full/)
  assert.doesNotMatch(request.instructions, /short sentences|briefly/)
  assert.deepEqual(request.reasoning, { effort: 'none' })
  assert.match(request.instructions, /name the section of the rules document/)
  assert.match(request.instructions, /does not cover the question/)
  assert.match(request.instructions, /not decided yet/)
  assert.match(request.instructions, /Never guess beyond the document/)
  assert.match(request.instructions, /follow-up that asks something your earlier answers did not cover is a new question/)
  assert.match(request.instructions, /every rules answer you have already posted in this session/)
  assert.match(request.instructions, /your earlier answers in this session already answer it, even asked again in other words or much later, set "kind" to "no_question"/)
  assert.match(request.instructions, /"can I climb it\?".*is a request to the GM, not a rules question/)
  assert.equal(
    request.input,
    'Your rules answers in this session, oldest first:\n\nAnn asked: does a shield count against arrows?\nThe bot answered: No, melee only.\n\n' +
      'The transcript, oldest line first:\n\nDave: Roll it.\nPeter: Wait, do I add strength to the attack roll?',
  )
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.store, false)
})

test('every request in a session starts with the same instructions, so the document can be reused', () => {
  const later: TranscriptLine[] = [{ speaker: 'Ann', text: 'Can I use two swords?', startSamples: 0, endSamples: 48_000 }]
  assert.equal(answerRequest(RULES, WINDOW, []).instructions, answerRequest(RULES, later, POSTED).instructions)
})

const reply = (fields: Record<string, string>) => ({
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(fields) }] },
  ],
})

test("the model's answer is read out of the Responses API reply", () => {
  assert.deepEqual(
    readAnswer(reply({ kind: 'not_decided', question: 'two weapons, second attack?', asked_by: 'Ann', answer: "That rule isn't decided yet.", section: 'Two weapons' })),
    { kind: 'not_decided', question: 'two weapons, second attack?', askedBy: 'Ann', answer: "That rule isn't decided yet.", section: 'Two weapons' },
  )
  assert.throws(() => readAnswer({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }), /stopped early \(max_output_tokens\)/)
  assert.throws(() => readAnswer({ status: 'incomplete' }), /stopped early \(no reason given\)/)
  assert.throws(() => readAnswer({ status: 'completed', output: [{ type: 'message' }] }), /The model gave no answer: it wrote no text\./)
  assert.throws(() => readAnswer({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), /refused/)
  assert.throws(() => readAnswer(reply({ kind: 'maybe', question: '', asked_by: '', answer: '', section: '' })), /no known kind/)
})

test('the call to OpenAI sends the request and reads the answer', async () => {
  const fake = fakeFetch(reply({ kind: 'answered', question: 'q', asked_by: 'Peter', answer: 'Yes.', section: 'Attacks' }))
  const answer = await openAiRulesAnswerer({ apiKey: 'sk-test', rulesDocument: RULES, fetch: fake.request })(WINDOW, [])
  assert.equal(answer.answer, 'Yes.')
  assert.equal(fake.sent[0]!.url, 'https://api.openai.com/v1/responses')
  assert.equal(JSON.parse(String(fake.sent[0]!.init.body)).model, 'gpt-6-luna')

  const failing = fakeFetch('{"error":{"message":"overloaded"}}', 503)
  await assert.rejects(openAiRulesAnswerer({ apiKey: 'sk-test', rulesDocument: RULES, fetch: failing.request })(WINDOW, []), /OpenAI answered 503: .*overloaded/)
  // OpenAI names part of a refused key in its reply, so none of the reply is passed on.
  const refused = fakeFetch('{"error":{"message":"Incorrect API key provided: sk-tes*"}}', 401)
  await assert.rejects(openAiRulesAnswerer({ apiKey: 'sk-test', rulesDocument: RULES, fetch: refused.request })(WINDOW, []), (error: Error) => {
    assert.equal(error.message, 'OpenAI answered 401')
    return true
  })
})

test('the Discord message says it is the rules answer, what was asked, and where in the document it came from', () => {
  const base = { question: 'do I add strength to the attack roll?', askedBy: 'Peter', answer: 'Yes, add your Strength to hit.', section: 'Attacks' }
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'answered', ...base }),
    ['**Rules answer** - Peter asked: "do I add strength to the attack roll?"\nYes, add your Strength to hit.\n-# From the rules document: Attacks'],
  )
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'not_covered', ...base, answer: "The rules document doesn't cover that.", section: '' }),
    ['**Rules answer** - Peter asked: "do I add strength to the attack roll?"\nThe rules document doesn\'t cover that.\n-# Not covered by the rules document'],
  )
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'not_decided', ...base, answer: "That rule isn't decided yet.", section: 'Two weapons' }),
    ['**Rules answer** - Peter asked: "do I add strength to the attack roll?"\nThat rule isn\'t decided yet.\n-# Not decided yet in the rules document (Two weapons)'],
  )
  assert.deepEqual(rulesAnswerMessages({ kind: 'no_question', question: '', askedBy: '', answer: '', section: '' }), [])
  assert.deepEqual(rulesAnswerMessages({ kind: 'answered', ...base, answer: '' }), [])
})

test('a rules answer that leaves out who asked, what, or the section still reads plainly', () => {
  const answer = 'Yes, add your Strength to hit.'
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'answered', question: 'strength to hit?', askedBy: '', answer, section: '' }),
    ['**Rules answer** - asked: "strength to hit?"\nYes, add your Strength to hit.\n-# From the rules document'],
  )
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'not_decided', question: '', askedBy: 'Peter', answer, section: '' }),
    ['**Rules answer**\nYes, add your Strength to hit.\n-# Not decided yet in the rules document'],
  )
})

test('an answer keeps its own lines, steps and markdown', () => {
  const answer = '1. Everyone rolls **Speed**.\n2. Move the tens digit in units.\n\nExample: 30 meters on 4 units.'
  assert.deepEqual(rulesAnswerMessages({ kind: 'answered', question: 'race?', askedBy: 'DLB', answer, section: 'Racing' }), [
    `**Rules answer** - DLB asked: "race?"\n${answer}\n-# From the rules document: Racing`,
  ])
})

test('text too long for one Discord message is split between lines, and a line too long for one between words', () => {
  assert.deepEqual(splitMessages('aaaa\nbbbb\ncccc', 9), ['aaaa\nbbbb', 'cccc'])
  assert.deepEqual(splitMessages('one two three four', 9), ['one two', 'three', 'four'])
  assert.deepEqual(splitMessages('x'.repeat(20), 8), ['xxxxxxxx', 'xxxxxxxx', 'xxxx'])
  assert.deepEqual(splitMessages('\nfirst\n\nsecond', 100), ['first\n\nsecond'])
  assert.deepEqual(splitMessages('  ', 100), [])
  const parts = splitMessages(Array.from({ length: 100 }, () => 'y'.repeat(50)).join('\n'))
  assert.ok(parts.length === 3 && parts.every((part) => part.length <= 2_000))
  assert.equal(parts.join('\n'), Array.from({ length: 100 }, () => 'y'.repeat(50)).join('\n'))
})

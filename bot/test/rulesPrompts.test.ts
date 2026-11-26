import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { rulesAnswerMessages, splitMessages } from '../src/discord/replies.ts'
import { answerRequest, MAX_OUTPUT_TOKENS, openAiRulesAnswerer, readAnswer, RULES_ANSWER_MODEL, withSupplements } from '../src/rules/answer.ts'
import { jevRequest, jevVerdict, typesafeJev } from '../src/rules/jev.ts'
import { renderClassicFantasyCorpus } from '../src/rules/classicFantasy.ts'
import type { PostedAnswer, TranscriptLine } from '../src/rules/transcriptWindow.ts'

const RULES = readFileSync(new URL('./fixtures/rules-stand-in.md', import.meta.url), 'utf8')
const WINDOW: TranscriptLine[] = [
  { speaker: 'Dave', isGm: true, text: 'Roll it.', startSamples: 0, endSamples: 48_000 },
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

test('Jev focuses on the GM when gmKnown is true, and falls back to all-speaker strict rules mode when GM is unknown', () => {
  const gmReq = jevRequest(WINDOW, POSTED, [], { gmKnown: true })
  assert.equal(gmReq.model, 'jev-latest')
  assert.equal(gmReq.state.transcript, 'Dave (GM): Roll it.\nPeter: Wait, do I add strength to the attack roll?')
  assert.equal(gmReq.state.rules_answers_this_session, 'Ann asked: does a shield count against arrows?\nThe bot answered: No, melee only.')
  assert.match(gmReq.state.setting, /marked "\(GM\)"/)
  assert.deepEqual(Object.keys(gmReq.questions), ['rules_question'])
  const gmQuestion = gmReq.questions.rules_question!
  assert.equal(gmQuestion.type, 'noul')
  assert.match(gmQuestion.instructions, /is the GM asking, wondering aloud, or expressing uncertainty about a game rule/)
  assert.match(gmQuestion.criteria.true, /good question, let me check/)
  assert.match(gmQuestion.criteria.true, /spell, monster, creature, magic item, equipment, weapon, armor, or treasure/)
  assert.match(gmQuestion.criteria.false, /Teacher's Pet.*Politician.*advantage/)
  assert.match(gmQuestion.criteria.false, /the bot's rules answers this session already cover/)

  const fallbackReq = jevRequest(WINDOW, POSTED)
  assert.doesNotMatch(fallbackReq.state.setting, /marked "\(GM\)"/)
  assert.match(fallbackReq.questions.rules_question!.instructions, /is someone at the table asking a new question about how a game rule works/)
  assert.match(fallbackReq.questions.rules_question!.criteria.false, /Teacher's Pet.*Politician.*advantage/)
})

test('for rules with parts sent only when needed, the same request asks of each whether the new rules question needs it, naming what it can hear', () => {
  const request = jevRequest(WINDOW, POSTED, ['monsters', 'spellsAndItems'])
  assert.deepEqual(Object.keys(request.questions), ['rules_question', 'monster_question', 'spell_or_item_question'])
  assert.deepEqual(request.questions.rules_question, jevRequest(WINDOW, POSTED).questions.rules_question, 'the rules question is the same either way')
  const monsters = request.questions.monster_question!
  const spellsAndItems = request.questions.spell_or_item_question!
  for (const question of [monsters, spellsAndItems]) {
    assert.equal(question.type, 'noul')
    assert.match(question.instructions, /^Judging by the end of the transcript, does the new rules question being asked there need /)
    assert.match(question.criteria.true, /^The new rules question at the end of the transcript is about a particular /)
    assert.match(question.criteria.false, /^There is no new rules question at the end of the transcript, or the question is about how a rule works in general/)
    assert.doesNotMatch(`${question.instructions} ${question.criteria.true}`, /core rules/, 'Jev cannot know what the core rules hold')
  }
  assert.match(monsters.instructions, /game statistics or abilities of a particular monster or creature/)
  assert.match(monsters.criteria.true, /hit dice[\s\S]*a wight's level drain/)
  assert.match(spellsAndItems.instructions, /a particular spell, magic item, piece of equipment, weapon, armor, mount, vehicle or treasure/)
  assert.match(spellsAndItems.criteria.true, /fireball[\s\S]*bag of holding[\s\S]*longbow[\s\S]*what something costs/)
  assert.deepEqual(Object.keys(jevRequest(WINDOW, POSTED, ['spellsAndItems']).questions), ['rules_question', 'spell_or_item_question'])
})

test("Jev's answers are read as the probabilities of yes, and anything else is refused", () => {
  assert.deepEqual(jevVerdict({ answers: { rules_question: { type: 'noul', noul: 0.93 } } }), { rulesQuestion: 0.93, needs: {} })
  assert.deepEqual(
    jevVerdict({ answers: { rules_question: { noul: 0.93 }, monster_question: { noul: 0.1 }, spell_or_item_question: { noul: 0.7 } } }, ['monsters', 'spellsAndItems']),
    { rulesQuestion: 0.93, needs: { monsters: 0.1, spellsAndItems: 0.7 } },
  )
  assert.throws(() => jevVerdict({ answers: {} }), /no probability for the rules question/)
  assert.throws(() => jevVerdict({ answers: { rules_question: { noul: 2 } } }), /no probability/)
  assert.throws(() => jevVerdict({ answers: { rules_question: { noul: 0.9 } } }, ['monsters']), /no probability for the monster_question/)
})

test('the call to TypeSafe carries the key, and a refusal is reported without the key in it', async () => {
  const ok = fakeFetch({ answers: { rules_question: { noul: 0.88 } } })
  assert.deepEqual(await typesafeJev({ apiKey: 'secret-key', fetch: ok.request })(WINDOW, [], []), { rulesQuestion: 0.88, needs: {} })
  assert.equal(ok.sent[0]!.url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal((ok.sent[0]!.init.headers as Record<string, string>).authorization, 'Bearer secret-key')
  assert.match(JSON.parse(String(ok.sent[0]!.init.body)).state.rules_answers_this_session, /has not answered any/)

  const refused = fakeFetch({ detail: { error_type: 'authentication_error' } }, 401)
  await assert.rejects(typesafeJev({ apiKey: 'secret-key', fetch: refused.request })(WINDOW, [], []), (error: Error) => {
    assert.match(error.message, /TypeSafe answered 401/)
    assert.doesNotMatch(error.message, /secret-key/)
    return true
  })
})

test("the answering model gets the whole rules document as instructions, lean formatting rules, and the session's answers and transcript as input", () => {
  const request = answerRequest(RULES, WINDOW, POSTED)
  assert.equal(request.model, RULES_ANSWER_MODEL)
  assert.equal(request.model, 'gpt-6-luna')
  assert.equal(request.max_output_tokens, MAX_OUTPUT_TOKENS)
  assert.ok(request.max_output_tokens <= 2_000, 'output budget is capped against runaway essays')
  assert.ok(request.instructions.endsWith(`${RULES.trim()}\n`), 'the rules document is the tail of the instructions')
  assert.match(request.instructions, /Answer ONLY what was asked/)
  assert.match(request.instructions, /2 to 5 short bullet points/)
  assert.match(request.instructions, /Target 25-80 words/)
  assert.match(request.instructions, /Never include worked examples unless the GM explicitly asks/)
  assert.match(request.instructions, /Never write meta-commentary/)
  assert.deepEqual(request.reasoning, { effort: 'none' })
  assert.match(request.instructions, /Set "title" to a short 1-5 word rule label/)
  assert.match(request.instructions, /Set "section" to the section heading/)
  assert.match(request.instructions, /set "kind" to "not_covered" and say so plainly in 1 short sentence/)
  assert.match(request.instructions, /set "kind" to "not_decided" and state that plus any brief recommendation in 1 short sentence/)
  assert.match(request.instructions, /never guess beyond the document/)
  assert.match(request.instructions, /follow-up that asks something your earlier answers did not cover is a new question/)
  assert.match(request.instructions, /every rules answer you have already posted in this session/)
  assert.match(request.instructions, /Set "kind" to "no_question"/)
  assert.match(request.instructions, /Teacher's Pet.*Politician.*advantage or disadvantage/)
  assert.equal(
    request.input,
    'Your rules answers in this session, oldest first:\n\nAnn asked: does a shield count against arrows?\nThe bot answered: No, melee only.\n\n' +
      'The transcript, oldest line first:\n\nDave (GM): Roll it.\nPeter: Wait, do I add strength to the attack roll?',
  )
  assert.equal(request.text.format.type, 'json_schema')
  assert.ok(request.text.format.schema.required.includes('title'))
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
    readAnswer(
      reply({
        kind: 'not_decided',
        title: 'Two weapons',
        question: 'two weapons, second attack?',
        asked_by: 'Ann',
        answer: "That rule isn't decided yet.",
        section: 'Two weapons',
      }),
    ),
    {
      kind: 'not_decided',
      title: 'Two weapons',
      question: 'two weapons, second attack?',
      askedBy: 'Ann',
      answer: "That rule isn't decided yet.",
      section: 'Two weapons',
    },
  )
  assert.throws(() => readAnswer({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }), /stopped early \(max_output_tokens\)/)
  assert.throws(() => readAnswer({ status: 'incomplete' }), /stopped early \(no reason given\)/)
  assert.throws(() => readAnswer({ status: 'completed', output: [{ type: 'message' }] }), /The model gave no answer: it wrote no text\./)
  assert.throws(() => readAnswer({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), /refused/)
  assert.throws(() => readAnswer(reply({ kind: 'maybe', title: '', question: '', asked_by: '', answer: '', section: '' })), /no known kind/)
})

test('the call to OpenAI sends the request and reads the answer', async () => {
  const fake = fakeFetch(reply({ kind: 'answered', title: 'Attacks', question: 'q', asked_by: 'Peter', answer: 'Yes.', section: 'Attacks' }))
  const answer = await openAiRulesAnswerer({ apiKey: 'sk-test', rulesDocument: RULES, fetch: fake.request })(WINDOW, [])
  assert.equal(answer.answer, 'Yes.')
  assert.equal(answer.title, 'Attacks')
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

test('the parts of the rules a question needs follow the rules document in a fixed order, so the document stays the start of every request', () => {
  const parts = { monsters: '# Monsters\n\nGoblins.\n', spellsAndItems: '# Spells\n\nSleep.\n' }
  assert.equal(withSupplements(RULES, parts, []), RULES.trim())
  assert.equal(withSupplements(RULES, parts, ['monsters']), `${RULES.trim()}\n\n# Monsters\n\nGoblins.`)
  assert.equal(withSupplements(RULES, parts, ['spellsAndItems']), `${RULES.trim()}\n\n# Spells\n\nSleep.`)
  const both = `${RULES.trim()}\n\n# Monsters\n\nGoblins.\n\n# Spells\n\nSleep.`
  assert.equal(withSupplements(RULES, parts, ['spellsAndItems', 'monsters']), both)
  assert.equal(withSupplements(RULES, { spellsAndItems: parts.spellsAndItems }, ['monsters']), RULES.trim(), 'a part there is none of is not sent')
  assert.ok(answerRequest(both, WINDOW, []).instructions.startsWith(answerRequest(RULES, WINDOW, []).instructions.trimEnd()))
})

test('the answerer sends the parts each question needs, and only those', async () => {
  const fake = fakeFetch(reply({ kind: 'answered', title: 'Sleep', question: 'q', asked_by: 'Peter', answer: 'Yes.', section: 'Sleep' }))
  const answer = openAiRulesAnswerer({ apiKey: 'sk-test', rulesDocument: RULES, supplements: { monsters: '# Monsters', spellsAndItems: '# Spells' }, fetch: fake.request })
  await answer(WINDOW, [])
  await answer(WINDOW, [], ['spellsAndItems'])
  await answer(WINDOW, [], ['monsters', 'spellsAndItems'])
  const sent = fake.sent.map(({ init }) => (JSON.parse(String(init.body)) as { instructions: string }).instructions)
  assert.ok(sent[0]!.endsWith(`${RULES.trim()}\n`))
  assert.ok(sent[1]!.endsWith(`${RULES.trim()}\n\n# Spells\n`))
  assert.ok(sent[2]!.endsWith(`${RULES.trim()}\n\n# Monsters\n\n# Spells\n`))
})

test('the Discord message renders as a compact rule card with muted footer, and 1-liners for not_covered / not_decided', () => {
  const base = { title: 'Attacks', question: 'do I add strength to the attack roll?', askedBy: 'Peter', answer: '- Add **Strength** to hit.', section: 'Attacks' }
  assert.deepEqual(rulesAnswerMessages({ kind: 'answered', ...base }, 'the rules document'), [
    '**Attacks**\n- Add **Strength** to hit.\n-# Attacks · Peter: "do I add strength to the attack roll?"',
  ])
  assert.deepEqual(
    rulesAnswerMessages(
      { kind: 'not_covered', ...base, title: 'Two weapons', answer: "The rules document doesn't cover that.", section: '' },
      'the rules document',
    ),
    ['**Two weapons** — The rules document doesn\'t cover that.\n-# Not covered by the rules document · Peter: "do I add strength to the attack roll?"'],
  )
  assert.deepEqual(
    rulesAnswerMessages(
      { kind: 'not_decided', ...base, title: 'Two weapons', answer: "That rule isn't decided yet.", section: 'Two weapons' },
      'the rules document',
    ),
    ['**Two weapons** — That rule isn\'t decided yet.\n-# Not decided yet (Two weapons) · Peter: "do I add strength to the attack roll?"'],
  )
  assert.deepEqual(rulesAnswerMessages({ kind: 'no_question', title: '', question: '', askedBy: '', answer: '', section: '' }, 'the rules document'), [])
  assert.deepEqual(rulesAnswerMessages({ kind: 'answered', ...base, answer: '' }, 'the rules document'), [])
})

test('rules with nothing to cite them by, as for OSE, omit the section/source from the footer', () => {
  const base = { title: 'Initiative', question: 'who goes first?', askedBy: 'Peter', answer: '- Each side rolls **1d6**; the higher acts first.', section: 'Combat › Initiative' }
  assert.deepEqual(rulesAnswerMessages({ kind: 'answered', ...base }, null), [
    '**Initiative**\n- Each side rolls **1d6**; the higher acts first.\n-# Peter: "who goes first?"',
  ])
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'not_covered', ...base, title: 'Sleep', answer: 'The rules do not say what that spell does.', section: '' }, null),
    ['**Sleep** — The rules do not say what that spell does.\n-# Peter: "who goes first?"'],
  )
  assert.deepEqual(rulesAnswerMessages({ kind: 'answered', ...base, question: '', askedBy: '' }, null), [
    '**Initiative**\n- Each side rolls **1d6**; the higher acts first.',
  ])
  assert.deepEqual(rulesAnswerMessages({ kind: 'no_question', title: '', question: '', askedBy: '', answer: '', section: '' }, null), [])
})

test('the whole Classic Fantasy corpus goes to the answering model as the rules document, after the same instructions', () => {
  const corpus = renderClassicFantasyCorpus(readFileSync(new URL('../../docs/rules/ose-classic/corpus.json', import.meta.url), 'utf8'))
  const lubec = answerRequest(RULES, WINDOW, [])
  const classic = answerRequest(corpus, WINDOW, [])
  const guidance = lubec.instructions.slice(0, lubec.instructions.indexOf(RULES.trim()))
  assert.equal(classic.instructions, `${guidance}${corpus.trim()}\n`)
  assert.match(guidance, /never guess beyond the document\. Do not fill a gap from other games, editions, or general knowledge\./)
  assert.match(guidance, /set "kind" to "not_covered"/)
  assert.equal(classic.input, lubec.input)
})

test('a rules answer that leaves out title, who asked, question, or section still reads cleanly', () => {
  const answer = '- Add **Strength** to hit.'
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'answered', title: '', question: 'strength to hit?', askedBy: '', answer, section: '' }, 'the rules document'),
    ['**Rules answer**\n- Add **Strength** to hit.\n-# the rules document · "strength to hit?"'],
  )
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'not_decided', title: '', question: '', askedBy: 'Peter', answer: 'Not decided yet.', section: '' }, 'the rules document'),
    ['**Rules answer** — Not decided yet.\n-# Not decided yet in the rules document'],
  )
})

test('an answer keeps its own lines, steps and markdown', () => {
  const answer = '1. Opposed **Speed** check (**d100 <= Speed**).\n2. Both succeed: **higher** roll wins.'
  assert.deepEqual(
    rulesAnswerMessages({ kind: 'answered', title: 'Racing to a place', question: 'race?', askedBy: 'DLB', answer, section: 'Racing' }, 'the rules document'),
    [`**Racing to a place**\n${answer}\n-# Racing · DLB: "race?"`],
  )
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

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RULES_BOOKS, type Supplement } from '../src/rules/books.ts'
import { evaluateRulesCase, evalWindow, filterEvalCases, formatEvalOutcome, lintRulesAnswer, loadEvalBook, wordCount, type RulesEvalCase } from '../src/rules/evalLint.ts'
import { RulesWatcher } from '../src/rules/watcher.ts'

const FIXTURES = JSON.parse(
  readFileSync(new URL('./fixtures/rules-eval-cases.json', import.meta.url), 'utf8'),
) as RulesEvalCase[]

test('the 16 eval fixtures are well-formed and match GM-gated watcher triggering', async () => {
  assert.equal(FIXTURES.length, 16)
  const ids = new Set<string>()
  for (const evalCase of FIXTURES) {
    assert.ok(evalCase.id && !ids.has(evalCase.id), `duplicate or empty id: ${evalCase.id}`)
    ids.add(evalCase.id)
    assert.ok(Object.hasOwn(RULES_BOOKS, evalCase.ruleSet), `unknown ruleSet on ${evalCase.id}`)
    assert.ok(evalCase.lines.length > 0, `empty lines on ${evalCase.id}`)
    assert.ok(evalCase.expectKinds.length > 0, `empty expectKinds on ${evalCase.id}`)

    // Feed every line except the last, then check whether the final line wakes Jev under gmOnly.
    const window = evalWindow(evalCase.lines)
    let jevCalls = 0
    const watcher = new RulesWatcher({
      sessionStartedAtMs: 0,
      citedAs: RULES_BOOKS[evalCase.ruleSet]!.citedAs,
      gmOnly: evalCase.gmKnown,
      askJev: async () => {
        jevCalls += 1
        return { rulesQuestion: 0.05, needs: {} }
      },
      answer: async () => ({ kind: 'no_question', title: '', question: '', askedBy: '', answer: '', section: '' }),
      post: async () => undefined,
      log: () => undefined,
    })
    for (const line of window.slice(0, -1)) {
      watcher.heard([line])
      watcher.tick(10_000)
      await watcher.idle()
    }
    const beforeFinal = jevCalls
    watcher.heard([window.at(-1)!])
    watcher.tick(20_000)
    await watcher.idle()
    assert.equal(
      jevCalls > beforeFinal,
      evalCase.expectWatcherTriggers,
      `watcher trigger mismatch on ${evalCase.id}`,
    )
  }
})

test('lintRulesAnswer accepts lean, accurate answers and flags bloat, prose walls, meta-commentary, and missing facts', () => {
  const panicCase = FIXTURES.find((item) => item.id === 'lubec-gm-panic-check')!
  const goodAnswer = {
    kind: 'answered' as const,
    title: 'Panic Check',
    question: 'How do we do a panic check?',
    askedBy: 'DLB',
    answer: [
      '- Roll **d20** vs current **Stress** (not a Fear Save).',
      '- **Higher** than Stress: hold it together.',
      '- **Equal or lower**: **Panic** — that same d20 picks the Panic table row.',
      '- Failing adds **no Stress** by itself; apply only Stress on the row.',
    ].join('\n'),
    section: 'Panic Check',
  }
  assert.equal(wordCount(goodAnswer.answer), 44)
  assert.equal(wordCount('   '), 0)
  assert.deepEqual(lintRulesAnswer(panicCase, goodAnswer), [])

  const badAnswer = {
    ...goodAnswer,
    answer:
      'The document gives no worked example of a Panic Check. The GM decides whether a roll is needed and the GM must judge Overachiever Stress here. ' +
      'A'.repeat(320),
  }
  const issues = lintRulesAnswer(panicCase, badAnswer)
  assert.ok(issues.some((issue) => issue.includes('worked-example meta-commentary')))
  assert.ok(issues.some((issue) => issue.includes('unasked GM-roll philosophy')))
  assert.ok(issues.some((issue) => issue.includes('unasked GM-must-judge filler')))
  assert.ok(issues.some((issue) => issue.includes('unbroken prose line')))
  assert.ok(issues.some((issue) => issue.includes('missing required term "d20"')))
  assert.ok(issues.some((issue) => issue.includes('contains forbidden term "Overachiever"')))

  const tooLong = { ...goodAnswer, answer: Array.from({ length: 90 }, () => 'd20 Stress higher Panic no Stress').join(' ') }
  assert.ok(lintRulesAnswer(panicCase, tooLong).some((issue) => issue.includes('too long')))

  const playerCase = FIXTURES.find((item) => item.id === 'lubec-player-teachers-pet')!
  assert.deepEqual(
    lintRulesAnswer(playerCase, { kind: 'no_question', title: '', question: '', askedBy: '', answer: '', section: '' }),
    [],
  )
  assert.ok(lintRulesAnswer(playerCase, goodAnswer).some((issue) => issue.includes('kind "answered" not in expected')))
})

test('loadEvalBook, filterEvalCases, evaluateRulesCase, and formatEvalOutcome run and format both passing and failing cases', async () => {
  assert.equal(filterEvalCases(FIXTURES, '').length, FIXTURES.length)
  assert.deepEqual(
    filterEvalCases(FIXTURES, 'ghoul').map((item) => item.id),
    ['ose-gm-ghoul-paralysis'],
  )
  const root = new URL('../..', import.meta.url).pathname
  const lubec = loadEvalBook(root, 'lubec')
  assert.ok(lubec.document.includes('# Lubec rules'))
  assert.deepEqual(lubec.supplementNames, [])

  const ose = loadEvalBook(root, 'ose')
  assert.deepEqual(ose.supplementNames.sort(), ['monsters', 'spellsAndItems'])

  const ghoulCase = FIXTURES.find((item) => item.id === 'ose-gm-ghoul-paralysis')!
  const sentSupplements: (readonly Supplement[] | undefined)[] = []
  const passOutcome = await evaluateRulesCase({
    evalCase: ghoulCase,
    supplementNames: ose.supplementNames,
    askJev: async () => ({ rulesQuestion: 0.92, needs: { monsters: 0.9, spellsAndItems: 0.1 } }),
    answer: async (_window, _posted, needs) => {
      sentSupplements.push(needs)
      return {
        kind: 'answered',
        title: 'Ghoul',
        question: 'What does a ghoul do when it hits?',
        askedBy: 'DLB',
        answer: '- **2 claws (1d3)** + **1 bite (1d3)** + **paralysis** (**Save vs Paralysis** or paralysed 2d4 turns).',
        section: 'Monsters › Ghoul',
      }
    },
  })
  assert.deepEqual(sentSupplements, [['monsters']])
  assert.deepEqual(passOutcome.failures, [])
  const passText = formatEvalOutcome(ghoulCase, passOutcome, null)
  assert.match(passText, /^\[PASS\] ose-gm-ghoul-paralysis — Jev=0\.92 kind=answered/)
  assert.match(passText, /\| \*\*Ghoul\*\*/)

  const failOutcome = await evaluateRulesCase({
    evalCase: ghoulCase,
    supplementNames: ose.supplementNames,
    askJev: async () => ({ rulesQuestion: 0.12, needs: {} }),
    answer: async () => ({ kind: 'no_question', title: '', question: '', askedBy: '', answer: '', section: '' }),
  })
  assert.ok(failOutcome.failures.some((issue) => issue.includes('triggered=false, expected=true')))
  const failText = formatEvalOutcome(ghoulCase, failOutcome, null)
  assert.match(failText, /^\[FAIL\] ose-gm-ghoul-paralysis — Jev=0\.12 kind=no_question words=0/)
  assert.match(failText, /! Jev 0\.12/)
})

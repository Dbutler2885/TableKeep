import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RulesAnswer } from '../src/rules/answer.ts'
import type { TranscriptLine } from '../src/rules/transcriptWindow.ts'
import type { Supplement } from '../src/rules/books.ts'
import type { JevVerdict } from '../src/rules/jev.ts'
import { RulesWatcher, SUPPLEMENT_THRESHOLD } from '../src/rules/watcher.ts'

const START = 1_800_000_000_000
const RATE = 48_000

const ANSWERED: RulesAnswer = {
  kind: 'answered',
  title: 'Shields',
  question: 'does a shield count against arrows?',
  askedBy: 'Peter',
  answer: 'No. A shield counts against melee attacks only.',
  section: 'Shields',
}
const FOLLOW_UP: RulesAnswer = {
  kind: 'answered',
  title: 'Shield bash',
  question: 'can I bash with the shield?',
  askedBy: 'Peter',
  answer: 'Yes, as an unarmed attack.',
  section: 'Shields',
}
const NO_QUESTION: RulesAnswer = { kind: 'no_question', title: '', question: '', askedBy: '', answer: '', section: '' }

/**
 * A watcher with a stand-in Jev and answering model, and a clock the test moves.
 * The answering model gives `answers` in turn, then the shield answer.
 */
function setUp(options: { probabilities?: number[]; answers?: (RulesAnswer | Error)[]; jevFails?: boolean; citedAs?: string | null; gmOnly?: boolean } = {}) {
  const asked: string[][] = []
  const jevGmKnown: (boolean | undefined)[] = []
  const answered: string[][] = []
  /** The questions of the session's posted answers that Jev, and the answering model, were shown each time. */
  const jevPosted: string[][] = []
  const answerPosted: string[][] = []
  const answers = [...(options.answers ?? [])]
  const posted: string[] = []
  const logged: { message: string; detail?: Record<string, unknown> }[] = []
  const probabilities = [...(options.probabilities ?? [])]
  const jev = { failing: options.jevFails ?? false }
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    citedAs: options.citedAs === undefined ? 'the rules document' : options.citedAs,
    gmOnly: options.gmOnly ?? false,
    askJev: async (window, posted, _supplements, jevOptions) => {
      asked.push(window.map((line) => line.text))
      jevGmKnown.push(jevOptions?.gmKnown)
      jevPosted.push(posted.map((answer) => answer.question))
      if (jev.failing) throw new Error('TypeSafe answered 503')
      return { rulesQuestion: probabilities.shift() ?? 0.05, needs: {} }
    },
    answer: async (window, posted) => {
      answered.push(window.map((line) => line.text))
      answerPosted.push(posted.map((answer) => answer.question))
      const next = answers.shift() ?? ANSWERED
      if (next instanceof Error) throw next
      return next
    },
    post: async (text) => posted.push(text),
    log: (message, detail) => logged.push({ message, detail }),
    now: () => clock,
  })
  let clock = START
  /** Someone says something that ends now, and it arrives transcribed. */
  const say = (speaker: string, text: string, isGm = false) => {
    const endSamples = Math.round(((clock - START) / 1000) * RATE)
    const line: TranscriptLine = { speaker, isGm, text, startSamples: endSamples - 2 * RATE, endSamples }
    watcher.heard([line])
  }
  /** Lets time pass, ticking as the runner does, and lets each look finish before the next tick. */
  const pass = async (ms: number) => {
    const until = clock + ms
    while (clock < until) {
      clock += 100
      watcher.tick(clock)
      await watcher.idle()
    }
  }
  return { watcher, jev, asked, jevGmKnown, answered, jevPosted, answerPosted, posted, logged, say, pass }
}

test('nothing is asked of Jev until someone has said something', async () => {
  const { asked, pass } = setUp()
  await pass(30_000)
  assert.equal(asked.length, 0)
})

test('Jev is asked as each line arrives, at most once a second, and not while people are quiet', async () => {
  const { asked, say, pass } = setUp()
  await pass(10_000)
  say('Ann', 'one')
  await pass(1_000)
  say('Peter', 'two')
  await pass(400)
  say('Ann', 'three')
  await pass(30_000)

  // Each line is looked at as it arrives, but one that comes within a second of the last look waits out the second.
  assert.deepEqual(asked, [['one'], ['one', 'two'], ['one', 'two', 'three']])
})

test('nothing more is asked of Jev once the session has ended, whatever is still heard', async () => {
  const { watcher, asked, say, pass } = setUp()
  watcher.stop()
  say('Peter', 'Does a shield count against arrows?')
  watcher.heard([{ speaker: 'Ann', text: 'Hello?', startSamples: 0, endSamples: RATE }])
  await pass(10_000)
  assert.equal(asked.length, 0)
})

test('lines caught up from long ago, as after a restart, are never put to Jev', async () => {
  const { watcher, asked, pass } = setUp()
  await pass(10 * 60 * 1000)
  watcher.heard([{ speaker: 'Peter', text: 'Does a shield count against arrows?', startSamples: 0, endSamples: 2 * RATE }])
  await pass(10_000)
  assert.equal(asked.length, 0)

  // The stale lines were dropped, not saved up: what is said next is put to Jev alone.
  watcher.heard([{ speaker: 'Ann', text: 'Okay.', startSamples: 610 * RATE, endSamples: 611 * RATE }])
  await pass(5_000)
  assert.deepEqual(asked, [['Okay.']])
})

test('below the threshold nothing is answered or posted', async () => {
  const { answered, posted, say, pass } = setUp({ probabilities: [0.7] })
  say('Ann', 'Can I climb it?')
  await pass(5_000)
  assert.equal(answered.length, 0)
  assert.equal(posted.length, 0)
})

test('a flagged question is answered from the stretch Jev saw, and posted as the bot\'s rules answer', async () => {
  const { answered, posted, logged, say, pass } = setUp({ probabilities: [0.95] })
  say('Jem', 'haha nice')
  say('Peter', 'Does a shield count against arrows?')
  await pass(5_000)

  assert.deepEqual(answered, [['haha nice', 'Does a shield count against arrows?']])
  assert.deepEqual(posted, [
    '**Shields**\nNo. A shield counts against melee attacks only.\n-# Shields · Peter: "does a shield count against arrows?"',
  ])
  assert.deepEqual(
    logged.map((entry) => entry.message),
    ['rules question heard', 'rules answer written', 'rules answer posted'],
  )
})

test('an answer from rules with nothing to cite them by, as for OSE, has no line naming its source', async () => {
  const notCovered: RulesAnswer = {
    kind: 'not_covered',
    title: 'Sleep',
    question: 'what does sleep do?',
    askedBy: 'Peter',
    answer: 'The rules do not cover what any spell does.',
    section: '',
  }
  const { posted, say, pass } = setUp({
    probabilities: [0.95, 0.95],
    answers: [{ ...ANSWERED, section: 'Combat › Initiative' }, notCovered],
    citedAs: null,
  })
  say('Peter', 'Who goes first?')
  await pass(1_000)
  say('Peter', 'And what does sleep do?')
  await pass(1_000)
  assert.deepEqual(posted, [
    `**Shields**\n${ANSWERED.answer}\n-# Peter: "does a shield count against arrows?"`,
    `**Sleep** — ${notCovered.answer}\n-# Peter: "what does sleep do?"`,
  ])
})

test('how long each part took is logged, from the end of the question to the answer in the channel', async () => {
  let clock = START
  const logged: { message: string; detail?: Record<string, unknown> }[] = []
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    citedAs: 'the rules document',
    now: () => clock,
    askJev: async () => {
      clock += 250
      return { rulesQuestion: 0.95, needs: {} }
    },
    answer: async () => {
      clock += 2_600
      return ANSWERED
    },
    post: async () => {
      clock += 300
    },
    log: (message, detail) => logged.push({ message, detail }),
  })
  // The question ended 10 seconds in, and arrived transcribed a second and a quarter later.
  watcher.heard([{ speaker: 'Peter', text: 'Does a shield count against arrows?', startSamples: 8 * RATE, endSamples: 10 * RATE }])
  clock = START + 11_250
  watcher.tick(clock)
  await watcher.idle()

  assert.deepEqual(
    logged.map((entry) => [entry.message, entry.detail]),
    [
      ['rules question heard', { probability: 0.95, lines: 1, jevMs: 250, sinceSpeechMs: 1_500 }],
      ['rules answer written', { kind: 'answered', answerMs: 2_600, characters: ANSWERED.answer.length }],
      ['rules answer posted', { kind: 'answered', section: 'Shields', messages: 1, postMs: 300, sinceSpeechMs: 4_400 }],
    ],
  )
})

test('a long answer is posted in order, in as many messages as it takes', async () => {
  const posted: string[] = []
  const long: RulesAnswer = { ...ANSWERED, answer: Array.from({ length: 60 }, (_, step) => `${step + 1}. ${'x'.repeat(60)}`).join('\n') }
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    citedAs: 'the rules document',
    askJev: async () => ({ rulesQuestion: 0.95, needs: {} }),
    answer: async () => long,
    // A slow first post must not let the second overtake it.
    post: (text) => new Promise((resolve) => setTimeout(() => resolve(posted.push(text)), posted.length === 0 ? 20 : 0)),
    log: () => undefined,
  })
  watcher.heard([{ speaker: 'Peter', text: 'How does a race work?', startSamples: 0, endSamples: 2 * RATE }])
  watcher.tick(START + 3_000)
  await watcher.idle()

  assert.ok(posted.length >= 2)
  assert.ok(posted.every((message) => message.length <= 2_000))
  assert.match(posted[0]!, /^\*\*Shields\*\*\n1\. x+/)
  assert.match(posted.at(-1)!, /-# Shields · Peter: "does a shield count against arrows\?"$/)
  // Nothing is lost or repeated across the parts.
  assert.equal(posted.join('\n'), `**Shields**\n${long.answer}\n-# Shields · Peter: "does a shield count against arrows?"`)
})

test("every answer posted in the session is shown to Jev and the answering model, so a question is not answered twice", async () => {
  const { asked, answered, jevPosted, answerPosted, posted, say, pass } = setUp({ probabilities: [0.95] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(2_000)
  assert.deepEqual(jevPosted, [[]])
  assert.deepEqual(answerPosted, [[]])

  say('Ann', 'Huh, melee only then.')
  await pass(2_000)
  // The windows overlap, so the answered question is still there, beside the bot's answer to it.
  assert.deepEqual(asked.at(-1), ['Does a shield count against arrows?', 'Huh, melee only then.'])
  assert.deepEqual(jevPosted.at(-1), ['does a shield count against arrows?'])
  assert.equal(answered.length, 1)
  assert.equal(posted.length, 1)
})

test('there is no pause after a flag: the next line is looked at as soon as the answer is posted, and that look already sees it', async () => {
  let release: () => void = () => undefined
  const asked: string[][] = []
  const seen: number[] = []
  let clock = START
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    citedAs: 'the rules document',
    askJev: async (window, posted) => {
      asked.push(window.map((line) => line.text))
      seen.push(posted.length)
      return { rulesQuestion: asked.length === 1 ? 0.95 : 0.05, needs: {} }
    },
    // The answer takes a while; nothing else is looked at meanwhile.
    answer: () => new Promise((resolve) => (release = () => resolve(ANSWERED))),
    post: async () => undefined,
    log: () => undefined,
    now: () => clock,
  })
  const line = (text: string, endSeconds: number): TranscriptLine => ({ speaker: 'Peter', text, startSamples: (endSeconds - 1) * RATE, endSamples: endSeconds * RATE })
  watcher.heard([line('Does a shield count against arrows?', 2)])
  clock = START + 3_000
  watcher.tick(clock)
  await new Promise((resolve) => setImmediate(resolve))
  watcher.heard([line('And what about bolts?', 4)])
  clock += 1_500
  watcher.tick(clock)
  assert.equal(asked.length, 1, 'one look at a time: the second waits for the answer')

  release()
  await watcher.idle()
  clock += 100
  watcher.tick(clock)
  await watcher.idle()
  assert.deepEqual(asked, [['Does a shield count against arrows?'], ['Does a shield count against arrows?', 'And what about bolts?']])
  assert.deepEqual(seen, [0, 1])
})

test('a different follow-up is still answered, with the earlier answer beside it', async () => {
  const { answered, answerPosted, posted, say, pass } = setUp({ probabilities: [0.95, 0.95], answers: [ANSWERED, FOLLOW_UP] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(2_000)
  say('Peter', 'Okay, and can I bash someone with the shield?')
  await pass(2_000)

  assert.deepEqual(answered.at(-1), ['Does a shield count against arrows?', 'Okay, and can I bash someone with the shield?'])
  assert.deepEqual(answerPosted, [[], ['does a shield count against arrows?']])
  assert.equal(posted.length, 2)
  assert.match(posted[1]!, /can I bash with the shield\?/)
})

test('answers are kept for the whole session, and only answers that were posted are remembered', async () => {
  const { watcher, jevPosted, say, pass } = setUp({ probabilities: [0.95, 0.95, 0.95], answers: [NO_QUESTION, new Error('OpenAI answered 500'), ANSWERED] })
  for (const line of ['Can I climb it?', 'Does a shield count?', 'Does a shield count against arrows?']) {
    say('Peter', line)
    await pass(2_000)
  }
  say('Ann', 'Okay.')
  await pass(2_000)
  assert.deepEqual(jevPosted, [[], [], [], ['does a shield count against arrows?']])

  await pass(3 * 60 * 60 * 1000)
  say('Ann', 'Three hours later.')
  await pass(2_000)
  assert.deepEqual(jevPosted.at(-1), ['does a shield count against arrows?'])
  assert.deepEqual(watcher.posted.map((answer) => answer.question), ['does a shield count against arrows?'])
})

test("ending the session lets its answers go, so a later session can ask the same thing again", async () => {
  const { watcher, say, pass } = setUp({ probabilities: [0.95] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(2_000)
  assert.equal(watcher.posted.length, 1)

  watcher.stop()
  assert.deepEqual(watcher.posted, [])
})

test('when the answering model finds no question, nothing is posted', async () => {
  const { posted, logged, say, pass } = setUp({ probabilities: [0.9], answers: [NO_QUESTION] })
  say('Ann', 'Can I climb the wall?')
  await pass(5_000)
  assert.deepEqual(posted, [])
  assert.ok(logged.some((entry) => entry.message === 'rules answer had no question to answer'))
})

test('a failing Jev is logged once for the whole outage, and once more when it recovers', async () => {
  const { jev, asked, posted, logged, say, pass } = setUp({ jevFails: true })
  for (let turn = 0; turn < 5; turn += 1) {
    say('Ann', `line ${turn}`)
    await pass(5_000)
  }
  jev.failing = false
  say('Ann', 'and again')
  await pass(5_000)

  assert.equal(asked.length, 6)
  assert.equal(posted.length, 0)
  assert.deepEqual(
    logged.map((entry) => entry.message),
    ['rules check failed', 'rules checks working again'],
  )
  assert.match(String(logged[0]!.detail!.error), /TypeSafe answered 503/)
  assert.deepEqual(logged[1]!.detail, { failedInARow: 5 })
})

test('a failing answering model is logged, and nothing is posted', async () => {
  const { answered, posted, logged, say, pass } = setUp({ probabilities: [0.95], answers: [new Error('OpenAI answered 500')] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(60_000)
  assert.equal(answered.length, 1)
  assert.deepEqual(posted, [])
  assert.ok(logged.some((entry) => entry.message === 'rules answer failed' && /OpenAI answered 500/.test(String(entry.detail?.error))))
})

test('an answer that arrives after the session has ended is not posted', async () => {
  let release: (answer: RulesAnswer) => void = () => undefined
  const posted: string[] = []
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    citedAs: 'the rules document',
    askJev: async () => ({ rulesQuestion: 0.95, needs: {} }),
    answer: () => new Promise((resolve) => (release = resolve)),
    post: async (text) => posted.push(text),
    log: () => undefined,
  })
  watcher.heard([{ speaker: 'Peter', text: 'Does a shield count?', startSamples: 0, endSamples: 2 * RATE }])
  watcher.tick(START + 3_000)
  await new Promise((resolve) => setImmediate(resolve))
  watcher.stop()
  release(ANSWERED)
  await watcher.idle()
  assert.deepEqual(posted, [])
})

/** A watcher for rules with both parts sent only when needed, whose Jev gives `verdict`, and what each answer was sent with. */
function withParts(verdict: JevVerdict, supplements: readonly Supplement[] = ['monsters', 'spellsAndItems']) {
  const askedAbout: (readonly Supplement[])[] = []
  const sent: (readonly Supplement[] | undefined)[] = []
  const logged: { message: string; detail?: Record<string, unknown> }[] = []
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    citedAs: null,
    supplements,
    askJev: async (_window, _posted, parts) => {
      askedAbout.push(parts)
      return verdict
    },
    answer: async (_window, _posted, needs) => {
      sent.push(needs)
      return ANSWERED
    },
    post: async () => undefined,
    log: (message, detail) => logged.push({ message, detail }),
    now: () => START + 3_000,
  })
  return { watcher, askedAbout, sent, logged }
}

async function ask(watcher: RulesWatcher) {
  watcher.heard([{ speaker: 'Peter', text: 'What does a ghoul do when it hits?', startSamples: 0, endSamples: 2 * RATE }])
  watcher.tick(START + 2_500)
  await watcher.idle()
}

test('a part of the rules is sent when Jev is at least fairly sure the question needs it, and not otherwise', async () => {
  const cases: [Partial<Record<Supplement, number>>, Supplement[]][] = [
    [{ monsters: 0.1, spellsAndItems: 0.2 }, []],
    [{ monsters: 0.9, spellsAndItems: 0.05 }, ['monsters']],
    [{ monsters: 0.05, spellsAndItems: SUPPLEMENT_THRESHOLD }, ['spellsAndItems']],
    [{ monsters: 0.6, spellsAndItems: 0.95 }, ['monsters', 'spellsAndItems']],
  ]
  for (const [needs, expected] of cases) {
    const { watcher, askedAbout, sent } = withParts({ rulesQuestion: 0.95, needs })
    await ask(watcher)
    assert.deepEqual(askedAbout, [['monsters', 'spellsAndItems']], 'Jev is asked about every part, in one request')
    assert.deepEqual(sent, [expected], `${JSON.stringify(needs)} sends ${expected.join(' and ') || 'no part'}`)
  }
  assert.ok(SUPPLEMENT_THRESHOLD > 0 && SUPPLEMENT_THRESHOLD < 0.8, 'a part is sent on less certainty than a question is answered on')
})

test('however sure Jev is that a part is needed, nothing is answered unless it is sure there is a rules question', async () => {
  const { watcher, sent, logged } = withParts({ rulesQuestion: 0.4, needs: { monsters: 0.99, spellsAndItems: 0.99 } })
  await ask(watcher)
  assert.deepEqual(sent, [])
  assert.deepEqual(logged, [])
})

test('what Jev said of each part and what was sent are logged', async () => {
  const { watcher, logged } = withParts({ rulesQuestion: 0.95, needs: { monsters: 0.9, spellsAndItems: 0.05 } })
  await ask(watcher)
  assert.deepEqual(logged.find((entry) => entry.message === 'rules question heard')?.detail?.needs, { monsters: 0.9, spellsAndItems: 0.05 })
  assert.deepEqual(logged.find((entry) => entry.message === 'rules answer written')?.detail?.sent, ['monsters'])
})

test('rules with no parts, as for Lubec, ask Jev about none and answer from the rules alone', async () => {
  const { watcher, askedAbout, sent, logged } = withParts({ rulesQuestion: 0.95, needs: {} }, [])
  await ask(watcher)
  assert.deepEqual(askedAbout, [[]])
  assert.deepEqual(sent, [[]])
  assert.equal(logged.find((entry) => entry.message === 'rules question heard')?.detail?.needs, undefined)
  assert.equal(logged.find((entry) => entry.message === 'rules answer written')?.detail?.sent, undefined)
})

test('under gmOnly, player lines stay in the window without calling Jev until the GM speaks', async () => {
  const { asked, jevGmKnown, answered, posted, say, pass } = setUp({ gmOnly: true, probabilities: [0.95] })
  say('Map Man', "Can I use Teacher's Pet?")
  await pass(5_000)
  assert.equal(asked.length, 0, 'player-only speech never wakes Jev')
  assert.equal(posted.length, 0)

  // When the GM expresses uncertainty, Jev wakes with the player's question still in context.
  say('DLB', 'Good question, I forget how that works.', true)
  await pass(2_000)
  assert.deepEqual(asked, [["Can I use Teacher's Pet?", 'Good question, I forget how that works.']])
  assert.deepEqual(jevGmKnown, [true])
  assert.equal(answered.length, 1)
  assert.equal(posted.length, 1)
})

test('under gmOnly, a player line arriving right after a GM line does not clear the pending GM check', async () => {
  const { asked, say, pass } = setUp({ gmOnly: true, probabilities: [0.05] })
  say('DLB', 'How do we do a panic check?', true)
  say('Map Man', 'Yeah I forgot too.')
  await pass(2_000)
  assert.deepEqual(asked, [['How do we do a panic check?', 'Yeah I forgot too.']])
})

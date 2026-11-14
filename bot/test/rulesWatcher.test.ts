import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RulesAnswer } from '../src/rules/answer.ts'
import type { TranscriptLine } from '../src/rules/transcriptWindow.ts'
import { RulesWatcher } from '../src/rules/watcher.ts'

const START = 1_800_000_000_000
const RATE = 48_000

const ANSWERED: RulesAnswer = {
  kind: 'answered',
  question: 'does a shield count against arrows?',
  askedBy: 'Peter',
  answer: 'No. A shield counts against melee attacks only.',
  section: 'Shields',
}
const FOLLOW_UP: RulesAnswer = {
  kind: 'answered',
  question: 'can I bash with the shield?',
  askedBy: 'Peter',
  answer: 'Yes, as an unarmed attack.',
  section: 'Shields',
}
const NO_QUESTION: RulesAnswer = { kind: 'no_question', question: '', askedBy: '', answer: '', section: '' }

/**
 * A watcher with a stand-in Jev and answering model, and a clock the test moves.
 * The answering model gives `answers` in turn, then the shield answer.
 */
function setUp(options: { probabilities?: number[]; answers?: (RulesAnswer | Error)[]; jevFails?: boolean } = {}) {
  const asked: string[][] = []
  const answered: string[][] = []
  /** The questions of the bot's recent answers that Jev, and the answering model, were shown each time. */
  const jevRecent: string[][] = []
  const answerRecent: string[][] = []
  const answers = [...(options.answers ?? [])]
  const posted: string[] = []
  const logged: { message: string; detail?: Record<string, unknown> }[] = []
  const probabilities = [...(options.probabilities ?? [])]
  const jev = { failing: options.jevFails ?? false }
  const watcher = new RulesWatcher({
    sessionStartedAtMs: START,
    askJev: async (window, recent) => {
      asked.push(window.map((line) => line.text))
      jevRecent.push(recent.map((answer) => answer.question))
      if (jev.failing) throw new Error('TypeSafe answered 503')
      return probabilities.shift() ?? 0.05
    },
    answer: async (window, recent) => {
      answered.push(window.map((line) => line.text))
      answerRecent.push(recent.map((answer) => answer.question))
      const next = answers.shift() ?? ANSWERED
      if (next instanceof Error) throw next
      return next
    },
    post: (text) => posted.push(text),
    log: (message, detail) => logged.push({ message, detail }),
  })
  let clock = START
  /** Someone says something that ends now, and it arrives transcribed. */
  const say = (speaker: string, text: string) => {
    const endSamples = Math.round(((clock - START) / 1000) * RATE)
    const line: TranscriptLine = { speaker, text, startSamples: endSamples - 2 * RATE, endSamples }
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
  return { watcher, jev, asked, answered, jevRecent, answerRecent, posted, logged, say, pass }
}

test('nothing is asked of Jev until someone has said something', async () => {
  const { asked, pass } = setUp()
  await pass(30_000)
  assert.equal(asked.length, 0)
})

test('Jev is asked about the latest stretch at most every few seconds while people talk, and not while they are quiet', async () => {
  const { asked, say, pass } = setUp()
  await pass(10_000)
  say('Ann', 'one')
  await pass(1_000)
  say('Peter', 'two')
  await pass(1_000)
  say('Ann', 'three')
  await pass(30_000)

  // The first line is looked at as soon as it arrives; the next two together, once a few seconds have passed.
  assert.deepEqual(asked, [['one'], ['one', 'two', 'three']])
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
    '**Rules answer** - Peter asked: "does a shield count against arrows?"\nNo. A shield counts against melee attacks only.\n-# From the rules document: Shields',
  ])
  assert.deepEqual(
    logged.map((entry) => entry.message),
    ['rules question heard', 'rules answer posted'],
  )
})

test("the bot's own recent answers are shown to Jev and the answering model, so a question is not answered twice", async () => {
  const { asked, answered, jevRecent, answerRecent, posted, say, pass } = setUp({ probabilities: [0.95] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(5_000)
  assert.deepEqual(jevRecent, [[]])
  assert.deepEqual(answerRecent, [[]])

  say('Ann', 'Huh, melee only then.')
  await pass(30_000)
  // The windows overlap, so the answered question is still there, beside the bot's answer to it.
  assert.deepEqual(asked.at(-1), ['Does a shield count against arrows?', 'Huh, melee only then.'])
  assert.deepEqual(jevRecent.at(-1), ['does a shield count against arrows?'])
  assert.equal(answered.length, 1)
  assert.equal(posted.length, 1)
})

test('only a short gap follows a flag, against overlapping windows firing on the same words', async () => {
  const { asked, say, pass } = setUp({ probabilities: [0.95] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(1_000)
  say('Ann', 'Hmm.')
  await pass(18_000)
  assert.equal(asked.length, 1)

  await pass(3_000)
  assert.equal(asked.length, 2)
})

test('a different follow-up is still answered, with the earlier answer beside it', async () => {
  const { answered, answerRecent, posted, say, pass } = setUp({ probabilities: [0.95, 0.95], answers: [ANSWERED, FOLLOW_UP] })
  say('Peter', 'Does a shield count against arrows?')
  await pass(25_000)
  say('Peter', 'Okay, and can I bash someone with the shield?')
  await pass(5_000)

  assert.deepEqual(answered.at(-1), ['Does a shield count against arrows?', 'Okay, and can I bash someone with the shield?'])
  assert.deepEqual(answerRecent, [[], ['does a shield count against arrows?']])
  assert.equal(posted.length, 2)
  assert.match(posted[1]!, /can I bash with the shield\?/)
})

test('recent answers are forgotten after a few minutes, and only answers that were posted are remembered', async () => {
  const { jevRecent, say, pass } = setUp({ probabilities: [0.95, 0.95, 0.95], answers: [NO_QUESTION, new Error('OpenAI answered 500'), ANSWERED] })
  for (const line of ['Can I climb it?', 'Does a shield count?', 'Does a shield count against arrows?']) {
    say('Peter', line)
    await pass(25_000)
  }
  say('Ann', 'Okay.')
  await pass(5_000)
  assert.deepEqual(jevRecent, [[], [], [], ['does a shield count against arrows?']])

  await pass(5 * 60 * 1000)
  say('Ann', 'Much later.')
  await pass(5_000)
  assert.deepEqual(jevRecent.at(-1), [])
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
    askJev: async () => 0.95,
    answer: () => new Promise((resolve) => (release = resolve)),
    post: (text) => posted.push(text),
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

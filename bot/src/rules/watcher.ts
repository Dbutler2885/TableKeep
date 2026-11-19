/**
 * Listening to a session for rules questions, and answering them in its
 * text channel.
 *
 * As the transcript grows, the last stretch of it is put to Jev each time
 * someone finishes speaking, with every rules answer the bot has posted in
 * the session. When Jev is sure enough that someone has asked a new rules
 * question those answers do not cover and nobody has answered, that stretch
 * goes to the answering model with the session's rules and the same answers,
 * and its answer is posted, naming the rules it comes from. When the rules
 * have parts sent only when a question needs them, Jev is asked in the same
 * request whether it needs each, and those it likely does go too.
 *
 * Every answer posted in the session is what keeps a question from being
 * answered twice, there and in any later look. There is no pause after a
 * flag: looks run one at a time, and an answer is remembered before the look
 * that posted it ends, so the next look always sees it. The answers belong to
 * the session and go with it, so a later session can ask the same thing again.
 *
 * Nothing here can disturb the recording. Every call is made off the
 * recorder's path, one at a time, and a failure is logged and dropped.
 */
import { rulesAnswerMessages } from '../discord/replies.ts'
import type { AnswerRulesQuestion, RulesAnswer } from './answer.ts'
import type { RuleSet, Supplement } from './books.ts'
import type { AskJev } from './jev.ts'
import { SESSION_SAMPLE_RATE, TranscriptWindow, type PostedAnswer, type TranscriptLine } from './transcriptWindow.ts'

export type Log = (message: string, detail?: Record<string, unknown>) => void

/**
 * How sure Jev must be that a rules question needs a part of the rules sent
 * only when needed, such as the OSE monsters, for that part to be sent. It
 * counts only once Jev is sure there is a rules question at all. It is well
 * below that bar on purpose: sending a part that was not needed costs a few
 * cents and a little time, while leaving out one that was turns a question the
 * rules answer into "not covered". On eight hand-written OSE windows, every
 * part a question needed came out at 0.80 to 0.99, and every part it did not
 * at 0.37 or less (the spells part, for a cleric asking how turning works).
 */
export const SUPPLEMENT_THRESHOLD = 0.5

/** How a watcher can be tuned, and what it does when it is not. */
const DEFAULTS = {
  /**
   * How sure Jev must be. On trial windows it put new rules questions,
   * follow-ups included, at 0.92 to 0.99, and a question asked as a statement
   * ("forget how that's handled in the rules") at 0.84 to 0.86. Everything
   * else, questions the bot had already answered in the session included, came
   * out at 0.25 or less. Asking the GM about an action in the story ("can I
   * climb it?") came out at 0.82 to 0.90; that is not a rules question, and
   * the answering model is told to find no question in it.
   */
  threshold: 0.8,
  /** How soon after one look the next may start, while people are talking. Jev answers in about a quarter of a second. */
  checkEveryMs: 1_000,
  /** How far back each look reaches. */
  windowSeconds: 90,
  maxWindowChars: 4_000,
  /** The clock that answers are timed by, for the log. */
  now: Date.now as () => number,
}

/** One rule set's rules, as a session is answered from them. */
export type SessionRules = {
  /** Answers from this rule set's rules. */
  answer: AnswerRulesQuestion
  /** The parts of this rule set's rules sent only when a question needs them, which Jev is asked about. */
  supplements?: readonly Supplement[]
  /** How a posted answer's last line names the rules it comes from, or null for no such line. */
  citedAs: string | null
}

/** What answering rules questions needs, shared by every session. */
export type RulesAnswering = {
  askJev: AskJev
  /** The rules a session is answered from, by its campaign's rule set. A rule set without any is not answered. */
  byRuleSet: Partial<Record<RuleSet, SessionRules>>
  log: Log
} & Partial<typeof DEFAULTS>

export type RulesWatcherOptions = Omit<RulesAnswering, 'byRuleSet'> & SessionRules & {
  /** When the session started, which its transcript's times count from. */
  sessionStartedAtMs: number
  /** Posts one message in the session's text channel, resolving once it is there. */
  post: (text: string) => Promise<unknown>
}

export class RulesWatcher {
  #options: Required<RulesWatcherOptions>
  #window: TranscriptWindow
  /** Every rules answer posted in this session, oldest first. */
  #posted: PostedAnswer[] = []
  /** Whether anything has been said since the transcript was last looked at. */
  #fresh = false
  #nextCheckAtMs = 0
  #working: Promise<void> | null = null
  #stopped = false
  /** How many looks in a row have failed, so that an outage is logged once and not every few seconds. */
  #failures = 0

  constructor(options: RulesWatcherOptions) {
    this.#options = { ...DEFAULTS, supplements: [], ...options }
    this.#window = new TranscriptWindow({ windowSeconds: this.#options.windowSeconds, maxChars: this.#options.maxWindowChars })
  }

  /** Newly transcribed lines. */
  heard(lines: readonly TranscriptLine[]): void {
    if (this.#stopped || lines.length === 0) return
    this.#window.add(lines)
    this.#fresh = true
  }

  /** Call several times a second. Starts a look at the transcript when one is due. */
  tick(nowMs: number): void {
    if (!this.#due(nowMs)) return
    const nowSamples = Math.round(((nowMs - this.#options.sessionStartedAtMs) / 1000) * SESSION_SAMPLE_RATE)
    const window = this.#window.at(nowSamples)
    this.#fresh = false
    this.#nextCheckAtMs = nowMs + this.#options.checkEveryMs
    if (window.length === 0) return
    this.#working = this.#look(window).finally(() => {
      this.#working = null
    })
  }

  /** Whether to look now: something new has been said, nothing is under way, and the last look was long enough ago. */
  #due(nowMs: number): boolean {
    if (this.#stopped || this.#working || !this.#fresh) return false
    return nowMs >= this.#nextCheckAtMs
  }

  /** The session has ended: nothing more is looked at, an answer still on its way is not posted, and the session's answers are let go. */
  stop(): void {
    this.#stopped = true
    this.#posted = []
  }

  /** Every rules answer posted in this session so far, oldest first. */
  get posted(): readonly PostedAnswer[] {
    return this.#posted
  }

  /** Resolves once the look under way, if any, has finished. */
  async idle(): Promise<void> {
    await this.#working
  }

  /** How long ago, by the answer clock, the last line of the window was finished being said. */
  #sinceSpeechMs(window: readonly TranscriptLine[]): number {
    const endedAtMs = this.#options.sessionStartedAtMs + (window.at(-1)!.endSamples / SESSION_SAMPLE_RATE) * 1000
    return Math.round(this.#options.now() - endedAtMs)
  }

  async #look(window: TranscriptLine[]): Promise<void> {
    const posted = [...this.#posted]
    const needs = await this.#check(window, posted)
    if (!needs) return
    const reply = await this.#answer(window, posted, needs)
    if (reply) await this.#post(reply, window)
  }

  /**
   * When Jev is sure enough that the window holds a new rules question, the
   * parts of the rules it likely needs. Nothing when there is no such
   * question, or Jev could not be asked.
   */
  async #check(window: TranscriptLine[], posted: PostedAnswer[]): Promise<Supplement[] | null> {
    const { askJev, log, now, supplements } = this.#options
    const startedAtMs = now()
    try {
      const verdict = await askJev(window, posted, supplements)
      if (this.#failures > 0) log('rules checks working again', { failedInARow: this.#failures })
      this.#failures = 0
      if (verdict.rulesQuestion < this.#options.threshold) return null
      const needs = supplements.filter((supplement) => (verdict.needs[supplement] ?? 0) >= SUPPLEMENT_THRESHOLD)
      log('rules question heard', {
        probability: verdict.rulesQuestion,
        ...(supplements.length > 0 && { needs: verdict.needs }),
        lines: window.length,
        jevMs: now() - startedAtMs,
        sinceSpeechMs: this.#sinceSpeechMs(window),
      })
      return needs
    } catch (error) {
      this.#failures += 1
      if (this.#failures === 1) log('rules check failed', { error: String(error) })
      return null
    }
  }

  /** The answering model's reply, from the rules and the parts of them in `needs`, or nothing when it could not be had. */
  async #answer(window: TranscriptLine[], posted: PostedAnswer[], needs: Supplement[]): Promise<RulesAnswer | null> {
    const { answer, log, now } = this.#options
    const startedAtMs = now()
    try {
      const reply = await answer(window, posted, needs)
      log('rules answer written', {
        kind: reply.kind,
        ...(needs.length > 0 && { sent: needs }),
        answerMs: now() - startedAtMs,
        characters: reply.answer.length,
      })
      return reply
    } catch (error) {
      log('rules answer failed', { error: String(error) })
      return null
    }
  }

  /** Posts an answer, in as many messages as it takes, and remembers it for the rest of the session. */
  async #post(reply: RulesAnswer, window: TranscriptLine[]): Promise<void> {
    const { post, log, now, citedAs } = this.#options
    if (this.#stopped) return
    const messages = rulesAnswerMessages(reply, citedAs)
    if (messages.length === 0) {
      log('rules answer had no question to answer')
      return
    }
    const startedAtMs = now()
    // In order: each part waits for the one before it to be in the channel.
    for (const message of messages) await post(message)
    this.#posted.push({ askedBy: reply.askedBy, question: reply.question, answer: reply.answer })
    log('rules answer posted', {
      kind: reply.kind,
      section: reply.section,
      messages: messages.length,
      postMs: now() - startedAtMs,
      sinceSpeechMs: this.#sinceSpeechMs(window),
    })
  }
}

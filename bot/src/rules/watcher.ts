/**
 * Listening to a session for rules questions, and answering them in its
 * text channel.
 *
 * As the transcript grows, the last stretch of it is put to Jev every few
 * seconds. When Jev is sure enough that someone has asked a rules question
 * nobody has answered, that stretch goes to the answering model with the rules
 * document, and its answer is posted. The stretch is then settled, so the same
 * question is not answered twice, and nothing more is flagged for a while.
 *
 * Nothing here can disturb the recording. Every call is made off the
 * recorder's path, one at a time, and a failure is logged and dropped.
 */
import { rulesAnswerMessage } from '../discord/replies.ts'
import type { AnswerRulesQuestion } from './answer.ts'
import type { AskJev } from './jev.ts'
import { SESSION_SAMPLE_RATE, TranscriptWindow, type TranscriptLine } from './transcriptWindow.ts'

/**
 * How sure Jev must be. On trial windows it put real rules questions at 0.89
 * to 0.98 and everything else at 0.21 or less; an in-game action phrased as a
 * question ("can I climb it?") came out near 0.7, and is not one.
 */
const DEFAULT_THRESHOLD = 0.8
/** How often the transcript is looked at, at most, while people are talking. */
const DEFAULT_CHECK_EVERY_MS = 4_000
/** After a question is flagged, how long before another can be. */
const DEFAULT_COOLDOWN_MS = 45_000
/** How far back each look reaches. */
const DEFAULT_WINDOW_SECONDS = 90
const DEFAULT_MAX_WINDOW_CHARS = 4_000

export type Log = (message: string, detail?: Record<string, unknown>) => void

/** What answering rules questions needs, shared by every session. */
export type RulesAnswering = {
  askJev: AskJev
  answer: AnswerRulesQuestion
  log: Log
  threshold?: number
  checkEveryMs?: number
  cooldownMs?: number
  windowSeconds?: number
  maxWindowChars?: number
}

export type RulesWatcherOptions = RulesAnswering & {
  /** When the session started, which its transcript's times count from. */
  sessionStartedAtMs: number
  /** Posts in the session's text channel. */
  post: (text: string) => void
}

export class RulesWatcher {
  #options: RulesWatcherOptions
  #window: TranscriptWindow
  #threshold: number
  #checkEveryMs: number
  #cooldownMs: number
  /** Whether anything has been said since the transcript was last looked at. */
  #fresh = false
  #nextCheckAtMs = 0
  #quietUntilMs = 0
  #working: Promise<void> | null = null
  #stopped = false
  /** How many looks in a row have failed, so that an outage is logged once and not every few seconds. */
  #failures = 0

  constructor(options: RulesWatcherOptions) {
    this.#options = options
    this.#threshold = options.threshold ?? DEFAULT_THRESHOLD
    this.#checkEveryMs = options.checkEveryMs ?? DEFAULT_CHECK_EVERY_MS
    this.#cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
    this.#window = new TranscriptWindow({
      windowSeconds: options.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
      maxChars: options.maxWindowChars ?? DEFAULT_MAX_WINDOW_CHARS,
    })
  }

  /** Newly transcribed lines. */
  heard(lines: readonly TranscriptLine[]): void {
    if (this.#stopped || lines.length === 0) return
    this.#window.add(lines)
    this.#fresh = true
  }

  /** Call several times a second. Starts a look at the transcript when one is due. */
  tick(nowMs: number): void {
    if (this.#stopped || this.#working || !this.#fresh) return
    if (nowMs < this.#nextCheckAtMs || nowMs < this.#quietUntilMs) return
    const nowSamples = Math.round(((nowMs - this.#options.sessionStartedAtMs) / 1000) * SESSION_SAMPLE_RATE)
    const window = this.#window.at(nowSamples)
    this.#fresh = false
    this.#nextCheckAtMs = nowMs + this.#checkEveryMs
    if (window.length === 0) return
    this.#working = this.#look(window, nowMs).finally(() => {
      this.#working = null
    })
  }

  /** The session has ended: nothing more is looked at, and an answer still on its way is not posted. */
  stop(): void {
    this.#stopped = true
  }

  /** Resolves once the look under way, if any, has finished. */
  async idle(): Promise<void> {
    await this.#working
  }

  async #look(window: TranscriptLine[], nowMs: number): Promise<void> {
    const { askJev, answer, post, log } = this.#options
    let probability: number
    try {
      probability = await askJev(window)
    } catch (error) {
      this.#failures += 1
      if (this.#failures === 1) log('rules check failed', { error: String(error) })
      return
    }
    if (this.#failures > 0) log('rules checks working again', { failedInARow: this.#failures })
    this.#failures = 0
    if (probability < this.#threshold) return

    // From here on this stretch is dealt with, whatever the answer turns out to be.
    this.#window.settle(window)
    this.#quietUntilMs = nowMs + this.#cooldownMs
    log('rules question heard', { probability, lines: window.length })
    let reply
    try {
      reply = await answer(window)
    } catch (error) {
      log('rules answer failed', { error: String(error) })
      return
    }
    if (this.#stopped) return
    const text = rulesAnswerMessage(reply)
    if (!text) {
      log('rules answer had no question to answer')
      return
    }
    post(text)
    log('rules answer posted', { kind: reply.kind, section: reply.section })
  }
}

/**
 * Turning one speaker's voice into utterances on the session timeline.
 *
 * The speech service is sent only what Discord transmitted, so its clock counts
 * only the audio it was given and falls steadily behind the session. A map from
 * each stretch of audio sent to the stretch of session it came from translates
 * the service's word times back.
 *
 * Because no silence is sent, the service rarely hears a pause for itself. Once
 * a speaker has transmitted nothing for a moment the service is asked to settle
 * what it has, and that ends the utterance.
 *
 * Progress is reported as a checkpoint: a position on the session timeline up
 * to which this speaker's audio has been fully dealt with, whether it produced
 * words or not. It only ever moves over audio the service has settled.
 *
 * Audio is kept until the checkpoint has passed it. If the connection to the
 * service is lost, a new one is opened and everything after the checkpoint is
 * sent again, so an outage delays the transcript and loses none of it.
 */
import { createRequire } from 'node:module'
import { isSilenceFrame, OPUS_SAMPLE_RATE } from '../audio/opus.ts'
import type { PlacedPacket } from '../audio/timeline.ts'
import { TimeMap } from '../replay/timeMap.ts'

const require = createRequire(import.meta.url)
const { OpusEncoder } = require('@discordjs/opus') as {
  OpusEncoder: new (rate: number, channels: number) => { decode(packet: Buffer): Buffer }
}

/** The rate and layout the speech service is sent: enough for speech, a third of the data. */
export const SPEECH_SAMPLE_RATE = 16_000

/** With nothing from the speaker for this long, ask the service to settle what it has. */
const SETTLE_AFTER_QUIET_MS = 700
/** A quiet connection is told it is still alive this often; the service closes one left silent for ten seconds. */
const KEEP_ALIVE_MS = 3_000
/** The service's account of how much it has settled may fall this far short of what was sent and still count as all of it. */
const SETTLED_WITHIN_SECONDS = 0.05
/** How long after an answer that stopped short the service is asked to settle the rest. */
const ASK_AGAIN_AFTER_MS = 1_000
/** If the service has settled nothing more for this long after being asked, stop waiting for it. */
const SETTLE_TIMEOUT_MS = 4_000
/** The service accepts audio at up to this multiple of real time. Catching up after an outage is paced to it. */
const MAX_SPEED = 1.25
/** How much audio may be sent at once, ahead of that pace, so that ordinary jitter never holds live speech back. */
const BURST_SECONDS = 3
/** How long to wait before trying the service again after losing it: doubling from the first to the second. */
const RETRY_MS = { first: 1_000, longest: 30_000 }
/** This many failed tries in a row, about seven seconds, is an outage and not a blip. */
const STRUGGLING_AFTER_FAILURES = 3

export type Utterance = {
  speakerId: string
  /** Samples at 48 kHz from the start of the session. */
  startSamples: number
  endSamples: number
  text: string
}

type ServiceWord = { word: string; punctuated_word?: string; start: number; end: number }

/** The fields of a speech service result this module reads. Times are seconds on the service's clock. */
export type SpeechResult = {
  type: 'Results'
  start?: number
  duration?: number
  is_final?: boolean
  speech_final?: boolean
  from_finalize?: boolean
  channel?: { alternatives?: { words?: ServiceWord[] }[] }
}

/** A live connection to the speech service for one speaker. */
export interface SpeechConnection {
  /** Sends 16 kHz mono 16-bit audio. */
  sendAudio(samples: Int16Array): void
  /** Asks the service to settle everything it has heard, without waiting for a pause. */
  finalize(): void
  keepAlive(): void
  close(): Promise<void>
  onmessage: ((message: Record<string, unknown>) => void) | null
  /** Called if the connection ends without `close` having been asked for. */
  onclose: (() => void) | null
}

/** Opens a connection. May throw if the service cannot be reached at all. */
export type ConnectSpeech = (options: { keyterms: string[] }) => SpeechConnection

export type TranscriberOptions = {
  speakerId: string
  connect: ConnectSpeech
  keyterms: string[]
  /**
   * Where on the session timeline to begin. Audio before it has already been
   * transcribed, as when a session is picked up again after a restart.
   */
  resumeFromSamples?: number
  /**
   * Called with utterances that have just finished and the checkpoint that
   * goes with them. Either may be all there is: a stretch with no words still
   * moves the checkpoint.
   */
  onProgress: (utterances: Utterance[], checkpointSamples: number) => void
}

export class SpeakerTranscriber {
  #options: TranscriberOptions
  #decoder = new OpusEncoder(SPEECH_SAMPLE_RATE, 1)
  #connection: SpeechConnection | null = null
  #map = new TimeMap()
  /** Audio the checkpoint has not yet passed, in order. Up to `#sent` of it has gone to the current connection. */
  #pending: PlacedPacket[] = []
  #sent = 0
  /** Settled words that have not yet been closed off into an utterance. */
  #words: ServiceWord[] = []
  /** How far the service has settled, on its own clock. */
  #settledStreamSeconds = 0
  #checkpointSamples: number
  #nowMs = 0
  #lastAudioAtMs = 0
  #lastSignalAtMs = 0
  /** When the service was last asked to settle, if it has not yet answered, and how much it had been sent by then. */
  #settleRequestedAtMs: number | null = null
  #settleRequestedStreamSeconds = 0
  /** When to ask again, after an answer that did not cover everything. */
  #askAgainAtMs: number | null = null
  /** Seconds of audio that may be sent right now without outrunning the service. */
  #allowanceSeconds = BURST_SECONDS
  #allowanceAtMs: number | null = null
  #failures = 0
  #retryAtMs = 0
  #closing = false

  constructor(options: TranscriberOptions) {
    this.#options = options
    this.#checkpointSamples = options.resumeFromSamples ?? 0
  }

  get checkpointSamples(): number {
    return this.#checkpointSamples
  }

  /** Whether everything this speaker has said has been dealt with by the service. */
  get caughtUp(): boolean {
    return this.#pending.length === 0
  }

  /** Whether the service has been out of reach for several tries running. */
  get struggling(): boolean {
    return this.#failures >= STRUGGLING_AFTER_FAILURES
  }

  /** Takes the speaker's next packet, in order. */
  write(packet: PlacedPacket, nowMs: number): void {
    this.#nowMs = nowMs
    // The frames a client sends to end a burst carry no speech and need no transcribing.
    if (isSilenceFrame(packet.payload)) return
    if (packet.positionSamples + packet.durationSamples <= this.#checkpointSamples) return
    this.#pending.push(packet)
    this.#send(nowMs)
  }

  /** Called several times a second: sends what is waiting, settles a speaker who has gone quiet, keeps the connection alive. */
  tick(nowMs: number): void {
    this.#nowMs = nowMs
    this.#send(nowMs)
    const connection = this.#connection
    if (!connection) return

    const everythingSent = this.#sent === this.#pending.length
    const quietLongEnough = this.#closing || nowMs - this.#lastAudioAtMs >= SETTLE_AFTER_QUIET_MS
    if (everythingSent && this.#pending.length > 0 && this.#settleRequestedAtMs === null && quietLongEnough) {
      // Noted before asking, so that an answer is recognised however quickly it comes.
      this.#settleRequestedAtMs = nowMs
      this.#settleRequestedStreamSeconds = this.#map.streamSeconds
      this.#askAgainAtMs = null
      this.#lastSignalAtMs = nowMs
      connection.finalize()
    } else if (this.#settleRequestedAtMs !== null && this.#askAgainAtMs !== null && nowMs >= this.#askAgainAtMs) {
      this.#askAgainAtMs = null
      this.#lastSignalAtMs = nowMs
      connection.finalize()
    }
    // The service does not promise an answer when there was little to settle.
    if (this.#settleRequestedAtMs !== null && nowMs - this.#settleRequestedAtMs >= SETTLE_TIMEOUT_MS) {
      this.#concludeSettling()
    }
    if (nowMs - this.#lastSignalAtMs >= KEEP_ALIVE_MS) {
      connection.keepAlive()
      this.#lastSignalAtMs = nowMs
    }
  }

  /**
   * Settles everything outstanding and closes the connection.
   *
   * It keeps working, through lost connections if need be, until the service
   * has dealt with everything or `giveUpAfterMs` of real time has passed.
   * Resolves to whether everything was dealt with.
   */
  async close(nowMs: number, giveUpAfterMs = 2 * SETTLE_TIMEOUT_MS): Promise<boolean> {
    this.#closing = true
    const began = performance.now()
    for (;;) {
      const elapsed = performance.now() - began
      this.tick(nowMs + elapsed)
      if (this.caughtUp || elapsed >= giveUpAfterMs) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const connection = this.#connection
    this.#connection = null
    if (connection) {
      connection.onclose = null
      await connection.close()
    }
    return this.caughtUp
  }

  /** Sends as much waiting audio as the pace allows, opening a connection first if there is none. */
  #send(nowMs: number): void {
    if (this.#sent === this.#pending.length) return
    if (!this.#connection && !this.#open(nowMs)) return

    if (this.#allowanceAtMs !== null) {
      const earned = ((nowMs - this.#allowanceAtMs) / 1000) * MAX_SPEED
      this.#allowanceSeconds = Math.min(BURST_SECONDS, this.#allowanceSeconds + Math.max(0, earned))
    }
    this.#allowanceAtMs = nowMs

    while (this.#sent < this.#pending.length) {
      const packet = this.#pending[this.#sent]!
      const seconds = packet.durationSamples / OPUS_SAMPLE_RATE
      if (seconds > this.#allowanceSeconds) break
      const connection = this.#connection
      if (!connection) break
      const pcm = this.#decoder.decode(Buffer.from(packet.payload))
      connection.sendAudio(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2))
      // Lost in the act of sending: everything waiting goes to the next connection instead.
      if (this.#connection !== connection) break
      this.#map.append(packet.positionSamples / OPUS_SAMPLE_RATE, seconds)
      this.#allowanceSeconds -= seconds
      this.#sent += 1
      this.#lastAudioAtMs = nowMs
      this.#lastSignalAtMs = nowMs
      this.#settleRequestedAtMs = null
    }
  }

  /**
   * Opens a connection, unless the service was lost too recently to try again.
   *
   * It opens when a person first has something to transcribe, not when they
   * join: the service expects audio soon after a connection opens.
   */
  #open(nowMs: number): boolean {
    if (nowMs < this.#retryAtMs) return false
    let connection: SpeechConnection
    try {
      connection = this.#options.connect({ keyterms: this.#options.keyterms })
    } catch {
      this.#lost()
      return false
    }
    connection.onmessage = (message) => {
      if (this.#connection !== connection) return
      if (message.type === 'Results') this.#hear(message as unknown as SpeechResult)
    }
    connection.onclose = () => {
      if (this.#connection === connection) this.#lost()
    }
    this.#connection = connection
    // A new connection has heard nothing: its clock starts at zero and everything waiting is sent to it afresh.
    this.#decoder = new OpusEncoder(SPEECH_SAMPLE_RATE, 1)
    this.#map = new TimeMap()
    this.#words = []
    this.#settledStreamSeconds = 0
    this.#sent = 0
    this.#settleRequestedAtMs = null
    this.#lastSignalAtMs = nowMs
    return true
  }

  /** The service has gone. Wait a while, longer each time, before trying it again. */
  #lost(): void {
    this.#connection = null
    this.#settleRequestedAtMs = null
    this.#sent = 0
    this.#retryAtMs = this.#nowMs + Math.min(RETRY_MS.longest, RETRY_MS.first * 2 ** this.#failures)
    this.#failures += 1
  }

  #hear(result: SpeechResult): void {
    if (!result.is_final) return
    // An answer means the service is there; the next loss starts its waits from the beginning.
    this.#failures = 0
    const words = result.channel?.alternatives?.[0]?.words ?? []
    this.#words.push(...words)
    const settledBefore = this.#settledStreamSeconds
    if (result.start !== undefined && result.duration !== undefined) {
      this.#settledStreamSeconds = Math.max(this.#settledStreamSeconds, result.start + result.duration)
    }
    // A request to settle is answered once the service has settled everything sent before it. Its
    // answer can stop short of that when audio was sent faster than it was spoken, as when catching up
    // after an outage: it settles what it had got through and holds the rest until it is asked again.
    const settling = this.#settleRequestedAtMs !== null
    const answered = settling && this.#settledStreamSeconds >= this.#settleRequestedStreamSeconds - SETTLED_WITHIN_SECONDS
    // An answer that stopped short ends nothing: the sentence carries on in the next one.
    const paused = result.from_finalize ? !settling : result.speech_final
    const utterance = answered || paused ? this.#closeUtterance() : null
    // While words are held back for an utterance still in progress, the
    // checkpoint must not pass them: it stays where the utterance begins.
    const reach = this.#words.length > 0 ? this.#words[0]!.start : this.#settledStreamSeconds
    this.#advance(utterance ? [utterance] : [], reach)
    if (answered) {
      this.#settleRequestedAtMs = null
    } else if (settling && result.from_finalize) {
      if (this.#settledStreamSeconds > settledBefore) this.#settleRequestedAtMs = this.#nowMs
      this.#askAgainAtMs = this.#nowMs + ASK_AGAIN_AFTER_MS
    }
  }

  /** Gives up waiting for the service to answer, and takes everything sent as dealt with. */
  #concludeSettling(): void {
    const utterance = this.#closeUtterance()
    this.#settledStreamSeconds = this.#map.streamSeconds
    this.#advance(utterance ? [utterance] : [], this.#settledStreamSeconds)
    this.#settleRequestedAtMs = null
  }

  #closeUtterance(): Utterance | null {
    const first = this.#words[0]
    const last = this.#words.at(-1)
    if (!first || !last) return null
    const utterance: Utterance = {
      speakerId: this.#options.speakerId,
      startSamples: Math.round(this.#map.spanToSession(first.start, first.end).start * OPUS_SAMPLE_RATE),
      endSamples: Math.round(this.#map.spanToSession(last.start, last.end).end * OPUS_SAMPLE_RATE),
      text: this.#words.map((word) => word.punctuated_word ?? word.word).join(' '),
    }
    this.#words = []
    return utterance
  }

  #advance(utterances: Utterance[], streamSeconds: number): void {
    const reached = Math.round(this.#map.toSession(streamSeconds, 'end') * OPUS_SAMPLE_RATE)
    const checkpoint = Math.max(this.#checkpointSamples, reached)
    if (utterances.length === 0 && checkpoint === this.#checkpointSamples) return
    this.#checkpointSamples = checkpoint

    // Audio the checkpoint has passed is done with and need not be kept.
    let done = 0
    while (done < this.#sent && this.#pending[done]!.positionSamples + this.#pending[done]!.durationSamples <= checkpoint) done += 1
    this.#pending.splice(0, done)
    this.#sent -= done

    this.#options.onProgress(utterances, checkpoint)
  }
}

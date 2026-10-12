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
/** If the service has not answered a request to settle within this long, stop waiting for it. */
const SETTLE_TIMEOUT_MS = 4_000

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
}

export type ConnectSpeech = (options: { keyterms: string[] }) => SpeechConnection

export type TranscriberOptions = {
  speakerId: string
  connect: ConnectSpeech
  keyterms: string[]
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
  /** Settled words that have not yet been closed off into an utterance. */
  #words: ServiceWord[] = []
  #lastAudioAtMs = 0
  #lastSignalAtMs = 0
  /** When the service was last asked to settle, if it has not yet answered. */
  #settleRequestedAtMs: number | null = null
  #settled = true
  /** How far the service has settled, on its own clock. */
  #settledStreamSeconds = 0
  #checkpointSamples = 0

  constructor(options: TranscriberOptions) {
    this.#options = options
  }

  get checkpointSamples(): number {
    return this.#checkpointSamples
  }

  /** Takes the speaker's next packet, in order. */
  write(packet: PlacedPacket, nowMs: number): void {
    // The frames a client sends to end a burst carry no speech and need no transcribing.
    if (isSilenceFrame(packet.payload)) return

    // The connection opens when a person first speaks, not when they join: the
    // service expects audio soon after a connection opens.
    this.#connection ??= this.#open()

    const pcm = this.#decoder.decode(Buffer.from(packet.payload))
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2)
    this.#connection.sendAudio(samples)
    this.#map.append(packet.positionSamples / OPUS_SAMPLE_RATE, packet.durationSamples / OPUS_SAMPLE_RATE)
    this.#lastAudioAtMs = nowMs
    this.#lastSignalAtMs = nowMs
    this.#settled = false
    this.#settleRequestedAtMs = null
  }

  /** Called regularly: settles a speaker who has gone quiet and keeps a quiet connection alive. */
  tick(nowMs: number): void {
    if (!this.#connection) return

    if (!this.#settled && this.#settleRequestedAtMs === null && nowMs - this.#lastAudioAtMs >= SETTLE_AFTER_QUIET_MS) {
      this.#connection.finalize()
      this.#settleRequestedAtMs = nowMs
      this.#lastSignalAtMs = nowMs
    }
    // The service does not promise an answer when there was little to settle.
    if (this.#settleRequestedAtMs !== null && nowMs - this.#settleRequestedAtMs >= SETTLE_TIMEOUT_MS) {
      this.#concludeSettling()
    }
    if (nowMs - this.#lastSignalAtMs >= KEEP_ALIVE_MS) {
      this.#connection.keepAlive()
      this.#lastSignalAtMs = nowMs
    }
  }

  /** Settles everything outstanding and closes the connection. */
  async close(nowMs: number): Promise<void> {
    const connection = this.#connection
    if (!connection) return
    if (!this.#settled) {
      const answered = new Promise<void>((resolve) => {
        this.#whenSettled = resolve
      })
      connection.finalize()
      this.#settleRequestedAtMs = nowMs
      await Promise.race([answered, new Promise<void>((resolve) => setTimeout(resolve, SETTLE_TIMEOUT_MS))])
      if (!this.#settled) this.#concludeSettling()
    }
    await connection.close()
    this.#connection = null
  }

  #whenSettled: (() => void) | null = null

  #open(): SpeechConnection {
    const connection = this.#options.connect({ keyterms: this.#options.keyterms })
    connection.onmessage = (message) => {
      if (message.type === 'Results') this.#hear(message as unknown as SpeechResult)
    }
    return connection
  }

  #hear(result: SpeechResult): void {
    if (!result.is_final) return
    const words = result.channel?.alternatives?.[0]?.words ?? []
    this.#words.push(...words)
    if (result.start !== undefined && result.duration !== undefined) {
      this.#settledStreamSeconds = Math.max(this.#settledStreamSeconds, result.start + result.duration)
    }

    const utterance = result.speech_final || result.from_finalize ? this.#closeUtterance() : null
    // While words are held back for an utterance still in progress, the
    // checkpoint must not pass them: it stays where the utterance begins.
    const reach = this.#words.length > 0 ? this.#words[0]!.start : this.#settledStreamSeconds
    this.#advance(utterance ? [utterance] : [], reach)

    if (result.from_finalize) {
      this.#settled = this.#map.streamSeconds <= this.#settledStreamSeconds + 0.05
      this.#settleRequestedAtMs = null
      this.#whenSettled?.()
      this.#whenSettled = null
    }
  }

  /** Gives up waiting for the service to answer, and takes everything sent as dealt with. */
  #concludeSettling(): void {
    const utterance = this.#closeUtterance()
    this.#settledStreamSeconds = this.#map.streamSeconds
    this.#advance(utterance ? [utterance] : [], this.#settledStreamSeconds)
    this.#settled = true
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
    this.#options.onProgress(utterances, checkpoint)
  }
}

/**
 * A stand-in for the speech service, for tests.
 *
 * It keeps count of the audio it is sent and answers a request to settle the
 * way the real service does: with a final result covering everything since the
 * last one. Its "words" are one every half second of audio, named by where they
 * fall on its own clock, so a test can tell exactly which audio an utterance
 * came from.
 */
import { SPEECH_SAMPLE_RATE, type ConnectSpeech, type SpeechConnection, type SpeechResult } from '../../src/speech/transcriber.ts'

export class ScriptedConnection implements SpeechConnection {
  onmessage: ((message: Record<string, unknown>) => void) | null = null
  readonly keyterms: string[]
  /** Everything asked of the service, in order. */
  readonly log: string[] = []
  secondsSent = 0
  closed = false
  /** Set to false to play a service that does not answer a request to settle. */
  answers = true
  #settledSeconds = 0

  constructor(keyterms: string[]) {
    this.keyterms = keyterms
  }

  sendAudio(samples: Int16Array): void {
    this.secondsSent += samples.length / SPEECH_SAMPLE_RATE
    if (this.log.at(-1) !== 'audio') this.log.push('audio')
  }

  finalize(): void {
    this.log.push('finalize')
    if (this.answers) this.emit(this.result({ from_finalize: true }))
  }

  keepAlive(): void {
    this.log.push('keepalive')
  }

  async close(): Promise<void> {
    this.log.push('close')
    this.closed = true
  }

  /** A final result covering everything sent since the last one, with a word for each half second. */
  result(flags: Partial<SpeechResult> = {}): SpeechResult {
    const start = this.#settledSeconds
    const end = this.secondsSent
    const words = []
    for (let at = start; at + 0.25 <= end + 1e-9; at += 0.5) {
      words.push({ word: `w${at.toFixed(1)}`, start: at, end: Math.min(at + 0.4, end) })
    }
    this.#settledSeconds = end
    return {
      type: 'Results',
      is_final: true,
      start,
      duration: end - start,
      channel: { alternatives: [{ words }] },
      ...flags,
    }
  }

  emit(result: SpeechResult): void {
    this.onmessage?.(result as unknown as Record<string, unknown>)
  }
}

/** A speech service that hands out scripted connections and remembers them, one per speaker in order. */
export function scriptedSpeech(): { connect: ConnectSpeech; connections: ScriptedConnection[] } {
  const connections: ScriptedConnection[] = []
  return {
    connections,
    connect: ({ keyterms }) => {
      const connection = new ScriptedConnection(keyterms)
      connections.push(connection)
      return connection
    },
  }
}

/** One step of a recorded exchange with the real speech service. */
export type RecordedEntry =
  | { by: 'client'; action: 'audio'; samples: number }
  | { by: 'client'; action: 'finalize' | 'keepalive' | 'close' }
  | { by: 'service'; message: Record<string, unknown> }

/**
 * Plays back a recorded exchange with the real speech service.
 *
 * The service's messages are released at the points in the exchange where it
 * really sent them: after the same amount of audio, or after the same request.
 */
export class ReplayedConnection implements SpeechConnection {
  onmessage: ((message: Record<string, unknown>) => void) | null = null
  #entries: RecordedEntry[]
  #next = 0
  #samplesSent = 0
  #samplesExpected = 0

  constructor(entries: RecordedEntry[]) {
    this.#entries = entries
  }

  /** Whether the whole recorded exchange has been played through. */
  get finished(): boolean {
    return this.#next >= this.#entries.length
  }

  sendAudio(samples: Int16Array): void {
    this.#samplesSent += samples.length
    this.#advance(null)
  }

  finalize(): void {
    this.#advance('finalize')
  }

  keepAlive(): void {
    this.#advance('keepalive')
  }

  async close(): Promise<void> {
    this.#advance('close')
  }

  #advance(request: 'finalize' | 'keepalive' | 'close' | null): void {
    let pending = request
    for (;;) {
      const entry = this.#entries[this.#next]
      if (!entry) return
      if (entry.by === 'service') {
        this.#next += 1
        this.onmessage?.(structuredClone(entry.message))
      } else if (entry.action === 'audio') {
        if (this.#samplesSent < this.#samplesExpected + entry.samples) return
        this.#samplesExpected += entry.samples
        this.#next += 1
      } else if (entry.action === pending) {
        pending = null
        this.#next += 1
      } else if (entry.action === 'keepalive' && pending !== null) {
        // Keep-alives depend on how long the recording ran and draw no answer, so one the
        // client did not repeat is passed over.
        this.#next += 1
      } else {
        return
      }
    }
  }
}

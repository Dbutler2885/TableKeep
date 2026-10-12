/**
 * Recording one session: from packets arriving to audio stored and placed.
 *
 * Everything that happens is written to the journal first and acted on second,
 * and what it means is worked out by the same engine whether it has just
 * arrived or is being read back from the journal later. So what reaches storage
 * is always a function of what the journal holds.
 */
import path from 'node:path'
import { segmentFile } from '../audio/segmenter.ts'
import type { VoicePacket } from '../audio/timeline.ts'
import { JournalWriter, type JournalEvent, type JournalRecord } from '../journal/journal.ts'
import { SpeakerTranscriber, type ConnectSpeech, type Utterance } from '../speech/transcriber.ts'
import type { SessionLocation, SessionStore, StartSessionInput, StartSessionResult } from '../store/sessionStore.ts'
import { SessionEngine, type SessionEffect } from './engine.ts'
import { finaliseSession, type FinaliseResult } from './finalise.ts'

const DEFAULT_LAST_WORDS_MS = 8_000

export type RecorderOptions = {
  store: SessionStore
  /** A folder on a disk that outlives the bot process. */
  journalDir: string
  maxSegmentSeconds?: number
  /** How often the journal is forced onto the disk. Zero leaves that to `close`. */
  journalSyncEveryMs?: number
  /** How to reach the speech service. Without it the session is recorded but not transcribed. */
  connectSpeech?: ConnectSpeech
  /** How long finalising keeps trying to complete the transcript before flagging the session. */
  finaliseGiveUpAfterMs?: number
  /** How long `stop` gives the speech service to settle each speaker's last words before finalising takes over. */
  lastWordsMs?: number
}

type SpeakerTranscription = {
  transcriber: SpeakerTranscriber
  /** The last write of this speaker's utterances, so that the next waits its turn. */
  publishing: Promise<void>
}

export type StartRecordingResult =
  | { status: 'started'; recorder: SessionRecorder; number: number }
  | Exclude<StartSessionResult, { status: 'started' }>

export class SessionRecorder {
  readonly location: SessionLocation
  readonly journalPath: string
  #options: RecorderOptions
  #store: SessionStore
  #journal: JournalWriter
  #engine: SessionEngine
  #keyterms: string[]
  #transcription = new Map<string, SpeakerTranscription>()
  #stopping: Promise<FinaliseResult> | null = null
  /** Writes to the store still in flight, and anything that went wrong with them. */
  #pending = new Set<Promise<void>>()
  readonly failures: unknown[] = []

  private constructor(location: SessionLocation, startedAtMs: number, keyterms: string[], options: RecorderOptions) {
    this.location = location
    this.#options = options
    this.#store = options.store
    this.#keyterms = keyterms
    this.#engine = new SessionEngine(startedAtMs, options.maxSegmentSeconds)
    this.journalPath = path.join(options.journalDir, `${location.sessionId}.journal`)
    this.#journal = new JournalWriter(this.journalPath, options.journalSyncEveryMs)
  }

  /** Starts a session for a Discord server, if the server is linked and free. */
  static async start(input: StartSessionInput, options: RecorderOptions): Promise<StartRecordingResult> {
    const result = await options.store.startSession(input)
    if (result.status !== 'started') return result
    const keyterms = options.connectSpeech ? await options.store.vocabulary(result.location) : []
    const recorder = new SessionRecorder(result.location, input.startedAtMs, keyterms, options)
    recorder.#record({ atMs: input.startedAtMs, kind: 'session-started', ...result.location })
    return { status: 'started', recorder, number: result.number }
  }

  /** A voice packet has arrived. */
  packet(packet: VoicePacket): void {
    this.#handle({ type: 'packet', packet })
  }

  speakerJoined(speakerId: string, displayName: string, atMs: number): void {
    this.#record({ atMs, kind: 'speaker-joined', speakerId, displayName })
  }

  speakerLeft(speakerId: string, atMs: number): void {
    this.#record({ atMs, kind: 'speaker-left', speakerId })
  }

  /** The bot has lost the voice channel and can hear nobody. */
  disconnected(atMs: number): void {
    this.#record({ atMs, kind: 'disconnected' })
  }

  reconnected(atMs: number): void {
    this.#record({ atMs, kind: 'reconnected' })
  }

  /**
   * Call several times a second. Lets go of packets that were held for late
   * arrivals, closes off the audio of anyone who has gone quiet so that it is
   * stored without waiting for them to speak again, and keeps transcription moving.
   */
  tick(nowMs: number): void {
    if (this.#stopping) return
    this.#act(this.#engine.tick(nowMs))
    for (const { transcriber } of this.#transcription.values()) transcriber.tick(nowMs)
  }

  /**
   * Ends recording and finishes the session.
   *
   * The server is free for a new session as soon as recording has stopped,
   * before the rest of the work is done. Resolves once the session has ended,
   * or has been flagged because its transcript could not be completed.
   */
  stop(reason: string, atMs: number): Promise<FinaliseResult> {
    this.#stopping ??= this.#stop(reason, atMs)
    return this.#stopping
  }

  async #stop(reason: string, atMs: number): Promise<FinaliseResult> {
    const stopped: JournalRecord = { type: 'event', event: { atMs, kind: 'session-stopped', reason } }
    this.#journal.append(stopped)
    this.#act(this.#engine.apply(stopped))
    this.#journal.close()
    await this.#store.stopRecording(this.location, { stoppedAtMs: atMs, reason })

    // Each speaker's last words are given a moment to settle on the connection that heard them.
    const lastWordsMs = this.#options.lastWordsMs ?? DEFAULT_LAST_WORDS_MS
    await Promise.all([...this.#transcription.values()].map(({ transcriber }) => transcriber.close(atMs, lastWordsMs)))
    await this.settled()

    return finaliseSession({
      store: this.#store,
      journalPath: this.journalPath,
      connectSpeech: this.#options.connectSpeech,
      maxSegmentSeconds: this.#options.maxSegmentSeconds,
      giveUpAfterMs: this.#options.finaliseGiveUpAfterMs,
      nowMs: atMs,
    })
  }

  /** Resolves once every write to the store begun so far has finished. */
  async settled(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all(this.#pending)
  }

  #record(event: JournalEvent): void {
    this.#handle({ type: 'event', event })
  }

  /** Journals a record, then acts on what it means. */
  #handle(record: JournalRecord): void {
    if (this.#stopping) return
    this.#journal.append(record)
    this.#act(this.#engine.apply(record))
  }

  #act(effects: SessionEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'placed':
          // The speech check decides only what is transcribed; every placed packet is archived regardless.
          this.#transcriptionFor(effect.packet.speakerId)?.transcriber.write(effect.packet, effect.receivedAtMs)
          break
        case 'segment':
          this.#track(this.#store.storeSegment(this.location, effect.segment, segmentFile(effect.segment)))
          break
        case 'speaker':
          this.#track(this.#store.recordSpeaker(this.location, effect.speaker))
          break
        case 'gap':
          this.#track(this.#store.recordGap(this.location, effect.gap))
          break
        case 'stopped':
          break
      }
    }
  }

  #transcriptionFor(speakerId: string): SpeakerTranscription | null {
    const connect = this.#options.connectSpeech
    if (!connect) return null
    let transcription = this.#transcription.get(speakerId)
    if (!transcription) {
      transcription = {
        publishing: Promise.resolve(),
        transcriber: new SpeakerTranscriber({
          speakerId,
          connect,
          keyterms: this.#keyterms,
          onProgress: (utterances, checkpointSamples) => this.#publish(speakerId, utterances, checkpointSamples),
        }),
      }
      this.#transcription.set(speakerId, transcription)
    }
    return transcription
  }

  /**
   * Publishes a speaker's utterances after their previous ones. Each write
   * moves the same checkpoint, so letting them race would only make the
   * database retry them against each other.
   */
  #publish(speakerId: string, utterances: Utterance[], checkpointSamples: number): void {
    const transcription = this.#transcription.get(speakerId)
    if (!transcription) return
    const write = transcription.publishing.then(() =>
      this.#store.publishUtterances(this.location, speakerId, utterances, checkpointSamples),
    )
    // A failed write is recorded by `#track`; it must not stop the ones after it.
    transcription.publishing = write.catch(() => undefined)
    this.#track(write)
  }

  #track(work: Promise<void>): void {
    const tracked = work
      .catch((error: unknown) => {
        this.failures.push(error)
      })
      .finally(() => this.#pending.delete(tracked))
    this.#pending.add(tracked)
  }
}

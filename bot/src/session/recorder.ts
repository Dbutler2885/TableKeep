/**
 * Recording one session: from packets arriving to audio stored and placed.
 *
 * Everything that happens is written to the journal first and acted on second,
 * and it is acted on by the same code whether it has just arrived or is being
 * read back from the journal after a restart. So what reaches storage is always
 * a function of what the journal holds.
 */
import path from 'node:path'
import { OPUS_SAMPLE_RATE } from '../audio/opus.ts'
import { Segmenter, segmentFile, type Segment } from '../audio/segmenter.ts'
import { SpeakerTimeline, type PlacedPacket, type VoicePacket } from '../audio/timeline.ts'
import { JournalWriter, type JournalEvent, type JournalRecord } from '../journal/journal.ts'
import { SpeakerTranscriber, type ConnectSpeech, type Utterance } from '../speech/transcriber.ts'
import type { SessionLocation, SessionStore, StartSessionInput, StartSessionResult } from '../store/sessionStore.ts'

/** With nothing from a speaker for this long, their audio so far is closed off and stored. */
const QUIET_CLOSE_MS = 1_500

export type RecorderOptions = {
  store: SessionStore
  /** A folder on a disk that outlives the bot process. */
  journalDir: string
  maxSegmentSeconds?: number
  /** How often the journal is forced onto the disk. Zero leaves that to `close`. */
  journalSyncEveryMs?: number
  /** How to reach the speech service. Without it the session is recorded but not transcribed. */
  connectSpeech?: ConnectSpeech
}

type SpeakerState = {
  timeline: SpeakerTimeline
  segmenter: Segmenter
  transcriber: SpeakerTranscriber | null
  /** The last write of this speaker's utterances, so that the next waits its turn. */
  publishing: Promise<void>
  lastPacketAtMs: number
}

export type StartRecordingResult =
  | { status: 'started'; recorder: SessionRecorder; number: number }
  | Exclude<StartSessionResult, { status: 'started' }>

export class SessionRecorder {
  readonly location: SessionLocation
  readonly journalPath: string
  #store: SessionStore
  #journal: JournalWriter
  #startedAtMs: number
  #maxSegmentSeconds: number | undefined
  #connectSpeech: ConnectSpeech | undefined
  #keyterms: string[]
  #speakers = new Map<string, SpeakerState>()
  #disconnectedAtMs: number | null = null
  #stopped = false
  /** Writes to the store still in flight, and anything that went wrong with them. */
  #pending = new Set<Promise<void>>()
  readonly failures: unknown[] = []

  private constructor(location: SessionLocation, startedAtMs: number, keyterms: string[], options: RecorderOptions) {
    this.location = location
    this.#store = options.store
    this.#connectSpeech = options.connectSpeech
    this.#keyterms = keyterms
    this.#startedAtMs = startedAtMs
    this.#maxSegmentSeconds = options.maxSegmentSeconds
    this.journalPath = path.join(options.journalDir, `${location.sessionId}.journal`)
    this.#journal = new JournalWriter(this.journalPath, options.journalSyncEveryMs)
  }

  /** Starts a session for a Discord server, if the server is linked and free. */
  static async start(input: StartSessionInput, options: RecorderOptions): Promise<StartRecordingResult> {
    const result = await options.store.startSession(input)
    if (result.status !== 'started') return result
    const keyterms = options.connectSpeech ? await options.store.vocabulary(result.location) : []
    const recorder = new SessionRecorder(result.location, input.startedAtMs, keyterms, options)
    recorder.#record({ atMs: input.startedAtMs, kind: 'session-started', sessionId: result.location.sessionId })
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
    for (const [speakerId, speaker] of this.#speakers) {
      // The tail of a burst is let go before the speech service is asked to settle it.
      this.#archive(speaker, speaker.timeline.releaseDue(nowMs))
      if (nowMs - speaker.lastPacketAtMs >= QUIET_CLOSE_MS) this.#closeRun(speakerId, false)
      speaker.transcriber?.tick(nowMs)
    }
  }

  /** Ends recording: stores everything still held and frees the server. */
  async stop(reason: string, atMs: number): Promise<void> {
    if (this.#stopped) return
    this.#record({ atMs, kind: 'session-stopped', reason })
    // Each speaker's last words are settled by the speech service before the session is closed.
    await Promise.all([...this.#speakers.values()].map((speaker) => speaker.transcriber?.close(atMs)))
    await this.settled()
    this.#journal.close()
    await this.#store.stopRecording(this.location, { stoppedAtMs: atMs, reason })
  }

  /** Resolves once every write to the store begun so far has finished. */
  async settled(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all(this.#pending)
  }

  #record(event: JournalEvent): void {
    this.#handle({ type: 'event', event })
  }

  /** Journals a record, then acts on it. */
  #handle(record: JournalRecord): void {
    if (this.#stopped) return
    this.#journal.append(record)
    this.#apply(record)
  }

  #apply(record: JournalRecord): void {
    if (record.type === 'packet') {
      const speaker = this.#speaker(record.packet.speakerId)
      speaker.lastPacketAtMs = record.packet.receivedAtMs
      this.#archive(speaker, speaker.timeline.push(record.packet))
      return
    }

    const { event } = record
    switch (event.kind) {
      case 'speaker-joined':
        this.#track(this.#store.recordSpeaker(this.location, { discordId: event.speakerId, displayName: event.displayName }))
        break
      case 'speaker-left':
        // Whatever they send on returning is a new stream, numbered afresh.
        this.#closeRun(event.speakerId, true)
        break
      case 'disconnected':
        this.#disconnectedAtMs = event.atMs
        for (const speakerId of this.#speakers.keys()) this.#closeRun(speakerId, true)
        break
      case 'reconnected':
        if (this.#disconnectedAtMs !== null) {
          this.#track(
            this.#store.recordGap(this.location, {
              startSamples: this.#samplesAt(this.#disconnectedAtMs),
              endSamples: this.#samplesAt(event.atMs),
              reason: 'not-connected',
            }),
          )
          this.#disconnectedAtMs = null
        }
        break
      case 'session-stopped':
        for (const speakerId of this.#speakers.keys()) this.#closeRun(speakerId, false)
        this.#stopped = true
        break
      case 'session-started':
        break
    }
  }

  #samplesAt(atMs: number): number {
    return Math.max(0, Math.round(((atMs - this.#startedAtMs) / 1000) * OPUS_SAMPLE_RATE))
  }

  #speaker(speakerId: string): SpeakerState {
    let speaker = this.#speakers.get(speakerId)
    if (!speaker) {
      speaker = {
        timeline: new SpeakerTimeline(speakerId, this.#startedAtMs),
        segmenter: new Segmenter(this.#maxSegmentSeconds),
        transcriber: this.#connectSpeech
          ? new SpeakerTranscriber({
              speakerId,
              connect: this.#connectSpeech,
              keyterms: this.#keyterms,
              onProgress: (utterances, checkpointSamples) => this.#publish(speakerId, utterances, checkpointSamples),
            })
          : null,
        publishing: Promise.resolve(),
        lastPacketAtMs: 0,
      }
      this.#speakers.set(speakerId, speaker)
    }
    return speaker
  }

  /** Stores a speaker's audio so far. With `newEpoch`, what they send next is treated as a new stream. */
  #closeRun(speakerId: string, newEpoch: boolean): void {
    const speaker = this.#speakers.get(speakerId)
    if (!speaker) return
    this.#archive(speaker, newEpoch ? speaker.timeline.startNewEpoch() : speaker.timeline.flush())
    this.#storeSegment(speaker.segmenter.flush())
  }

  #archive(speaker: SpeakerState, placed: PlacedPacket[]): void {
    for (const packet of placed) {
      this.#storeSegment(speaker.segmenter.push(packet))
      // The speech check decides only what is transcribed; everything placed is archived above regardless.
      speaker.transcriber?.write(packet, speaker.lastPacketAtMs)
    }
  }

  #storeSegment(segment: Segment | null): void {
    if (segment) this.#track(this.#store.storeSegment(this.location, segment, segmentFile(segment)))
  }

  /**
   * Publishes a speaker's utterances after their previous ones. Each write
   * moves the same checkpoint, so letting them race would only make the
   * database retry them against each other.
   */
  #publish(speakerId: string, utterances: Utterance[], checkpointSamples: number): void {
    const speaker = this.#speakers.get(speakerId)
    if (!speaker) return
    const write = speaker.publishing.then(() =>
      this.#store.publishUtterances(this.location, speakerId, utterances, checkpointSamples),
    )
    // A failed write is recorded by `#track`; it must not stop the ones after it.
    speaker.publishing = write.catch(() => undefined)
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

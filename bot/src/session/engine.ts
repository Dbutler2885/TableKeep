/**
 * What a session's journal means: the audio it holds, placed and cut.
 *
 * The engine takes journal records one at a time and says what follows from
 * each: a packet took its place on the timeline, a segment of audio was
 * completed, a speaker was heard, a stretch went unheard. It touches no disk,
 * database or network, and what it says depends only on the records.
 *
 * The live recorder feeds it each record as it is journalled. Finalising a
 * session after a restart feeds it the same records read back from the file,
 * and gets the same answers.
 */
import { OPUS_SAMPLE_RATE } from '../audio/opus.ts'
import { Segmenter, type Segment } from '../audio/segmenter.ts'
import { SpeakerTimeline, type PlacedPacket } from '../audio/timeline.ts'
import type { JournalRecord } from '../journal/journal.ts'
import type { SessionGap, SessionLocation, SessionMarker, SessionSpeaker } from '../store/sessionStore.ts'

/** With nothing from a speaker for this long, their audio so far is closed off as a segment. */
const QUIET_CLOSE_MS = 1_500

export type SessionEffect =
  | { kind: 'placed'; packet: PlacedPacket; receivedAtMs: number }
  | { kind: 'segment'; segment: Segment }
  | { kind: 'speaker'; speaker: SessionSpeaker }
  | { kind: 'gap'; gap: SessionGap }
  | { kind: 'marker'; marker: SessionMarker }
  | { kind: 'stopped'; reason: string; atMs: number }

type SpeakerState = { timeline: SpeakerTimeline; segmenter: Segmenter; lastPacketAtMs: number }

export class SessionEngine {
  #startedAtMs: number
  #maxSegmentSeconds: number | undefined
  #speakers = new Map<string, SpeakerState>()
  #disconnectedAtMs: number | null = null
  #stopped = false

  constructor(startedAtMs: number, maxSegmentSeconds?: number) {
    this.#startedAtMs = startedAtMs
    this.#maxSegmentSeconds = maxSegmentSeconds
  }

  get stopped(): boolean {
    return this.#stopped
  }

  /** Says what follows from the next record of the journal. */
  apply(record: JournalRecord): SessionEffect[] {
    if (this.#stopped) return []
    const effects: SessionEffect[] = []

    if (record.type === 'packet') {
      const speaker = this.#speaker(record.packet.speakerId)
      speaker.lastPacketAtMs = record.packet.receivedAtMs
      this.#place(speaker, speaker.timeline.push(record.packet), effects)
      return effects
    }

    const { event } = record
    switch (event.kind) {
      case 'speaker-joined':
        effects.push({
          kind: 'speaker',
          speaker: { discordId: event.speakerId, displayName: event.displayName, memberUid: event.memberUid ?? null },
        })
        break
      case 'note':
        effects.push({
          kind: 'marker',
          marker: { atSamples: this.#samplesAt(event.atMs), text: event.text, authorDiscordId: event.authorId, authorUid: event.memberUid },
        })
        break
      case 'speaker-left':
        // Whatever they send on returning is a new stream, numbered afresh.
        this.#closeRun(event.speakerId, true, effects)
        break
      case 'disconnected':
        // Told twice, as after a bot that died while away, the stretch still begins where it first did.
        this.#disconnectedAtMs ??= event.atMs
        for (const speakerId of this.#speakers.keys()) this.#closeRun(speakerId, true, effects)
        break
      case 'reconnected':
        if (this.#disconnectedAtMs !== null) {
          effects.push({
            kind: 'gap',
            gap: {
              startSamples: this.#samplesAt(this.#disconnectedAtMs),
              endSamples: this.#samplesAt(event.atMs),
              reason: 'not-connected',
            },
          })
          this.#disconnectedAtMs = null
        }
        break
      case 'session-stopped':
        for (const speakerId of this.#speakers.keys()) this.#closeRun(speakerId, false, effects)
        this.#stopped = true
        effects.push({ kind: 'stopped', reason: event.reason, atMs: event.atMs })
        break
      case 'session-started':
        break
    }
    return effects
  }

  /**
   * Lets time pass with nothing arriving: packets held for late arrivals are
   * let go, and anyone who has gone quiet has their audio so far closed off.
   * This only brings forward what the next record would cause anyway.
   */
  tick(nowMs: number): SessionEffect[] {
    const effects: SessionEffect[] = []
    if (this.#stopped) return effects
    for (const [speakerId, speaker] of this.#speakers) {
      this.#place(speaker, speaker.timeline.releaseDue(nowMs), effects)
      if (nowMs - speaker.lastPacketAtMs >= QUIET_CLOSE_MS) this.#closeRun(speakerId, false, effects)
    }
    return effects
  }

  /** Closes off everything still open, as at the end of a journal that was cut short. */
  flush(): SessionEffect[] {
    const effects: SessionEffect[] = []
    for (const speakerId of this.#speakers.keys()) this.#closeRun(speakerId, false, effects)
    return effects
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
        lastPacketAtMs: 0,
      }
      this.#speakers.set(speakerId, speaker)
    }
    return speaker
  }

  #place(speaker: SpeakerState, placed: PlacedPacket[], effects: SessionEffect[]): void {
    for (const packet of placed) {
      effects.push({ kind: 'placed', packet, receivedAtMs: speaker.lastPacketAtMs })
      const segment = speaker.segmenter.push(packet)
      if (segment) effects.push({ kind: 'segment', segment })
    }
  }

  /** Closes a speaker's audio so far. With `newEpoch`, what they send next is treated as a new stream. */
  #closeRun(speakerId: string, newEpoch: boolean, effects: SessionEffect[]): void {
    const speaker = this.#speakers.get(speakerId)
    if (!speaker) return
    this.#place(speaker, newEpoch ? speaker.timeline.startNewEpoch() : speaker.timeline.flush(), effects)
    const segment = speaker.segmenter.flush()
    if (segment) effects.push({ kind: 'segment', segment })
  }
}

/** Which session a journal belongs to, or null if the records are not a session's journal. */
export function journalSession(records: JournalRecord[]): { location: SessionLocation; startedAtMs: number } | null {
  const first = records[0]
  // Every journal opens with where its session lives; one that does not was never a session's journal.
  if (first?.type !== 'event' || first.event.kind !== 'session-started') return null
  const { groupId, campaignId, sessionId, atMs: startedAtMs } = first.event
  return { location: { groupId, campaignId, sessionId }, startedAtMs }
}

/** Everything a whole journal amounts to. */
export function replayJournal(
  records: JournalRecord[],
  options: { maxSegmentSeconds?: number } = {},
): { location: SessionLocation; startedAtMs: number; effects: SessionEffect[]; stopped: boolean } | null {
  const session = journalSession(records)
  if (!session) return null
  const { location, startedAtMs } = session
  const engine = new SessionEngine(startedAtMs, options.maxSegmentSeconds)
  const effects = records.flatMap((record) => engine.apply(record))
  // A journal with no stop in it ends where the bot died; what was open is closed there.
  if (!engine.stopped) effects.push(...engine.flush())
  return { location, startedAtMs, effects, stopped: engine.stopped }
}

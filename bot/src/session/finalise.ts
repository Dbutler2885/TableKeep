/**
 * Finishing a session once recording has stopped.
 *
 * Everything is worked out again from the journal, so this does the same job
 * whether it runs straight after `/stop` or days later on a bot that was
 * restarted in between. It can be run any number of times: audio already
 * stored is left alone, and transcription carries on from each speaker's
 * checkpoint.
 *
 * A session is only marked ended when its audio is all stored and its
 * transcript is complete. If the speech service cannot be reached for long
 * enough, the session is left finalising and flagged, and running this again
 * later finishes it.
 */
import { rmSync } from 'node:fs'
import { segmentFile, segmentId } from '../audio/segmenter.ts'
import type { PlacedPacket } from '../audio/timeline.ts'
import { readJournal } from '../journal/journal.ts'
import { SpeakerTranscriber, type ConnectSpeech } from '../speech/transcriber.ts'
import type { SessionLocation, SessionStore } from '../store/sessionStore.ts'
import { replayJournal } from './engine.ts'
import { renderTranscript } from './render.ts'

export type FinaliseOptions = {
  store: SessionStore
  journalPath: string
  /** How to reach the speech service. Without it, audio that was never transcribed stays that way. */
  connectSpeech?: ConnectSpeech
  maxSegmentSeconds?: number
  /** How long to keep trying to finish the transcript before flagging the session, in milliseconds of real time. */
  giveUpAfterMs?: number
  /** The time now, for the record of when the session ended. */
  nowMs?: number
}

export type FinaliseResult =
  | { status: 'ended'; location: SessionLocation }
  /** Still finalising, and flagged: the transcript could not be completed. */
  | { status: 'needs-attention'; location: SessionLocation; reason: string }
  /** The file is not a session's journal, or recording has not been stopped. */
  | { status: 'not-ready'; reason: string }

const DEFAULT_GIVE_UP_AFTER_MS = 30 * 60 * 1000

export async function finaliseSession(options: FinaliseOptions): Promise<FinaliseResult> {
  const { store } = options
  const replay = replayJournal(readJournal(options.journalPath).records, { maxSegmentSeconds: options.maxSegmentSeconds })
  if (!replay) return { status: 'not-ready', reason: 'not a session journal' }
  if (!replay.stopped) return { status: 'not-ready', reason: 'recording has not been stopped' }
  const { location } = replay

  // Audio: store whatever the journal holds that is not in the bucket yet.
  const stored = await store.storedSegmentIds(location)
  const placed = new Map<string, PlacedPacket[]>()
  for (const effect of replay.effects) {
    if (effect.kind === 'segment' && !stored.has(segmentId(effect.segment))) {
      await store.storeSegment(location, effect.segment, segmentFile(effect.segment))
    } else if (effect.kind === 'speaker') {
      await store.recordSpeaker(location, effect.speaker)
    } else if (effect.kind === 'gap') {
      await store.recordGap(location, effect.gap)
    } else if (effect.kind === 'placed') {
      const packets = placed.get(effect.packet.speakerId) ?? []
      packets.push(effect.packet)
      placed.set(effect.packet.speakerId, packets)
    }
  }

  // Transcript: carry each speaker on from where their transcription had reached.
  const checkpoints = await store.checkpoints(location)
  const keyterms = options.connectSpeech ? await store.vocabulary(location) : []
  const giveUpAfterMs = options.giveUpAfterMs ?? DEFAULT_GIVE_UP_AFTER_MS
  const finished = await Promise.all(
    [...placed].map(async ([speakerId, packets]) => {
      let publishing = Promise.resolve()
      const failures: unknown[] = []
      const transcriber = new SpeakerTranscriber({
        speakerId,
        connect:
          options.connectSpeech ??
          (() => {
            throw new Error('No speech service is configured.')
          }),
        keyterms,
        resumeFromSamples: checkpoints.get(speakerId) ?? 0,
        onProgress: (utterances, checkpointSamples) => {
          publishing = publishing
            .then(() => store.publishUtterances(location, speakerId, utterances, checkpointSamples))
            .catch((error: unknown) => {
              failures.push(error)
            })
        },
      })
      const startedAt = Date.now()
      for (const packet of packets) transcriber.write(packet, startedAt)
      // With nothing left to transcribe there is no service to wait for.
      const caughtUp = transcriber.caughtUp || (await transcriber.close(startedAt, options.connectSpeech ? giveUpAfterMs : 0))
      await publishing
      return caughtUp && failures.length === 0
    }),
  )

  if (finished.includes(false)) {
    const reason = 'The transcript is incomplete: the speech service could not be reached for part of the session.'
    await store.flagSession(location, reason)
    return { status: 'needs-attention', location, reason }
  }

  const names = new Map((await store.speakers(location)).map((speaker) => [speaker.discordId, speaker.displayName]))
  await store.completeSession(location, {
    endedAtMs: options.nowMs ?? Date.now(),
    transcriptText: renderTranscript(await store.transcript(location), names),
  })
  // Only now, with the audio stored and the transcript complete, is the journal no longer needed.
  rmSync(options.journalPath, { force: true })
  return { status: 'ended', location }
}

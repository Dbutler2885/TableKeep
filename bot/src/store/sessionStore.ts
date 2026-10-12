/**
 * The session store: the only code that writes sessions and what belongs to them.
 *
 * A session lives under its campaign, like everything else a campaign owns:
 *
 *   groups/{g}/campaigns/{c}/sessions/{s}                 the session itself
 *   groups/{g}/campaigns/{c}/sessions/{s}/speakers/{id}   who was heard, by permanent Discord ID
 *   groups/{g}/campaigns/{c}/sessions/{s}/segments/{id}   where each stored piece of audio sits in time
 *   groups/{g}/campaigns/{c}/sessions/{s}/gaps/{id}       stretches the bot could not hear anyone
 *   groups/{g}/campaigns/{c}/sessions/{s}/transcripts/{revision}/utterances/{id}
 *                                                         what was said, one record per utterance
 *   groups/{g}/campaigns/{c}/sessions/{s}/transcripts/{revision}/checkpoints/{speaker}
 *                                                         how far each speaker's audio has been transcribed
 *   groups/{g}/campaigns/{c}/sessionCounters/sessions     the last session number given out
 *
 * and its audio in storage beside the campaign's other files:
 *
 *   groups/{g}/campaigns/{c}/sessions/{s}/audio/{speaker}/{segment}.ogg
 *
 * No security rule matches any of these, so no client can write them, and none
 * can read them until rules for reading are added with the app's session views.
 */
import { createHash } from 'node:crypto'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import type { getStorage } from 'firebase-admin/storage'
import { campaignPath } from '../../../functions/src/firestorePaths.ts'
import { segmentId, type Segment } from '../audio/segmenter.ts'
import type { Utterance } from '../speech/transcriber.ts'

/** A storage bucket, as the admin SDK hands one out. */
export type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>

/** Where the link between a Discord server and its group is kept. Written when a GM links the server. */
const DISCORD_SERVERS_COLLECTION = 'discordServers'

export type SessionLocation = { groupId: string; campaignId: string; sessionId: string }

export type StartSessionInput = {
  discordServerId: string
  discordChannelId: string
  startedByDiscordId: string
  startedAtMs: number
}

export type StartSessionResult =
  | { status: 'started'; location: SessionLocation; number: number }
  /** No group has linked this Discord server. */
  | { status: 'server-not-linked' }
  /** The linked group has no current campaign for the session to belong to. */
  | { status: 'no-current-campaign'; groupId: string }
  /** This server is already being recorded. */
  | { status: 'already-recording'; location: SessionLocation }

export type SessionSpeaker = { discordId: string; displayName: string }

/** A stretch of the session when the bot was not connected and could have heard nobody. */
export type SessionGap = { startSamples: number; endSamples: number; reason: 'not-connected' }

/** The transcript made while the session was being recorded. Nothing in this version makes another. */
export const LIVE_TRANSCRIPT = 'live'

/** How many names are offered to the speech service. It advises 20 to 50 and caps the total length. */
const MAX_VOCABULARY = 50

/** An utterance already published under the same identity says something different. */
export class UtteranceConflictError extends Error {
  constructor(id: string) {
    super(`Utterance ${id} is already published with different content.`)
    this.name = 'UtteranceConflictError'
  }
}

/** A stable name for an utterance: its speaker and where its first word falls on the timeline. */
export function utteranceId(utterance: Pick<Utterance, 'speakerId' | 'startSamples'>): string {
  return `${utterance.speakerId}-${String(utterance.startSamples).padStart(12, '0')}`
}

export interface SessionStore {
  startSession(input: StartSessionInput): Promise<StartSessionResult>
  /** The names worth telling the speech service about: the campaign's characters and NPCs. */
  vocabulary(location: SessionLocation): Promise<string[]>
  /**
   * Publishes finished utterances and moves the speaker's checkpoint past
   * them, as one write. Publishing the same utterance twice leaves one; a
   * different utterance under the same identity is refused.
   */
  publishUtterances(location: SessionLocation, speakerId: string, utterances: Utterance[], checkpointSamples: number): Promise<void>
  recordSpeaker(location: SessionLocation, speaker: SessionSpeaker): Promise<void>
  /** Stores a segment's audio and the record that places it. Storing the same segment twice leaves one. */
  storeSegment(location: SessionLocation, segment: Segment, file: Buffer): Promise<void>
  recordGap(location: SessionLocation, gap: SessionGap): Promise<void>
  /** Marks recording as over and frees the server for a new session. */
  stopRecording(location: SessionLocation, input: { stoppedAtMs: number; reason: string }): Promise<void>
}

export function sessionPath(location: SessionLocation, ...segments: string[]): string {
  return campaignPath(location.groupId, location.campaignId, 'sessions', location.sessionId, ...segments)
}

export function segmentObjectPath(location: SessionLocation, segment: Pick<Segment, 'speakerId' | 'epoch' | 'startSamples'>): string {
  return `${sessionPath(location)}/audio/${segment.speakerId}/${segmentId(segment)}.ogg`
}

export class FirestoreSessionStore implements SessionStore {
  #db: Firestore
  #bucket: Bucket

  constructor(db: Firestore, bucket: Bucket) {
    this.#db = db
    this.#bucket = bucket
  }

  async startSession(input: StartSessionInput): Promise<StartSessionResult> {
    const db = this.#db
    const serverRef = db.collection(DISCORD_SERVERS_COLLECTION).doc(input.discordServerId)

    // One transaction decides everything, so two people typing the command at
    // the same moment cannot both start a session or be given the same number.
    return db.runTransaction(async (tx): Promise<StartSessionResult> => {
      const serverSnap = await tx.get(serverRef)
      const groupId = serverSnap.data()?.groupId as string | undefined
      if (!groupId) return { status: 'server-not-linked' }

      const active = serverSnap.data()?.activeSession as SessionLocation | undefined
      if (active) return { status: 'already-recording', location: active }

      const groupSnap = await tx.get(db.collection('groups').doc(groupId))
      const campaignId = groupSnap.data()?.activeCampaignId as string | undefined
      if (!campaignId) return { status: 'no-current-campaign', groupId }

      const counterRef = db.doc(campaignPath(groupId, campaignId, 'sessionCounters', 'sessions'))
      const counterSnap = await tx.get(counterRef)
      const number = ((counterSnap.data()?.last as number | undefined) ?? 0) + 1

      const sessionRef = db.collection(campaignPath(groupId, campaignId, 'sessions')).doc()
      const location: SessionLocation = { groupId, campaignId, sessionId: sessionRef.id }
      const startedAt = new Date(input.startedAtMs)
      tx.set(sessionRef, {
        number,
        state: 'running',
        discordServerId: input.discordServerId,
        discordChannelId: input.discordChannelId,
        startedByDiscordId: input.startedByDiscordId,
        startedAt,
        stoppedAt: null,
        stopReason: null,
        transcriptRevision: LIVE_TRANSCRIPT,
      })
      tx.set(counterRef, { last: number, updatedAt: startedAt })
      tx.update(serverRef, { activeSession: location })
      return { status: 'started', location, number }
    })
  }

  async vocabulary(location: SessionLocation): Promise<string[]> {
    const names = await Promise.all(
      ['characters', 'npcs'].map(async (collection) => {
        const snap = await this.#db.collection(campaignPath(location.groupId, location.campaignId, collection)).select('name').get()
        return snap.docs.map((doc) => String(doc.data().name ?? '').trim())
      }),
    )
    return [...new Set(names.flat().filter(Boolean))].slice(0, MAX_VOCABULARY)
  }

  async publishUtterances(
    location: SessionLocation,
    speakerId: string,
    utterances: Utterance[],
    checkpointSamples: number,
  ): Promise<void> {
    const db = this.#db
    const transcript = (...segments: string[]) => sessionPath(location, 'transcripts', LIVE_TRANSCRIPT, ...segments)
    const checkpointRef = db.doc(transcript('checkpoints', speakerId))
    const refs = utterances.map((utterance) => db.doc(transcript('utterances', utteranceId(utterance))))

    await db.runTransaction(async (tx) => {
      const [checkpointSnap, ...existing] = await Promise.all([tx.get(checkpointRef), ...refs.map((ref) => tx.get(ref))])
      utterances.forEach((utterance, index) => {
        const snap = existing[index]!
        if (snap.exists) {
          const data = snap.data()!
          const same = data.text === utterance.text && data.endSamples === utterance.endSamples && data.speakerId === utterance.speakerId
          if (!same) throw new UtteranceConflictError(snap.id)
          return
        }
        // The server's own clock stamps the commit, so readers following a
        // session can take utterances in the order they were published.
        tx.set(refs[index]!, { ...utterance, committedAt: FieldValue.serverTimestamp() })
      })
      const reached = Math.max((checkpointSnap.data()?.samples as number | undefined) ?? 0, checkpointSamples)
      tx.set(checkpointRef, { speakerId, samples: reached })
    })
  }

  async recordSpeaker(location: SessionLocation, speaker: SessionSpeaker): Promise<void> {
    await this.#db.doc(sessionPath(location, 'speakers', speaker.discordId)).set(
      { discordId: speaker.discordId, displayName: speaker.displayName },
      { merge: true },
    )
  }

  async storeSegment(location: SessionLocation, segment: Segment, file: Buffer): Promise<void> {
    const objectPath = segmentObjectPath(location, segment)
    // The audio first, then the record, so that a record never points at audio that is not there.
    await this.#bucket.file(objectPath).save(file, { contentType: 'audio/ogg', resumable: false })
    await this.#db.doc(sessionPath(location, 'segments', segmentId(segment))).set({
      speakerId: segment.speakerId,
      epoch: segment.epoch,
      startSamples: segment.startSamples,
      endSamples: segment.endSamples,
      startedBy: segment.startedBy,
      lostPacketsBefore: segment.lostPacketsBefore,
      leadInSamples: segment.leadInSamples,
      packets: segment.packets.length,
      objectPath,
      bytes: file.length,
      sha256: createHash('sha256').update(file).digest('hex'),
      complete: true,
    })
  }

  async recordGap(location: SessionLocation, gap: SessionGap): Promise<void> {
    const id = String(gap.startSamples).padStart(12, '0')
    await this.#db.doc(sessionPath(location, 'gaps', id)).set(gap)
  }

  async stopRecording(location: SessionLocation, input: { stoppedAtMs: number; reason: string }): Promise<void> {
    const db = this.#db
    const sessionRef = db.doc(sessionPath(location))
    await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef)
      const serverId = sessionSnap.data()?.discordServerId as string | undefined
      if (!sessionSnap.exists || !serverId || sessionSnap.data()?.state !== 'running') return
      const serverRef = db.collection(DISCORD_SERVERS_COLLECTION).doc(serverId)
      const serverSnap = await tx.get(serverRef)

      tx.update(sessionRef, { state: 'finalising', stoppedAt: new Date(input.stoppedAtMs), stopReason: input.reason })
      // Free the server only if it is still this session that holds it.
      if ((serverSnap.data()?.activeSession as SessionLocation | undefined)?.sessionId === location.sessionId) {
        tx.update(serverRef, { activeSession: null })
      }
    })
  }
}

/**
 * Running sessions from Discord: what `/join` and `/stop` do.
 *
 * A command is checked against the server's link and the caller's membership
 * as they stand at that moment, never against what was true earlier. Once a
 * session has started, its group and campaign are fixed: unlinking the server
 * or changing the current campaign does not move it.
 */
import type { FinaliseResult } from '../session/finalise.ts'
import { SessionRecorder, type RecorderOptions } from '../session/recorder.ts'
import type { CommandAccess, SessionLocation } from '../store/sessionStore.ts'
import { alarmMessage, restartedMessage, savedMessage, statusMessage, type SpeakerStatus } from './replies.ts'
import type { MessageBoard, VoiceGateway, VoiceLink, VoiceMember } from './voice.ts'

/** How often the status message is brought up to date. */
const STATUS_EVERY_MS = 30_000
/** How long the voice channel may have no person in it before the session is ended. */
const DEFAULT_EMPTY_STOP_MS = 3 * 60 * 1000

export type CommandCaller = {
  serverId: string
  userId: string
  /** The voice channel the caller is in, if any. */
  voiceChannelId: string | null
  /** The text channel the command was typed in. */
  textChannelId: string | null
}

export type JoinReply =
  | { status: 'started'; number: number; location: SessionLocation }
  | { status: 'already-recording' }
  | { status: 'not-in-voice' }
  | { status: 'no-current-campaign' }
  | { status: 'disk-full' }
  /** The session could not be started because the voice channel could not be joined. */
  | { status: 'voice-failed' }
  | Exclude<CommandAccess, { status: 'allowed' }>

export type StopReply =
  | { status: 'saved'; number: number }
  /** Saved, but part of it is still to be transcribed or stored. */
  | { status: 'saved-incomplete'; number: number; reason: string }
  | { status: 'not-recording' }
  | Exclude<CommandAccess, { status: 'allowed' }>

export type NoteReply =
  | { status: 'noted'; atSeconds: number }
  | { status: 'empty' }
  | { status: 'not-recording' }
  | Exclude<CommandAccess, { status: 'allowed' }>

type Running = {
  recorder: SessionRecorder
  link: VoiceLink
  number: number
  heard: Set<string>
  /** Speakers whose place in the group is still being looked up. */
  lookups: Set<Promise<void>>
  startedAtMs: number
  textChannelId: string | null
  /** The message that shows how the session is going, once it has been posted. */
  statusMessageId: string | null
  statusAtMs: number
  /** Everyone heard so far, for the status message. */
  speakers: Map<string, { name: string; lastHeardAtMs: number | null }>
  /** When the voice channel was last seen to have a person in it. */
  occupiedAtMs: number
  /** What has already been reported as wrong, so that it is said once. */
  reported: Set<string>
}

export type RunnerOptions = {
  voice: VoiceGateway
  /** Where the bot says how a session is going. Without it, it says nothing. */
  messages?: MessageBoard
  recorder: RecorderOptions
  emptyStopMs?: number
  now?: () => number
}

export class SessionRunner {
  #voice: VoiceGateway
  #messages: MessageBoard | null
  #emptyStopMs: number
  #recorderOptions: RecorderOptions
  #now: () => number
  /** The session being recorded in each server, by server. */
  #running = new Map<string, Running>()
  /** Servers where a `/join` is part way through, so that a second one arriving meanwhile is turned away. */
  #starting = new Set<string>()
  #owned = new Set<string>()

  constructor(options: RunnerOptions) {
    this.#voice = options.voice
    this.#messages = options.messages ?? null
    this.#emptyStopMs = options.emptyStopMs ?? DEFAULT_EMPTY_STOP_MS
    this.#recorderOptions = options.recorder
    this.#now = options.now ?? Date.now
  }

  /**
   * The sessions in this runner's hands, from the moment they start until they
   * have been finished. Their journals are not for anything else to pick up.
   */
  get recording(): Set<string> {
    return new Set(this.#owned)
  }

  async join(caller: CommandCaller): Promise<JoinReply> {
    const { store } = this.#recorderOptions
    const access = await store.commandAccess(caller.serverId, caller.userId)
    if (access.status !== 'allowed') return access
    if (this.#running.has(caller.serverId) || this.#starting.has(caller.serverId)) return { status: 'already-recording' }
    if (!caller.voiceChannelId) return { status: 'not-in-voice' }

    this.#starting.add(caller.serverId)
    try {
      const started = await SessionRecorder.start(
        {
          discordServerId: caller.serverId,
          discordChannelId: caller.voiceChannelId,
          discordTextChannelId: caller.textChannelId,
          startedByDiscordId: caller.userId,
          startedAtMs: this.#now(),
        },
        this.#recorderOptions,
      )
      if (started.status === 'already-recording') return { status: 'already-recording' }
      if (started.status === 'no-current-campaign') return { status: 'no-current-campaign' }
      if (started.status === 'disk-full') return { status: 'disk-full' }
      if (started.status !== 'started') return { status: started.status }

      const { recorder, number } = started
      recorder.onAlarm = (alarm) => this.#alarm(caller.serverId, alarm.kind)
      this.#owned.add(recorder.location.sessionId)
      let link: VoiceLink
      try {
        link = await this.#voice.join(caller.serverId, caller.voiceChannelId)
      } catch {
        await this.#stopRecorder(recorder, 'could not join the voice channel')
        return { status: 'voice-failed' }
      }
      const running = this.#attach(caller.serverId, recorder, link, number, caller.textChannelId)
      link.announce()
      await this.#postStatus(running)
      return { status: 'started', number, location: recorder.location }
    } finally {
      this.#starting.delete(caller.serverId)
    }
  }

  async stop(caller: Pick<CommandCaller, 'serverId' | 'userId'>): Promise<StopReply> {
    const { store } = this.#recorderOptions
    const running = this.#running.get(caller.serverId)
    // A session belongs to the group it was started for, even if the server has been unlinked since:
    // it is that group's members who may stop it.
    const access = running
      ? await store.memberAccess(running.recorder.location.groupId, caller.userId)
      : await store.commandAccess(caller.serverId, caller.userId)
    if (access.status !== 'allowed') return access
    // Looked at again, in case someone else stopped it while that was being checked.
    if (!running || this.#running.get(caller.serverId) !== running) return { status: 'not-recording' }
    return this.#finish(caller.serverId, running, 'stop command')
  }

  /** Marks this moment in the session with some text. */
  async note(caller: Pick<CommandCaller, 'serverId' | 'userId'>, text: string): Promise<NoteReply> {
    const { store } = this.#recorderOptions
    // The moment marked is when the command arrived, not when the checks on it finished.
    const atMs = this.#now()
    const running = this.#running.get(caller.serverId)
    const access = running
      ? await store.memberAccess(running.recorder.location.groupId, caller.userId)
      : await store.commandAccess(caller.serverId, caller.userId)
    if (access.status !== 'allowed') return access
    if (!running || this.#running.get(caller.serverId) !== running) return { status: 'not-recording' }
    const trimmed = text.trim()
    if (!trimmed) return { status: 'empty' }
    running.recorder.note(caller.userId, access.uid, trimmed, atMs)
    return { status: 'noted', atSeconds: Math.max(0, Math.round((atMs - running.startedAtMs) / 1000)) }
  }

  /**
   * Takes on a session picked up after a restart: rejoins its voice channel
   * and carries on recording. If the channel cannot be joined the session is
   * stopped where the dead bot left it.
   */
  async adopt(recorder: SessionRecorder): Promise<'resumed' | 'stopped'> {
    this.#owned.add(recorder.location.sessionId)
    const origin = await this.#recorderOptions.store.sessionOrigin(recorder.location)
    let link: VoiceLink | null = null
    if (origin && !this.#running.has(origin.discordServerId)) {
      link = await this.#voice.join(origin.discordServerId, origin.discordChannelId).catch(() => null)
    }
    if (!origin || !link) {
      await this.#stopRecorder(recorder, 'the bot restarted and could not rejoin the voice channel')
      return 'stopped'
    }
    recorder.reconnected(this.#now())
    recorder.onAlarm = (alarm) => this.#alarm(origin.discordServerId, alarm.kind)
    const running = this.#attach(origin.discordServerId, recorder, link, origin.number, origin.discordTextChannelId)
    await this.#say(running, restartedMessage(origin.number))
    await this.#postStatus(running)
    return 'resumed'
  }

  /** Call several times a second. */
  tick(nowMs = this.#now()): void {
    for (const [serverId, running] of this.#running) {
      running.recorder.tick(nowMs)

      const { storing, transcribing } = running.recorder.health
      this.#report(running, 'cannot-store', !storing)
      this.#report(running, 'cannot-transcribe', !transcribing)

      if (running.link.members().some((member) => !member.bot)) running.occupiedAtMs = nowMs
      if (nowMs - running.occupiedAtMs >= this.#emptyStopMs) {
        void this.#finish(serverId, running, 'the voice channel was empty').catch(() => undefined)
        continue
      }
      if (running.statusMessageId && nowMs - running.statusAtMs >= STATUS_EVERY_MS) {
        running.statusAtMs = nowMs
        const { textChannelId, statusMessageId } = running
        void this.#messages?.edit(textChannelId!, statusMessageId, this.#status(running, nowMs)).catch(() => undefined)
      }
    }
  }

  /** Says once that something has gone wrong, and is ready to say so again if it recovers and fails once more. */
  #report(running: Running, problem: 'cannot-store' | 'cannot-transcribe' | 'disk-low', present: boolean): void {
    if (!present) {
      running.reported.delete(problem)
    } else if (!running.reported.has(problem)) {
      running.reported.add(problem)
      void this.#say(running, alarmMessage(problem))
    }
  }

  #alarm(serverId: string, problem: 'disk-low'): void {
    const running = this.#running.get(serverId)
    if (running) this.#report(running, problem, true)
  }

  /** Posts in the session's text channel. A message that cannot be posted is never a reason to stop recording. */
  async #say(running: Running, text: string, options?: { quiet?: boolean }): Promise<string | null> {
    if (!this.#messages || !running.textChannelId) return null
    return this.#messages.post(running.textChannelId, text, options).catch(() => null)
  }

  async #postStatus(running: Running): Promise<void> {
    running.statusAtMs = this.#now()
    running.statusMessageId = await this.#say(running, this.#status(running, running.statusAtMs), { quiet: true })
  }

  #status(running: Running, nowMs: number, ended = false): string {
    const counts = running.recorder.utteranceCounts
    const speakers: SpeakerStatus[] = [...running.speakers].map(([id, speaker]) => ({
      name: speaker.name,
      heardSecondsAgo: speaker.lastHeardAtMs === null ? null : Math.max(0, Math.round((nowMs - speaker.lastHeardAtMs) / 1000)),
      utterances: counts.get(id) ?? 0,
    }))
    const elapsedSeconds = Math.max(0, Math.round((nowMs - running.startedAtMs) / 1000))
    return statusMessage({ number: running.number, elapsedSeconds, speakers, ended })
  }

  /** Wires a voice channel to a recorder, and records who is in it. */
  #attach(serverId: string, recorder: SessionRecorder, link: VoiceLink, number: number, textChannelId: string | null): Running {
    const nowMs = this.#now()
    const running: Running = {
      recorder,
      link,
      number,
      heard: new Set(),
      lookups: new Set(),
      startedAtMs: recorder.startedAtMs,
      textChannelId,
      statusMessageId: null,
      statusAtMs: nowMs,
      speakers: new Map(),
      occupiedAtMs: nowMs,
      reported: new Set(),
    }
    this.#running.set(serverId, running)
    const { store } = this.#recorderOptions
    const bots = new Set<string>()

    const joined = (member: VoiceMember) => {
      if (member.bot) {
        bots.add(member.id)
        return
      }
      running.heard.add(member.id)
      running.speakers.set(member.id, { name: member.displayName, lastHeardAtMs: running.speakers.get(member.id)?.lastHeardAtMs ?? null })
      const atMs = this.#now()
      // Who they are in the group is looked up as they arrive; a lookup that fails leaves them under their Discord name.
      const lookup = store
        .memberAccess(recorder.location.groupId, member.id)
        .then(
          (access) => (access.status === 'allowed' ? access.uid : null),
          () => null,
        )
        .then((memberUid) => recorder.speakerJoined(member.id, member.displayName, atMs, memberUid))
        .finally(() => running.lookups.delete(lookup))
      running.lookups.add(lookup)
    }

    link.onPacket = (packet) => {
      // Packets Discord did not attribute to anyone are the silence around a rejoin; a bot's are never kept.
      if (!packet.speakerId || bots.has(packet.speakerId)) return
      if (!running.heard.has(packet.speakerId)) {
        // Heard before Discord said they had joined.
        const member = link.members().find((candidate) => candidate.id === packet.speakerId)
        if (!member || member.bot) {
          if (member) bots.add(member.id)
          return
        }
        joined(member)
      }
      running.speakers.get(packet.speakerId)!.lastHeardAtMs = packet.receivedAtMs
      recorder.packet(packet)
    }
    link.onMemberJoined = joined
    link.onMemberLeft = (memberId) => {
      if (running.heard.has(memberId)) recorder.speakerLeft(memberId, this.#now())
    }
    link.onDisconnected = () => recorder.disconnected(this.#now())
    link.onReconnected = () => recorder.reconnected(this.#now())
    for (const member of link.members()) joined(member)
    return running
  }

  async #stopRecorder(recorder: SessionRecorder, reason: string): Promise<FinaliseResult> {
    try {
      return await recorder.stop(reason, this.#now())
    } finally {
      this.#owned.delete(recorder.location.sessionId)
    }
  }

  async #finish(serverId: string, running: Running, reason: string): Promise<StopReply> {
    // Gone from here first, so that a second `/stop` finds nothing to stop.
    this.#running.delete(serverId)
    running.link.onPacket = null
    running.link.leave()
    const stoppedAtMs = this.#now()
    // Anyone still being looked up is recorded before the journal closes.
    await Promise.all(running.lookups)
    const result = await this.#stopRecorder(running.recorder, reason)
    const reply: StopReply =
      result.status === 'needs-attention'
        ? { status: 'saved-incomplete', number: running.number, reason: result.reason }
        : { status: 'saved', number: running.number }
    // The status message is left saying how the session ended up, not that it is still going.
    if (running.statusMessageId) {
      const text = this.#status(running, stoppedAtMs, true)
      await this.#messages?.edit(running.textChannelId!, running.statusMessageId, text).catch(() => undefined)
    }
    await this.#say(running, savedMessage(reply, reason))
    return reply
  }
}

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
import type { VoiceGateway, VoiceLink, VoiceMember } from './voice.ts'

export type CommandCaller = {
  serverId: string
  userId: string
  /** The voice channel the caller is in, if any. */
  voiceChannelId: string | null
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

type Running = {
  recorder: SessionRecorder
  link: VoiceLink
  number: number
  heard: Set<string>
  /** Speakers whose place in the group is still being looked up. */
  lookups: Set<Promise<void>>
}

export type RunnerOptions = {
  voice: VoiceGateway
  recorder: RecorderOptions
  now?: () => number
}

export class SessionRunner {
  #voice: VoiceGateway
  #recorderOptions: RecorderOptions
  #now: () => number
  /** The session being recorded in each server, by server. */
  #running = new Map<string, Running>()
  /** Servers where a `/join` is part way through, so that a second one arriving meanwhile is turned away. */
  #starting = new Set<string>()
  #owned = new Set<string>()

  constructor(options: RunnerOptions) {
    this.#voice = options.voice
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
      this.#owned.add(recorder.location.sessionId)
      let link: VoiceLink
      try {
        link = await this.#voice.join(caller.serverId, caller.voiceChannelId)
      } catch {
        await this.#stopRecorder(recorder, 'could not join the voice channel')
        return { status: 'voice-failed' }
      }
      this.#attach(caller.serverId, { recorder, link, number, heard: new Set(), lookups: new Set() })
      link.announce()
      return { status: 'started', number, location: recorder.location }
    } finally {
      this.#starting.delete(caller.serverId)
    }
  }

  async stop(caller: Omit<CommandCaller, 'voiceChannelId'>): Promise<StopReply> {
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
    this.#attach(origin.discordServerId, { recorder, link, number: origin.number, heard: new Set(), lookups: new Set() })
    return 'resumed'
  }

  /** Call several times a second. */
  tick(nowMs = this.#now()): void {
    for (const { recorder } of this.#running.values()) recorder.tick(nowMs)
  }

  /** Wires a voice channel to a recorder, and records who is in it. */
  #attach(serverId: string, running: Running): void {
    const { recorder, link } = running
    this.#running.set(serverId, running)
    const { store } = this.#recorderOptions
    const bots = new Set<string>()

    const joined = (member: VoiceMember) => {
      if (member.bot) {
        bots.add(member.id)
        return
      }
      running.heard.add(member.id)
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
      recorder.packet(packet)
    }
    link.onMemberJoined = joined
    link.onMemberLeft = (memberId) => {
      if (running.heard.has(memberId)) recorder.speakerLeft(memberId, this.#now())
    }
    link.onDisconnected = () => recorder.disconnected(this.#now())
    link.onReconnected = () => recorder.reconnected(this.#now())
    for (const member of link.members()) joined(member)
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
    // Anyone still being looked up is recorded before the journal closes.
    await Promise.all(running.lookups)
    const result = await this.#stopRecorder(running.recorder, reason)
    if (result.status === 'needs-attention') return { status: 'saved-incomplete', number: running.number, reason: result.reason }
    return { status: 'saved', number: running.number }
  }
}

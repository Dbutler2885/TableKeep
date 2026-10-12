/**
 * What the bot needs of Discord's voice channels, and nothing more.
 *
 * The session runner is written against this, so that tests can stand in for
 * Discord with a scripted channel and the real library is confined to one
 * adapter.
 */
import type { VoicePacket } from '../audio/timeline.ts'

export type VoiceMember = {
  id: string
  displayName: string
  /** Whether Discord flags the account as a bot. Bots are never recorded. */
  bot: boolean
}

/** The bot's presence in one voice channel. */
export interface VoiceLink {
  /** Everyone in the channel right now, the bot itself included. */
  members(): VoiceMember[]
  /** Says "now recording" aloud in the channel. */
  announce(): void
  leave(): void
  /** A decrypted voice packet has arrived. `speakerId` is empty when Discord did not say whose it was. */
  onPacket: ((packet: VoicePacket) => void) | null
  onMemberJoined: ((member: VoiceMember) => void) | null
  onMemberLeft: ((memberId: string) => void) | null
  /** The bot has lost the channel and can hear nobody. */
  onDisconnected: (() => void) | null
  onReconnected: (() => void) | null
}

export interface VoiceGateway {
  /** Joins a voice channel. Rejects if the channel cannot be joined. */
  join(serverId: string, channelId: string): Promise<VoiceLink>
}

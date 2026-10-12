/** A stand-in for Discord's voice channels: a test says who is in a channel and what arrives from it. */
import type { VoicePacket } from '../../src/audio/timeline.ts'
import type { VoiceGateway, VoiceLink, VoiceMember } from '../../src/discord/voice.ts'

export class ScriptedLink implements VoiceLink {
  onPacket: ((packet: VoicePacket) => void) | null = null
  onMemberJoined: ((member: VoiceMember) => void) | null = null
  onMemberLeft: ((memberId: string) => void) | null = null
  onDisconnected: (() => void) | null = null
  onReconnected: (() => void) | null = null
  readonly serverId: string
  readonly channelId: string
  announcements = 0
  left = false
  #members: VoiceMember[]

  constructor(serverId: string, channelId: string, members: VoiceMember[]) {
    this.serverId = serverId
    this.channelId = channelId
    this.#members = [...members]
  }

  members(): VoiceMember[] {
    return this.#members
  }

  announce(): void {
    this.announcements += 1
  }

  leave(): void {
    this.left = true
  }

  /** Someone comes into the channel. */
  arrive(member: VoiceMember): void {
    this.#members.push(member)
    this.onMemberJoined?.(member)
  }

  depart(memberId: string): void {
    this.#members = this.#members.filter((member) => member.id !== memberId)
    this.onMemberLeft?.(memberId)
  }

  deliver(packets: VoicePacket[]): void {
    for (const packet of packets) this.onPacket?.(packet)
  }
}

export class ScriptedVoice implements VoiceGateway {
  /** Who is in each voice channel, by channel. */
  readonly channels = new Map<string, VoiceMember[]>()
  readonly links: ScriptedLink[] = []
  /** Set to make joining fail, as when the bot is not allowed into the channel. */
  refuses = false

  async join(serverId: string, channelId: string): Promise<VoiceLink> {
    if (this.refuses) throw new Error('Missing permission to connect.')
    const link = new ScriptedLink(serverId, channelId, this.channels.get(channelId) ?? [])
    this.links.push(link)
    return link
  }
}

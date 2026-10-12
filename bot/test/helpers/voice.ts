/** A stand-in for Discord's voice channels: a test says who is in a channel and what arrives from it. */
import type { VoicePacket } from '../../src/audio/timeline.ts'
import type { MessageBoard, VoiceGateway, VoiceLink, VoiceMember } from '../../src/discord/voice.ts'

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

/** A text channel that remembers what was posted to it and how each message was changed. */
export class ScriptedBoard implements MessageBoard {
  /** Every message posted, in order, as it reads now. */
  readonly messages: { channelId: string; id: string; text: string; quiet: boolean; edits: number }[] = []
  /** Set to make posting and editing fail, as when the bot may not write in the channel. */
  refuses = false

  async post(channelId: string, text: string, options: { quiet?: boolean } = {}): Promise<string> {
    if (this.refuses) throw new Error('Missing permission to send messages.')
    const id = `message-${this.messages.length + 1}`
    this.messages.push({ channelId, id, text, quiet: options.quiet ?? false, edits: 0 })
    return id
  }

  async edit(channelId: string, messageId: string, text: string): Promise<void> {
    if (this.refuses) throw new Error('Missing permission to send messages.')
    const message = this.messages.find((candidate) => candidate.channelId === channelId && candidate.id === messageId)
    if (!message) throw new Error('Unknown message.')
    message.text = text
    message.edits += 1
  }
}

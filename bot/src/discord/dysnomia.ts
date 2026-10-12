/**
 * Discord itself, by way of the Dysnomia library: the one place the bot
 * touches it.
 *
 * Dysnomia, with the DAVE library beside it, is what Craig uses, and is what
 * makes receiving voice possible under Discord's end-to-end voice encryption.
 * Everything learned about how it behaves is in the listening spike's findings.
 */
import {
  Client,
  Constants,
  type AnyVoiceChannel,
  type ApplicationCommandStructure,
  type CommandInteraction,
  type Member,
} from '@projectdysnomia/dysnomia'
import { joinReply, noteReply, stopReply } from './replies.ts'
import type { SessionRunner } from './runner.ts'
import type { MessageBoard, VoiceGateway, VoiceLink, VoiceMember } from './voice.ts'

const COMMANDS: ApplicationCommandStructure[] = [
  { name: 'join', description: 'Start recording the voice channel you are in', type: Constants.ApplicationCommandTypes.CHAT_INPUT },
  { name: 'stop', description: 'Stop recording and save the session', type: Constants.ApplicationCommandTypes.CHAT_INPUT },
  {
    name: 'note',
    description: 'Mark this moment in the session',
    type: Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      { name: 'text', description: 'What to note', type: Constants.ApplicationCommandOptionTypes.STRING, required: true, max_length: 500 },
    ],
  },
]

const VOICE_CHANNEL_TYPES: number[] = [Constants.ChannelTypes.GUILD_VOICE, Constants.ChannelTypes.GUILD_STAGE_VOICE]

function voiceMember(member: Member): VoiceMember {
  return { id: member.id, displayName: member.nick ?? member.user.globalName ?? member.username, bot: member.bot }
}

export type DiscordOptions = {
  token: string
  /** The spoken "now recording", as an Ogg Opus file. */
  announcementPath: string
  log?: (message: string, detail?: Record<string, unknown>) => void
}

export class DiscordBot implements VoiceGateway, MessageBoard {
  readonly client: Client
  #options: DiscordOptions
  #log: NonNullable<DiscordOptions['log']>
  /** The bot's link to each voice channel it is in, by channel. */
  #links = new Map<string, VoiceLink>()

  constructor(options: DiscordOptions) {
    this.#options = options
    this.#log = options.log ?? (() => undefined)
    this.client = new Client(`Bot ${options.token}`, {
      gateway: { intents: ['guilds', 'guildVoiceStates'] },
      // Nothing the bot says should ever ping anyone.
      allowedMentions: { everyone: false, roles: false, users: false, repliedUser: false },
    })
    this.client.on('error', (error) => this.#log('discord error', { error: String(error) }))
    this.client.on('warn', (message) => this.#log('discord warning', { message: String(message) }))
    this.client.on('voiceChannelJoin', (member, channel) => this.#links.get(channel.id)?.onMemberJoined?.(voiceMember(member)))
    this.client.on('voiceChannelLeave', (member, channel) => this.#links.get(channel.id)?.onMemberLeft?.(member.id))
    this.client.on('voiceChannelSwitch', (member, newChannel, oldChannel) => {
      this.#links.get(oldChannel.id)?.onMemberLeft?.(member.id)
      this.#links.get(newChannel.id)?.onMemberJoined?.(voiceMember(member))
    })
  }

  /** Connects to Discord and resolves once the bot is ready, with its commands registered in every server it is in. */
  async connect(): Promise<void> {
    const ready = new Promise<void>((resolve) => this.client.once('ready', () => resolve()))
    await this.client.connect()
    await ready
    // Registered per server, which takes effect at once; a global command can take an hour to appear.
    for (const guild of this.client.guilds.values()) await this.#registerCommands(guild.id)
    this.client.on('guildCreate', (guild) => void this.#registerCommands(guild.id))
  }

  async #registerCommands(serverId: string): Promise<void> {
    try {
      await this.client.bulkEditGuildCommands(serverId, COMMANDS)
    } catch (error) {
      this.#log('could not register commands', { serverId, error: String(error) })
    }
  }

  /** Answers the bot's commands with the runner. */
  serve(runner: SessionRunner): void {
    this.client.on('interactionCreate', (interaction) => {
      if (interaction.type !== Constants.InteractionTypes.APPLICATION_COMMAND) return
      void this.#command(interaction as CommandInteraction, runner).catch((error: unknown) =>
        this.#log('command failed', { command: (interaction as CommandInteraction).data.name, error: String(error) }),
      )
    })
  }

  async #command(interaction: CommandInteraction, runner: SessionRunner): Promise<void> {
    const serverId = interaction.guild?.id
    const member = interaction.member
    if (!serverId || !member) {
      await interaction.createMessage({ content: 'Use this in a server.', flags: Constants.MessageFlags.EPHEMERAL })
      return
    }
    // Discord wants an answer within three seconds, and finishing a session takes longer. This holds
    // the place, privately, so that a refusal is seen only by the person who asked.
    await interaction.defer(Constants.MessageFlags.EPHEMERAL)
    const caller = { serverId, userId: member.id }
    let reply: string
    if (interaction.data.name === 'join') {
      const voiceChannelId = this.client.guilds.get(serverId)?.members.get(member.id)?.voiceState.channelID ?? null
      reply = joinReply(await runner.join({ ...caller, voiceChannelId, textChannelId: interaction.channel?.id ?? null }))
    } else if (interaction.data.name === 'stop') {
      reply = stopReply(await runner.stop(caller))
    } else if (interaction.data.name === 'note') {
      const option = interaction.data.options?.find((candidate) => candidate.name === 'text')
      const text = option && 'value' in option && typeof option.value === 'string' ? option.value : ''
      reply = noteReply(await runner.note(caller, text))
    } else {
      return
    }
    await interaction.editOriginalMessage({ content: reply })
  }

  async post(channelId: string, text: string, options: { quiet?: boolean } = {}): Promise<string> {
    try {
      const message = await this.client.createMessage(channelId, {
        content: text,
        flags: options.quiet ? Constants.MessageFlags.SUPPRESS_NOTIFICATIONS : undefined,
      })
      return message.id
    } catch (error) {
      this.#log('could not post in the channel', { channelId, error: String(error) })
      throw error
    }
  }

  async edit(channelId: string, messageId: string, text: string): Promise<void> {
    await this.client.editMessage(channelId, messageId, { content: text })
  }

  async join(serverId: string, channelId: string): Promise<VoiceLink> {
    const channel = this.client.getChannel(channelId) as AnyVoiceChannel | undefined
    if (!channel || !VOICE_CHANNEL_TYPES.includes(channel.type) || channel.guild.id !== serverId) {
      throw new Error('That is not a voice channel in this server.')
    }
    const connection = await this.client.joinVoiceChannel(channelId, { opusOnly: true, selfDeaf: false, selfMute: false })
    const { client } = this
    const links = this.#links
    const log = this.#log
    const announcementPath = this.#options.announcementPath

    const link: VoiceLink = {
      onPacket: null,
      onMemberJoined: null,
      onMemberLeft: null,
      onDisconnected: null,
      onReconnected: null,
      members: () => [...channel.voiceMembers.values()].map(voiceMember),
      announce: () => {
        try {
          connection.play(announcementPath, { format: 'ogg' })
        } catch (error) {
          log('could not play the announcement', { error: String(error) })
        }
      },
      leave: () => {
        links.delete(channelId)
        connection.removeAllListeners()
        // Left with nothing listening, an error after this would bring the process down.
        connection.on('error', () => undefined)
        client.leaveVoiceChannel(channelId)
      },
    }
    links.set(channelId, link)

    connection.receive('opus').on('data', (data, userID, timestamp, sequence) => {
      link.onPacket?.({
        // Around a rejoin Discord sends a few packets it has not yet said the owner of.
        speakerId: userID ?? '',
        sequence,
        rtpTimestamp: timestamp,
        payload: data,
        receivedAtMs: Date.now(),
      })
    })
    // The library reconnects by itself after a dropped websocket, and audio keeps arriving meanwhile.
    // `disconnect` is only the end of the road: removed from the channel, or unable to get back.
    let lost = false
    connection.on('disconnect', (error) => {
      lost = true
      log('voice disconnected', { serverId, error: error ? String(error) : null })
      link.onDisconnected?.()
    })
    connection.on('ready', () => {
      if (!lost) return
      lost = false
      link.onReconnected?.()
    })
    connection.on('error', (error) => log('voice error', { serverId, error: String(error) }))
    connection.on('warn', (message) => log('voice warning', { serverId, message: String(message) }))
    return link
  }
}

/**
 * What the bot says in answer to a command.
 *
 * `private` answers are shown only to the person who typed the command;
 * the rest are for the whole channel.
 */
import type { JoinReply, StopReply } from './runner.ts'

export type Reply = { text: string; private: boolean }

const REFUSALS = {
  'server-not-linked':
    "This Discord server isn't linked to a Table Keep group yet. A GM can link it from the group's settings in Table Keep.",
  'not-connected': "You haven't connected your Discord account to Table Keep yet. Connect it from your account settings in Table Keep, then try again.",
  'not-a-member': "You're not a member of the Table Keep group this server is linked to.",
} as const

export function joinReply(reply: JoinReply): Reply {
  switch (reply.status) {
    case 'started':
      return { text: `Recording session ${reply.number}. Use \`/stop\` when you're done.`, private: false }
    case 'already-recording':
      return { text: 'Already recording in this server. Use `/stop` to end the session.', private: true }
    case 'not-in-voice':
      return { text: 'Join a voice channel first, then use `/join`.', private: true }
    case 'no-current-campaign':
      return { text: "The group has no current campaign to record into. A GM can choose one in Table Keep.", private: true }
    case 'disk-full':
      return { text: "I can't start a recording right now: the recorder is out of disk space.", private: true }
    case 'voice-failed':
      return { text: "I couldn't join your voice channel. Check that I'm allowed to connect to it.", private: true }
    default:
      return { text: REFUSALS[reply.status], private: true }
  }
}

export function stopReply(reply: StopReply): Reply {
  switch (reply.status) {
    case 'saved':
      return { text: `Session ${reply.number} is saved.`, private: false }
    case 'saved-incomplete':
      return { text: `Session ${reply.number} is saved, but not finished: ${reply.reason}`, private: false }
    case 'not-recording':
      return { text: "Nothing is being recorded in this server.", private: true }
    default:
      return { text: REFUSALS[reply.status], private: true }
  }
}

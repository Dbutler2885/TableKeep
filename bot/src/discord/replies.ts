/**
 * Everything the bot says in Discord.
 *
 * An answer to a command is shown only to the person who typed it. What the
 * whole table should know is posted in the channel by the bot itself: one
 * status message that is edited in place, one message when the session is
 * saved, and one more only when something goes wrong. Nothing here is ever
 * about the recap.
 */
import type { JoinReply, NoteReply, StopReply } from './runner.ts'

const REFUSALS = {
  'server-not-linked':
    "This Discord server isn't linked to a Table Keep group yet. A GM can link it from the group's settings in Table Keep.",
  'not-connected': "You haven't connected your Discord account to Table Keep yet. Connect it from your account settings in Table Keep, then try again.",
  'not-a-member': "You're not a member of the Table Keep group this server is linked to.",
} as const

export function joinReply(reply: JoinReply): string {
  switch (reply.status) {
    case 'started':
      return `Recording session ${reply.number}. Use \`/stop\` when you're done.`
    case 'already-recording':
      return 'Already recording in this server. Use `/stop` to end the session.'
    case 'not-in-voice':
      return 'Join a voice channel first, then use `/join`.'
    case 'no-current-campaign':
      return "The group has no current campaign to record into. A GM can choose one in Table Keep."
    case 'disk-full':
      return "I can't start a recording right now: the recorder is out of disk space."
    case 'voice-failed':
      return "I couldn't join your voice channel. Check that I'm allowed to connect to it."
    default:
      return REFUSALS[reply.status]
  }
}

export function stopReply(reply: StopReply): string {
  switch (reply.status) {
    case 'saved':
      return `Stopped. Session ${reply.number} is saved.`
    case 'saved-incomplete':
      return `Stopped. Session ${reply.number} is saved, but not finished yet.`
    case 'not-recording':
      return "Nothing is being recorded in this server."
    default:
      return REFUSALS[reply.status]
  }
}

/** Minutes and seconds, or hours, minutes and seconds once there are hours. */
function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function noteReply(reply: NoteReply): string {
  switch (reply.status) {
    case 'noted':
      return `Noted at ${clock(reply.atSeconds)}.`
    case 'empty':
      return 'Add some text to the note.'
    case 'not-recording':
      return 'Nothing is being recorded in this server.'
    default:
      return REFUSALS[reply.status]
  }
}

export type SpeakerStatus = { name: string; heardSecondsAgo: number | null; utterances: number }

function heard(secondsAgo: number | null): string {
  if (secondsAgo === null) return 'not heard yet'
  if (secondsAgo < 10) return 'heard just now'
  if (secondsAgo < 90) return `heard ${secondsAgo}s ago`
  return `heard ${Math.round(secondsAgo / 60)}m ago`
}

/** The one message that shows a session is being recorded and that each person is being heard. */
export function statusMessage(status: { number: number; elapsedSeconds: number; speakers: SpeakerStatus[]; ended?: boolean }): string {
  const head = status.ended
    ? `Session ${status.number} ended after ${clock(status.elapsedSeconds)}.`
    : `Recording session ${status.number} - ${clock(status.elapsedSeconds)}`
  const lines = status.speakers.map((speaker) => {
    const lines = `${speaker.utterances} ${speaker.utterances === 1 ? 'line' : 'lines'}`
    return status.ended ? `${speaker.name}: ${lines}` : `${speaker.name}: ${heard(speaker.heardSecondsAgo)}, ${lines}`
  })
  return [head, ...lines].join('\n')
}

export function savedMessage(reply: Extract<StopReply, { number: number }>, reason: string): string {
  const why = reason === 'stop command' ? '' : ` It ended because ${reason}.`
  return reply.status === 'saved'
    ? `Session ${reply.number} is saved.${why}`
    : `Session ${reply.number} is saved, but not finished yet.${why} ${reply.reason}`
}

export function restartedMessage(number: number): string {
  return `I restarted and have rejoined. Session ${number} is still being recorded; the moments I was away are missing.`
}

const ALARMS = {
  'cannot-transcribe': "I can't reach the transcription service. The audio is still being recorded and will be transcribed when it's back.",
  'cannot-store': "I can't reach storage. The audio is safe on the recorder and will be stored when it's back.",
  'disk-low': 'The recorder is nearly out of disk space. Please `/stop` soon, or this session may be cut short.',
} as const

export function alarmMessage(problem: keyof typeof ALARMS): string {
  return ALARMS[problem]
}

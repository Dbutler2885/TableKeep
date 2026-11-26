/**
 * Everything the bot says in Discord.
 *
 * An answer to a command is shown only to the person who typed it. What the
 * whole table should know is posted in the channel by the bot itself: one
 * status message that is edited in place, one message when the session is
 * saved, one more only when something goes wrong, and the answer to a rules
 * question someone at the table asked. Nothing here is ever about the recap.
 */
import type { RulesAnswer } from '../rules/answer.ts'
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

/** Discord refuses a message longer than this. */
const MAX_MESSAGE_CHARS = 2_000

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/** Short label for the card header: the rule title, section, or generic fallback. */
function cardTitle(reply: RulesAnswer): string {
  const label = reply.title || reply.section
  return label ? clip(label, 80) : 'Rules answer'
}

/** Compact who/what attribution for the muted footer, or empty when no question was named. */
function askedFooter(reply: RulesAnswer): string {
  if (!reply.question) return ''
  const question = `"${clip(reply.question, 100)}"`
  return reply.askedBy ? `${clip(reply.askedBy, 40)}: ${question}` : question
}

/** Source label for the muted footer when the rule set cites its document. */
function sourcePart(reply: RulesAnswer, citedAs: string): string {
  const section = reply.section ? clip(reply.section, 80) : ''
  if (reply.kind === 'not_covered') return `Not covered by ${citedAs}`
  if (reply.kind === 'not_decided') return `Not decided yet${section ? ` (${section})` : ` in ${citedAs}`}`
  return section || citedAs
}

/** Compact muted footer line, or empty when nothing should be appended. */
function cardFooter(reply: RulesAnswer, citedAs: string | null): string {
  const parts = [citedAs ? sourcePart(reply, citedAs) : '', askedFooter(reply)].filter(Boolean)
  return parts.length > 0 ? `-# ${parts.join(' · ')}` : ''
}

/** A line too long for one message, cut between words where it can be. */
function wrapLine(line: string, max: number): string[] {
  const pieces: string[] = []
  let rest = line
  while (rest.length > max) {
    const space = rest.lastIndexOf(' ', max)
    const at = space > 0 ? space : max
    pieces.push(rest.slice(0, at))
    rest = rest.slice(at).trimStart()
  }
  pieces.push(rest)
  return pieces
}

/** Text cut into messages Discord will take, between lines wherever it can be. */
export function splitMessages(text: string, max = MAX_MESSAGE_CHARS): string[] {
  const messages: string[] = []
  let current = ''
  for (const piece of text.split('\n').flatMap((line) => wrapLine(line, max))) {
    const joined = current ? `${current}\n${piece}` : piece
    if (joined.length <= max) {
      current = joined
    } else {
      messages.push(current)
      current = piece
    }
  }
  if (current.trim()) messages.push(current)
  return messages
}

/**
 * The bot's answer to a rules question it heard, as compact card message(s) to
 * post, or none when the model found no question to answer.
 *
 * `not_covered` and `not_decided` render as a single compact line (`**Title** — ...`),
 * while `answered` renders as `**Title**` followed by short bullet points.
 * A muted `-#` footer carries the source section (when `citedAs` is set) and
 * the echoed question.
 */
export function rulesAnswerMessages(reply: RulesAnswer, citedAs: string | null): string[] {
  if (reply.kind === 'no_question' || !reply.answer) return []
  const heading = `**${cardTitle(reply)}**`
  const body = reply.answer.trim()
  const lines = reply.kind === 'answered' ? [heading, body] : [`${heading} — ${body}`]
  const footer = cardFooter(reply, citedAs)
  if (footer) lines.push(footer)
  return splitMessages(lines.join('\n'))
}

/**
 * A recorded session as a reader sees it: what was said, the notes dropped
 * with `/note`, and the stretches the recorder could not hear, in the order
 * they happened.
 */

/** Positions on a session's timeline are counted in samples at this rate. */
export const SAMPLES_PER_SECOND = 48_000

export type SessionUtterance = { id: string; speakerId: string; startSamples: number; endSamples: number; text: string }
export type SessionMarker = { id: string; atSamples: number; text: string; authorDiscordId: string }
export type SessionGap = { id: string; startSamples: number; endSamples: number }
export type SessionSpeaker = { discordId: string; displayName: string }

export type TimelineEntry =
  | { kind: 'speech'; key: string; atSamples: number; speaker: string; text: string }
  | { kind: 'note'; key: string; atSamples: number; author: string; text: string }
  | { kind: 'gap'; key: string; atSamples: number; seconds: number }

/** Consecutive lines from one speaker are joined when the pause between them is shorter than this. */
const JOIN_WITHIN_SECONDS = 2

/** Minutes and seconds into the session, with hours once there are any. */
export function formatSessionClock(samples: number): string {
  const total = Math.max(0, Math.floor(samples / SAMPLES_PER_SECOND))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** The day a session was played, as a reader in their own country would write it. */
export function formatSessionDate(startedAtMs: number): string {
  return new Date(startedAtMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatGapLength(seconds: number): string {
  if (seconds < 1.5) return '1 second'
  if (seconds < 60) return `${Math.round(seconds)} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

/**
 * Merges utterances, notes and gaps into one reading order.
 *
 * `throughSamples` is how far the utterances loaded so far reach. Notes and
 * gaps beyond it are held back, so that a page of transcript never shows a
 * note above speech that has not been loaded yet. Pass `null` once everything
 * is loaded.
 */
export function buildSessionTimeline(input: {
  utterances: SessionUtterance[]
  markers: SessionMarker[]
  gaps: SessionGap[]
  speakers: SessionSpeaker[]
  throughSamples: number | null
}): TimelineEntry[] {
  const names = new Map(input.speakers.map((speaker) => [speaker.discordId, speaker.displayName]))
  const nameOf = (discordId: string) => names.get(discordId) || 'Unknown speaker'
  const within = (atSamples: number) => input.throughSamples === null || atSamples <= input.throughSamples

  type Placed = TimelineEntry & { order: number; speakerId?: string; endSamples?: number }
  const placed: Placed[] = [
    ...input.utterances.map(
      (utterance): Placed => ({
        kind: 'speech',
        key: `speech-${utterance.id}`,
        atSamples: utterance.startSamples,
        speaker: nameOf(utterance.speakerId),
        text: utterance.text,
        order: 1,
        speakerId: utterance.speakerId,
        endSamples: utterance.endSamples,
      }),
    ),
    ...input.markers
      .filter((marker) => within(marker.atSamples))
      .map(
        (marker): Placed => ({
          kind: 'note',
          key: `note-${marker.id}`,
          atSamples: marker.atSamples,
          author: nameOf(marker.authorDiscordId),
          text: marker.text,
          order: 0,
        }),
      ),
    ...input.gaps
      .filter((gap) => within(gap.startSamples))
      .map(
        (gap): Placed => ({
          kind: 'gap',
          key: `gap-${gap.id}`,
          atSamples: gap.startSamples,
          seconds: (gap.endSamples - gap.startSamples) / SAMPLES_PER_SECOND,
          order: 0,
        }),
      ),
  ].sort((a, b) => a.atSamples - b.atSamples || a.order - b.order)

  const entries: TimelineEntry[] = []
  let open: { speakerId: string; endSamples: number; entry: Extract<TimelineEntry, { kind: 'speech' }> } | null = null
  for (const { order: _order, speakerId, endSamples, ...entry } of placed) {
    void _order
    if (entry.kind !== 'speech') {
      // A note or a gap breaks the run: what is said after it starts a new line.
      open = null
      entries.push(entry)
      continue
    }
    if (open && open.speakerId === speakerId && entry.atSamples - open.endSamples < JOIN_WITHIN_SECONDS * SAMPLES_PER_SECOND) {
      open.entry.text = `${open.entry.text} ${entry.text}`
      open.endSamples = endSamples!
      continue
    }
    const speech = { ...entry }
    entries.push(speech)
    open = { speakerId: speakerId!, endSamples: endSamples!, entry: speech }
  }
  return entries
}

export type RecapStatus = 'pending' | 'delayed' | 'ready' | 'failed' | null
export type SessionState = 'running' | 'finalising' | 'ended'

/** What to say about a session in the list: where its recording, and then its recap, has got to. */
export function sessionStatusLabel(session: { state: SessionState; recapStatus: RecapStatus; needsAttention: string | null }): string {
  if (session.state === 'running') return 'Recording now'
  if (session.recapStatus === 'ready') return 'Recap ready'
  if (session.recapStatus === 'failed') return 'Recap failed'
  if (session.recapStatus === 'delayed' || session.needsAttention) return 'Recap delayed'
  if (session.state === 'finalising') return 'Saving'
  return 'Recap being written'
}

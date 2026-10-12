import { useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase'
import type { Role } from '../../types/app'
import type { CampaignScope } from '../campaign/firestorePaths'
import {
  buildSessionTimeline,
  formatGapLength,
  formatSessionClock,
  formatSessionDate,
  sessionStatusLabel,
  SAMPLES_PER_SECOND,
} from './sessionTimeline'
import { useSessionTranscript, type RecordedSession } from './useRecordedSessions'

type RecordedSessionDetailProps = {
  scope: CampaignScope
  session: RecordedSession
  role: Role | null
  /** Opens the session's recap, when it has one. */
  onOpenRecap: (summaryId: string) => void
}

export function RecordedSessionDetail({ scope, session, role, onOpenRecap }: RecordedSessionDetailProps) {
  const live = session.state !== 'ended'
  const transcript = useSessionTranscript(scope, session.id, live)
  const [rerun, setRerun] = useState<'idle' | 'asking' | 'failed'>('idle')

  const timeline = useMemo(
    () =>
      buildSessionTimeline({
        utterances: transcript.utterances,
        markers: transcript.markers,
        gaps: transcript.gaps,
        speakers: transcript.speakers,
        // While there is more to fetch, nothing is shown beyond the speech already here.
        throughSamples: transcript.hasMore ? (transcript.utterances.at(-1)?.endSamples ?? 0) : null,
      }),
    [transcript.utterances, transcript.markers, transcript.gaps, transcript.speakers, transcript.hasMore],
  )

  const askAgain = async () => {
    setRerun('asking')
    try {
      await httpsCallable(functions, 'rerunSessionRecap')({ groupId: scope.groupId, campaignId: scope.campaignId, sessionId: session.id })
      setRerun('idle')
    } catch (error) {
      console.error('Failed to ask for the recap again', error)
      setRerun('failed')
    }
  }

  const length =
    session.durationSeconds === null ? null : formatSessionClock(session.durationSeconds * SAMPLES_PER_SECOND)

  return (
    <div className="session-note-detail recorded-session">
      <header className="recorded-session-header">
        <h2 className="session-note-title">Session {session.number}</h2>
        <p className="session-note-number">
          {formatSessionDate(session.startedAtMs)}
          {length ? ` · ${length}` : ''} · {sessionStatusLabel(session)}
        </p>
      </header>

      {session.needsAttention ? <p className="recorded-session-notice">{session.needsAttention}</p> : null}
      {session.recapStatus === 'failed' ? (
        <div className="recorded-session-notice">
          <p>The recap could not be written{session.recapError ? `: ${session.recapError}` : '.'}</p>
          {role === 'gm' ? (
            <button type="button" onClick={() => void askAgain()} disabled={rerun === 'asking'}>
              {rerun === 'asking' ? 'Asking...' : 'Try again'}
            </button>
          ) : null}
          {rerun === 'failed' ? <p>That did not work. Try again in a moment.</p> : null}
        </div>
      ) : null}
      {session.recapStatus === 'ready' && session.recapSummaryId ? (
        <div>
          <button type="button" onClick={() => onOpenRecap(session.recapSummaryId!)}>
            Read the recap
          </button>
        </div>
      ) : null}

      <section className="recorded-session-transcript" aria-label="Transcript">
        {transcript.loading ? (
          <p className="map-npc-scene-empty">Loading the transcript...</p>
        ) : transcript.failed ? (
          <p className="map-npc-scene-empty">The transcript could not be loaded.</p>
        ) : timeline.length === 0 ? (
          <p className="map-npc-scene-empty">{live ? 'Nothing has been said yet.' : 'Nothing was said in this session.'}</p>
        ) : (
          <ol className="transcript-lines">
            {timeline.map((entry) =>
              entry.kind === 'speech' ? (
                <li key={entry.key} className="transcript-line">
                  <time className="transcript-time">{formatSessionClock(entry.atSamples)}</time>
                  <p>
                    <strong className="transcript-speaker">{entry.speaker}</strong> {entry.text}
                  </p>
                </li>
              ) : entry.kind === 'note' ? (
                <li key={entry.key} className="transcript-line transcript-note">
                  <time className="transcript-time">{formatSessionClock(entry.atSamples)}</time>
                  <p>
                    <span className="transcript-note-label">Note from {entry.author}</span> {entry.text}
                  </p>
                </li>
              ) : (
                <li key={entry.key} className="transcript-line transcript-gap">
                  <time className="transcript-time">{formatSessionClock(entry.atSamples)}</time>
                  <p>Nothing was recorded for {formatGapLength(entry.seconds)} here: the recorder was not connected.</p>
                </li>
              ),
            )}
          </ol>
        )}
        {transcript.hasMore ? (
          <button type="button" className="transcript-more" onClick={transcript.loadMore} disabled={transcript.loadingMore}>
            {transcript.loadingMore ? 'Loading...' : 'Load more'}
          </button>
        ) : null}
      </section>
    </div>
  )
}

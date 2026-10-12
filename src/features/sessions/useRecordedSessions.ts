import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignCollectionRef, type CampaignScope } from '../campaign/firestorePaths'
import type { RecapStatus, SessionGap, SessionMarker, SessionSpeaker, SessionState, SessionUtterance } from './sessionTimeline'

/** A session the recorder bot made, as the list shows it. */
export type RecordedSession = {
  id: string
  number: number
  state: SessionState
  startedAtMs: number
  /** How long the recording ran, once it has been stopped. */
  durationSeconds: number | null
  recapStatus: RecapStatus
  recapSummaryId: string | null
  recapError: string | null
  needsAttention: string | null
}

/** How many utterances are fetched at a time. A long session has a couple of thousand. */
export const TRANSCRIPT_PAGE_SIZE = 100

const millis = (value: unknown): number | null =>
  value && typeof (value as { toMillis?: unknown }).toMillis === 'function' ? (value as { toMillis: () => number }).toMillis() : null

function toSession(id: string, data: Record<string, unknown>): RecordedSession {
  const startedAtMs = millis(data.startedAt) ?? 0
  const stoppedAtMs = millis(data.stoppedAt)
  const state = data.state === 'running' || data.state === 'finalising' ? data.state : 'ended'
  const recapStatus = (['pending', 'delayed', 'ready', 'failed'] as const).find((status) => status === data.recapStatus) ?? null
  return {
    id,
    number: typeof data.number === 'number' ? data.number : 0,
    state,
    startedAtMs,
    durationSeconds: stoppedAtMs === null ? null : Math.max(0, Math.round((stoppedAtMs - startedAtMs) / 1000)),
    recapStatus,
    recapSummaryId: typeof data.recapSummaryId === 'string' ? data.recapSummaryId : null,
    recapError: typeof data.recapError === 'string' ? data.recapError : null,
    needsAttention: typeof data.needsAttention === 'string' ? data.needsAttention : null,
  }
}

/** The campaign's recorded sessions, newest first, kept up to date while the list is on screen. */
export function useRecordedSessions(scope: CampaignScope) {
  const { campaignId, groupId } = scope
  const [sessions, setSessions] = useState<RecordedSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sessionsQuery = query(campaignCollectionRef(db, { campaignId, groupId }, 'sessions'), orderBy('number', 'desc'))
    return onSnapshot(
      sessionsQuery,
      (snap) => {
        setSessions(snap.docs.map((docSnap) => toSession(docSnap.id, docSnap.data())))
        setLoading(false)
      },
      (error) => {
        console.error('Failed to load recorded sessions', error)
        setLoading(false)
      },
    )
  }, [campaignId, groupId])

  return { sessions, loading }
}

function toUtterance(docSnap: QueryDocumentSnapshot): SessionUtterance {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    speakerId: String(data.speakerId ?? ''),
    startSamples: Number(data.startSamples ?? 0),
    endSamples: Number(data.endSamples ?? 0),
    text: String(data.text ?? ''),
  }
}

export type SessionTranscript = {
  utterances: SessionUtterance[]
  markers: SessionMarker[]
  gaps: SessionGap[]
  speakers: SessionSpeaker[]
  loading: boolean
  /** Whether there is more of the transcript still to fetch. */
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  failed: boolean
}

/**
 * A session's transcript.
 *
 * A finished session is fetched a page at a time and nothing is left
 * listening to it. One that is still being recorded or saved is followed
 * live, so that the transcript grows on screen as people speak.
 *
 * It starts empty and is meant for one session: give the component that uses
 * it a `key` of the session, so that choosing another starts afresh.
 */
export function useSessionTranscript(scope: CampaignScope, sessionId: string, live: boolean): SessionTranscript {
  const { campaignId, groupId } = scope
  const [utterances, setUtterances] = useState<SessionUtterance[]>([])
  const [markers, setMarkers] = useState<SessionMarker[]>([])
  const [gaps, setGaps] = useState<SessionGap[]>([])
  const [speakers, setSpeakers] = useState<SessionSpeaker[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const lastDoc = useRef<QueryDocumentSnapshot | null>(null)
  /** Which session what is on screen belongs to, so that a late answer for another is dropped. */
  const current = useRef('')

  useEffect(() => {
    const key = `${groupId}/${campaignId}/${sessionId}/${live}`
    current.current = key
    const stillCurrent = () => current.current === key
    const part = (...segments: string[]) => campaignCollectionRef(db, { campaignId, groupId }, 'sessions', sessionId, ...segments)
    const utterancesQuery = query(part('transcripts', 'live', 'utterances'), orderBy('startSamples'))
    lastDoc.current = null

    const fail = (error: unknown) => {
      console.error('Failed to load a session transcript', error)
      if (!stillCurrent()) return
      setFailed(true)
      setLoading(false)
    }
    const toMarkers = (docs: QueryDocumentSnapshot[]): SessionMarker[] =>
      docs.map((docSnap) => ({
        id: docSnap.id,
        atSamples: Number(docSnap.data().atSamples ?? 0),
        text: String(docSnap.data().text ?? ''),
        authorDiscordId: String(docSnap.data().authorDiscordId ?? ''),
      }))
    const toGaps = (docs: QueryDocumentSnapshot[]): SessionGap[] =>
      docs.map((docSnap) => ({
        id: docSnap.id,
        startSamples: Number(docSnap.data().startSamples ?? 0),
        endSamples: Number(docSnap.data().endSamples ?? 0),
      }))
    const toSpeakers = (docs: QueryDocumentSnapshot[]): SessionSpeaker[] =>
      docs.map((docSnap) => ({ discordId: docSnap.id, displayName: String(docSnap.data().displayName ?? '') }))

    if (live) {
      const unsubscribers = [
        onSnapshot(utterancesQuery, (snap) => {
          setUtterances(snap.docs.map(toUtterance))
          setLoading(false)
        }, fail),
        onSnapshot(part('markers'), (snap) => setMarkers(toMarkers(snap.docs)), fail),
        onSnapshot(part('gaps'), (snap) => setGaps(toGaps(snap.docs)), fail),
        onSnapshot(part('speakers'), (snap) => setSpeakers(toSpeakers(snap.docs)), fail),
      ]
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    }

    void Promise.all([
      getDocs(query(utterancesQuery, limit(TRANSCRIPT_PAGE_SIZE))),
      getDocs(part('markers')),
      getDocs(part('gaps')),
      getDocs(part('speakers')),
    ]).then(([firstPage, markerSnap, gapSnap, speakerSnap]) => {
      if (!stillCurrent()) return
      // A session that ended while it was being followed is fetched again from the top, in pages.
      setUtterances(firstPage.docs.map(toUtterance))
      lastDoc.current = firstPage.docs.at(-1) ?? null
      setHasMore(firstPage.size === TRANSCRIPT_PAGE_SIZE)
      setMarkers(toMarkers(markerSnap.docs))
      setGaps(toGaps(gapSnap.docs))
      setSpeakers(toSpeakers(speakerSnap.docs))
      setLoading(false)
    }, fail)
    return undefined
  }, [campaignId, groupId, sessionId, live])

  const loadMore = useCallback(() => {
    const after = lastDoc.current
    if (!after || loadingMore) return
    const key = current.current
    setLoadingMore(true)
    const utterancesQuery = query(
      campaignCollectionRef(db, { campaignId, groupId }, 'sessions', sessionId, 'transcripts', 'live', 'utterances'),
      orderBy('startSamples'),
      startAfter(after),
      limit(TRANSCRIPT_PAGE_SIZE),
    )
    getDocs(utterancesQuery)
      .then((page) => {
        if (current.current !== key) return
        setUtterances((existing) => [...existing, ...page.docs.map(toUtterance)])
        lastDoc.current = page.docs.at(-1) ?? lastDoc.current
        setHasMore(page.size === TRANSCRIPT_PAGE_SIZE)
      })
      .catch((error: unknown) => console.error('Failed to load more of a session transcript', error))
      .finally(() => setLoadingMore(false))
  }, [campaignId, groupId, sessionId, loadingMore])

  return { utterances, markers, gaps, speakers, loading, hasMore, loadingMore, loadMore, failed }
}

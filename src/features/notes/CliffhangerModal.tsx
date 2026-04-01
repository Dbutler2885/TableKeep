import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useSessionNotes } from './useSessionNotes'

type CliffhangerModalProps = {
  campaignId: string
  userId: string
  enabled?: boolean
}

const CLIFFHANGER_DELAY_DAYS = 3.5

function daysSince(timestamp: unknown): number {
  if (!timestamp || typeof timestamp !== 'object') return Infinity
  const ts = timestamp as { seconds?: number; toDate?: () => Date }
  const date = typeof ts.toDate === 'function' ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null
  if (!date) return Infinity
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
}

export function CliffhangerModal({ campaignId, userId, enabled = true }: CliffhangerModalProps) {
  const { notes } = useSessionNotes(campaignId, enabled)
  const [lastSeenId, setLastSeenId] = useState<string | null>(null)
  const [membershipLoaded, setMembershipLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setLastSeenId(null)
      setMembershipLoaded(false)
      return
    }

    const unsub = onSnapshot(
      doc(db, 'users', userId, 'campaignMemberships', campaignId),
      (snap) => {
        const data = snap.data()
        setLastSeenId(typeof data?.lastSeenCliffhangerNoteId === 'string' ? data.lastSeenCliffhangerNoteId : null)
        setMembershipLoaded(true)
      },
      () => {
        setMembershipLoaded(true)
      },
    )
    return () => unsub()
  }, [campaignId, enabled, userId])

  // Find the latest note that has cliffhangers
  const latestWithCliffhangers = notes.find((note) => note.cliffhangers.length > 0) ?? null

  if (
    !membershipLoaded
    || dismissed
    || !latestWithCliffhangers
    || latestWithCliffhangers.id === lastSeenId
    || daysSince(latestWithCliffhangers.createdAt) < CLIFFHANGER_DELAY_DAYS
  ) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    void setDoc(
      doc(db, 'users', userId, 'campaignMemberships', campaignId),
      { lastSeenCliffhangerNoteId: latestWithCliffhangers.id, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((error) => {
      console.error('Failed to save cliffhanger dismissal', error)
    })
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal cliffhanger-modal">
        <h3 className="cliffhanger-heading">When last we left our heroes...</h3>
        <ul className="cliffhanger-list">
          {latestWithCliffhangers.cliffhangers.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        <div className="cliffhanger-actions">
          <button type="button" onClick={handleDismiss}>Continue...</button>
        </div>
      </div>
    </div>
  )
}

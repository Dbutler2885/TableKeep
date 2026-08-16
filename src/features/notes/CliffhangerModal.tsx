import { useEffect, useState } from 'react'
import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignUserStateRef } from '../campaign/firestorePaths'
import { useSessionNotes } from './useSessionNotes'

type CliffhangerModalProps = {
  campaignId: string
  groupId: string
  userId: string
  enabled?: boolean
}

const CLIFFHANGER_DELAY_DAYS = 3.5

function persistDismissal(scope: { campaignId: string; groupId: string; userId: string }, noteId: string) {
  void setDoc(
    campaignUserStateRef(db, { campaignId: scope.campaignId, groupId: scope.groupId }, scope.userId),
    { lastSeenCliffhangerNoteId: noteId, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch((error) => {
    console.error('Failed to save cliffhanger dismissal', error)
  })
}

function daysSince(timestamp: unknown): number {
  if (!timestamp || typeof timestamp !== 'object') return Infinity
  const ts = timestamp as { seconds?: number; toDate?: () => Date }
  const date = typeof ts.toDate === 'function' ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null
  if (!date) return Infinity
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
}

export function CliffhangerModal({ campaignId, groupId, userId, enabled = true }: CliffhangerModalProps) {
  const { notes } = useSessionNotes(campaignId, enabled, groupId)
  const [lastSeenId, setLastSeenId] = useState<string | null>(null)
  const [membershipLoaded, setMembershipLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setLastSeenId(null)
      setMembershipLoaded(false)
      return
    }

    const userStateRef = campaignUserStateRef(db, { campaignId, groupId }, userId)

    const unsub = onSnapshot(
      userStateRef,
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
  }, [campaignId, enabled, groupId, userId])

  // Find the latest note that has cliffhangers
  const latestWithCliffhangers = notes.find((note) => note.cliffhangers.length > 0) ?? null

  const visible = membershipLoaded
    && !dismissed
    && latestWithCliffhangers !== null
    && latestWithCliffhangers.id !== lastSeenId
    && daysSince(latestWithCliffhangers.createdAt) >= CLIFFHANGER_DELAY_DAYS

  const noteId = visible ? latestWithCliffhangers.id : null

  const handleDismiss = () => {
    if (!noteId) return
    setDismissed(true)
    persistDismissal({ campaignId, groupId, userId }, noteId)
  }

  // Escape/Enter dismiss it: the modal is purely informational, and a keyboard
  // escape hatch matters most on the short viewports where it needs scrolling.
  useEffect(() => {
    if (!noteId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return
      event.preventDefault()
      setDismissed(true)
      persistDismissal({ campaignId, groupId, userId }, noteId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [campaignId, groupId, noteId, userId])

  if (!visible || !latestWithCliffhangers) return null

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
          <button type="button" autoFocus onClick={handleDismiss}>Continue...</button>
        </div>
      </div>
    </div>
  )
}

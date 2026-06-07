import { useEffect, useRef, useState } from 'react'
import { deleteDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignCollectionRef, campaignDocRef } from '../campaign/firestorePaths'
import type {
  SessionCalendarEntry,
  SessionNote,
  SessionNoteGeneratedSnapshot,
  SessionNpcMention,
  SessionScene,
} from '../../types/app'
import { sortSessionNotes } from './sessionNoteSort'
import { getResolvedSessionNumber, sanitizeSessionTitle } from './sessionNoteUtils'

function timestampToMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()

  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number }
    if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis()
    if (typeof maybeTimestamp.seconds === 'number') return maybeTimestamp.seconds * 1000
  }

  return 0
}

const normalizeScenes = (value: unknown): SessionScene[] => {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      name: typeof source.name === 'string' ? source.name : '',
      summary: typeof source.summary === 'string' ? source.summary : '',
      details: Array.isArray(source.details)
        ? source.details.filter((d): d is string => typeof d === 'string')
        : [],
    }
  })
}

const normalizeNpcMentions = (value: unknown): SessionNpcMention[] => {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      npcKey: typeof source.npcKey === 'string' ? source.npcKey : '',
      name: typeof source.name === 'string' ? source.name : '',
      title: typeof source.title === 'string' ? source.title : '',
      action: source.action === 'new' || source.action === 'update' ? source.action : 'new',
      facts: Array.isArray(source.facts)
        ? source.facts.filter((f): f is string => typeof f === 'string')
        : [],
      linkedNpcId: typeof source.linkedNpcId === 'string' ? source.linkedNpcId : null,
    }
  })
}

const normalizeCalendar = (value: unknown): SessionCalendarEntry[] => {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      key: typeof source.key === 'string' ? source.key : '',
      action: source.action === 'new' || source.action === 'update' ? source.action : 'new',
      label: typeof source.label === 'string' ? source.label : '',
      dayComplete: source.dayComplete === true,
      entries: Array.isArray(source.entries)
        ? source.entries.filter((e): e is string => typeof e === 'string')
        : [],
    }
  })
}

const normalizeSessionNote = (id: string, data: Record<string, unknown>): SessionNote => {
  const rawTitle = typeof data.title === 'string' ? data.title : ''
  const sessionNumber = getResolvedSessionNumber({
    title: rawTitle,
    sessionNumber: typeof data.sessionNumber === 'number' ? data.sessionNumber : null,
  })

  return ({
  generatedSnapshot: (() => {
    const raw = data.generatedSnapshot
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const snapshot = raw as Record<string, unknown>
    const normalized: SessionNoteGeneratedSnapshot = {
      title: typeof snapshot.title === 'string' ? snapshot.title : '',
      summaryMarkdown: typeof snapshot.summaryMarkdown === 'string' ? snapshot.summaryMarkdown : '',
      overallSummary: typeof snapshot.overallSummary === 'string' ? snapshot.overallSummary : '',
      scenes: normalizeScenes(snapshot.scenes),
      npcMentions: normalizeNpcMentions(snapshot.npcMentions),
      cliffhangers: Array.isArray(snapshot.cliffhangers)
        ? snapshot.cliffhangers.filter((c): c is string => typeof c === 'string')
        : [],
      calendar: normalizeCalendar(snapshot.calendar),
    }
    return normalized
  })(),
  hasHumanEdits: data.hasHumanEdits === true,
  editedAt: data.editedAt ?? null,
  editedBy: typeof data.editedBy === 'string' ? data.editedBy : null,
  id,
  title: sanitizeSessionTitle(rawTitle, sessionNumber),
  sessionNumber,
  sourceType: data.sourceType === 'api' || data.sourceType === 'manual' ? data.sourceType : 'manual',
  createdAt: data.createdAt ?? null,
  updatedAt: data.updatedAt ?? null,
  summaryMarkdown: typeof data.summaryMarkdown === 'string' ? data.summaryMarkdown : '',
  overallSummary: typeof data.overallSummary === 'string' ? data.overallSummary : '',
  scenes: normalizeScenes(data.scenes),
  npcMentions: normalizeNpcMentions(data.npcMentions),
  cliffhangers: Array.isArray(data.cliffhangers)
    ? data.cliffhangers.filter((c): c is string => typeof c === 'string')
    : [],
  calendar: normalizeCalendar(data.calendar),
  })
}

const getNextSessionNumber = (notes: SessionNote[]): number => {
  const maxSessionNumber = notes.reduce((max, note) => {
    const sessionNumber = getResolvedSessionNumber(note)
    return sessionNumber != null && sessionNumber > max ? sessionNumber : max
  }, 0)

  return maxSessionNumber + 1
}

const backfillMissingSessionNumbers = (notes: SessionNote[]) => {
  const chronological = [...notes].sort((a, b) => {
    const createdDelta = timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt)
    if (createdDelta !== 0) return createdDelta

    const updatedDelta = timestampToMillis(a.updatedAt) - timestampToMillis(b.updatedAt)
    if (updatedDelta !== 0) return updatedDelta

    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  })

  const assigned = new Set<number>()
  chronological.forEach((note) => {
    const sessionNumber = getResolvedSessionNumber(note)
    if (sessionNumber != null) assigned.add(sessionNumber)
  })

  let nextSessionNumber = 1
  const updates = new Map<string, SessionNote>()

  chronological.forEach((note) => {
    if (getResolvedSessionNumber(note) != null) {
      updates.set(note.id, note)
      return
    }

    while (assigned.has(nextSessionNumber)) nextSessionNumber += 1
    assigned.add(nextSessionNumber)

    updates.set(note.id, {
      ...note,
      sessionNumber: nextSessionNumber,
      title: sanitizeSessionTitle(note.title, nextSessionNumber),
    })
    nextSessionNumber += 1
  })

  return notes.map((note) => updates.get(note.id) ?? note)
}

export function useSessionNotes(campaignId: string, enabled = true, groupId: string) {
  const [notes, setNotes] = useState<SessionNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const notesRef = useRef<SessionNote[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    if (!campaignId || !enabled) {
      setNotes([])
      setNotesLoading(false)
      return
    }
    setNotesLoading(true)

    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'sessionSummaries'),
      (snap) => {
        const all = snap.docs.map((docSnap) => {
          if (pendingWritesRef.current[docSnap.id]) {
            const local = notesRef.current.find((n) => n.id === docSnap.id)
            if (local) return local
          }
          const data = docSnap.data() as Record<string, unknown>
          return normalizeSessionNote(docSnap.id, data)
        })
        const normalizedNotes = backfillMissingSessionNumbers(all)
        setNotes(sortSessionNotes(normalizedNotes))
        normalizedNotes.forEach((note) => {
          const original = all.find((entry) => entry.id === note.id)
          if (!original || original.sessionNumber != null || note.sessionNumber == null) return

          void setDoc(
            campaignDocRef(db, { campaignId, groupId }, 'sessionSummaries', note.id),
            { sessionNumber: note.sessionNumber, title: note.title },
            { merge: true },
          ).catch((error) => {
            console.error('Failed to backfill session number', { noteId: note.id, error })
          })
        })
        setNotesLoading(false)
      },
      (error) => {
        console.error('useSessionNotes snapshot error', error)
        setNotesLoading(false)
      },
    )

    return () => unsub()
  }, [campaignId, enabled, groupId])

  useEffect(() => {
    return () => {
      Object.values(pendingWritesRef.current).forEach((timer) => clearTimeout(timer))
      pendingWritesRef.current = {}
    }
  }, [])

  const scheduleWrite = (noteId: string) => {
    if (!campaignId) return
    const existing = pendingWritesRef.current[noteId]
    if (existing) clearTimeout(existing)

    pendingWritesRef.current[noteId] = setTimeout(() => {
      delete pendingWritesRef.current[noteId]
      const note = notesRef.current.find((n) => n.id === noteId)
      if (!note) return

      const { id, ...data } = note
      void setDoc(
        campaignDocRef(db, { campaignId, groupId }, 'sessionSummaries', id),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((error) => {
        console.error('Failed to update session note', { noteId: id, error })
      })
    }, 500)
  }

  const addNote = (note: SessionNote) => {
    const normalizedNote = {
      ...note,
      sessionNumber: note.sessionNumber ?? getNextSessionNumber(notesRef.current),
      title: sanitizeSessionTitle(note.title, note.sessionNumber ?? getNextSessionNumber(notesRef.current)),
    }

    setNotes((current) => sortSessionNotes([normalizedNote, ...current]))
    if (!campaignId) return
    const { id, ...data } = normalizedNote
    void setDoc(
      campaignDocRef(db, { campaignId, groupId }, 'sessionSummaries', id),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    ).catch((error) => {
      console.error('Failed to create session note', { noteId: id, error })
    })
  }

  const updateNote = (noteId: string, patch: Partial<SessionNote>) => {
    setNotes((current) => {
      const currentNote = current.find((note) => note.id === noteId)
      const nextSessionNumber = patch.sessionNumber
        ?? currentNote?.sessionNumber
        ?? getResolvedSessionNumber({ title: patch.title ?? currentNote?.title ?? '', sessionNumber: null })
        ?? null
      const normalizedPatch = {
        ...patch,
        title: patch.title == null ? currentNote?.title ?? '' : sanitizeSessionTitle(patch.title, nextSessionNumber),
        sessionNumber: nextSessionNumber,
      }

      return sortSessionNotes(current.map((note) => (note.id === noteId ? { ...note, ...normalizedPatch } : note)))
    })
    scheduleWrite(noteId)
  }

  const deleteNote = (noteId: string) => {
    if (!campaignId) return
    const pending = pendingWritesRef.current[noteId]
    if (pending) {
      clearTimeout(pending)
      delete pendingWritesRef.current[noteId]
    }
    setNotes((current) => current.filter((note) => note.id !== noteId))
    void deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'sessionSummaries', noteId)).catch((error) => {
      console.error('Failed to delete session note', { noteId, error })
    })
  }

  return { notes, notesLoading, addNote, updateNote, deleteNote }
}

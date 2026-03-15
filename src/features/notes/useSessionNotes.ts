import { useEffect, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { SessionCalendarEntry, SessionNote, SessionNpcMention, SessionScene } from '../../types/app'

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

const normalizeSessionNote = (id: string, data: Record<string, unknown>): SessionNote => ({
  id,
  title: typeof data.title === 'string' ? data.title : '',
  sessionNumber: typeof data.sessionNumber === 'number' ? data.sessionNumber : null,
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

export function useSessionNotes(campaignId: string) {
  const [notes, setNotes] = useState<SessionNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const notesRef = useRef<SessionNote[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    if (!campaignId) return
    setNotesLoading(true)

    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'sessionSummaries'),
      (snap) => {
        const all = snap.docs.map((docSnap) => {
          if (pendingWritesRef.current[docSnap.id]) {
            const local = notesRef.current.find((n) => n.id === docSnap.id)
            if (local) return local
          }
          const data = docSnap.data() as Record<string, unknown>
          return normalizeSessionNote(docSnap.id, data)
        })
        all.sort((a, b) => (b.sessionNumber ?? -1) - (a.sessionNumber ?? -1))
        setNotes(all)
        setNotesLoading(false)
      },
      (error) => {
        console.error('useSessionNotes snapshot error', error)
        setNotesLoading(false)
      },
    )

    return () => unsub()
  }, [campaignId])

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
        doc(db, 'campaigns', campaignId, 'sessionSummaries', id),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((error) => {
        console.error('Failed to update session note', { noteId: id, error })
      })
    }, 500)
  }

  const addNote = (note: SessionNote) => {
    setNotes((current) => [note, ...current])
    if (!campaignId) return
    const { id, ...data } = note
    void setDoc(
      doc(db, 'campaigns', campaignId, 'sessionSummaries', id),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    ).catch((error) => {
      console.error('Failed to create session note', { noteId: id, error })
    })
  }

  const updateNote = (noteId: string, patch: Partial<SessionNote>) => {
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...patch } : note)),
    )
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
    void deleteDoc(doc(db, 'campaigns', campaignId, 'sessionSummaries', noteId)).catch((error) => {
      console.error('Failed to delete session note', { noteId, error })
    })
  }

  return { notes, notesLoading, addNote, updateNote, deleteNote }
}

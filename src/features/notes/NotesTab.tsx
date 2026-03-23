import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, FileText, Plus, Trash2 } from 'lucide-react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import type { NpcRecord, Role } from '../../types/app'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useSessionNotes } from './useSessionNotes'
import { SessionNoteDetail } from './SessionNoteDetail'
import { SessionNoteImporter } from './SessionNoteImporter'

type NotesTabProps = {
  campaignId: string
  role: Role | null
}

export function NotesTab({ campaignId, role }: NotesTabProps) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const { notes, notesLoading, addNote, updateNote, deleteNote } = useSessionNotes(campaignId)
  const [selectedNoteId, setSelectedNoteId] = useState('')
  const [importerOpen, setImporterOpen] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null)
  const [npcs, setNpcs] = useState<NpcRecord[]>([])

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setMobileView('list')
    }
    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  // Load NPCs only when importer is open (for auto-matching)
  useEffect(() => {
    if (!importerOpen) return
    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'npcs'),
      (snap) => {
        setNpcs(
          snap.docs.map((docSnap) => {
            const data = docSnap.data() as Partial<NpcRecord>
            return {
              id: docSnap.id,
              name: typeof data.name === 'string' ? data.name : '',
              title: typeof data.title === 'string' ? data.title : '',
              visibleToPlayers: data.visibleToPlayers === true,
              tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
              portraitPath: typeof data.portraitPath === 'string' ? data.portraitPath : '',
              portraitUrl: null,
              portraitFocusX: 50,
              portraitFocusY: 50,
              tokenIcon: { icon: 'pawn' as const, color: '#2f5bbf', size: 34 },
              playerDescription: '',
              playerNotes: '',
            }
          }),
        )
      },
      (error) => {
        console.error('Failed to load NPCs for importer', error)
      },
    )
    return () => unsub()
  }, [campaignId, importerOpen])

  useEffect(() => {
    setSelectedNoteId((current) => {
      if (notes.length === 0) return ''
      return notes.some((n) => n.id === current) ? current : notes[0].id
    })
  }, [notes])

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  )

  const selectNote = (noteId: string) => {
    setSelectedNoteId(noteId)
    if (isMobile) setMobileView('detail')
  }

  const handleDelete = () => {
    if (!deleteCandidate) return
    deleteNote(deleteCandidate)
    setDeleteCandidate(null)
  }

  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'

  return (
    <div className="maps-layout monsters-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar characters-sidebar">
          <div className="maps-sidebar-header">
            <h2>Sessions</h2>
            {role === 'gm' ? (
              <button
                type="button"
                className="monster-add-btn"
                onClick={() => setImporterOpen(true)}
                aria-label="Import session notes"
              >
                <Plus size={16} />
              </button>
            ) : null}
          </div>
          {notesLoading ? (
            <p className="map-npc-scene-empty">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="map-npc-scene-empty">No session notes yet.</p>
          ) : (
            <div className="monster-list-grid character-list-grid">
              {notes.map((note) => (
                <div key={note.id} className={note.id === selectedNoteId ? 'map-row active' : 'map-row'}>
                  <div
                    className="map-select"
                    role="button"
                    tabIndex={0}
                    onClick={() => selectNote(note.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectNote(note.id)
                      }
                    }}
                  >
                    <div className="map-thumb-column">
                      <div className="map-thumb-wrap">
                        <div className="monster-portrait-empty small">
                          <FileText size={14} />
                        </div>
                      </div>
                    </div>
                    <div className="map-meta">
                      <strong>{note.title || 'Untitled'}</strong>
                      <p className="monster-card-statline">
                        {note.sessionNumber != null ? `Session ${note.sessionNumber}` : 'No session number'}
                      </p>
                    </div>
                  </div>
                  {role === 'gm' ? (
                    <button
                      type="button"
                      className="map-delete-btn character-card-delete-btn"
                      onClick={() => setDeleteCandidate(note.id)}
                      aria-label={`Delete ${note.title || 'session note'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </aside>
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail">
          <div className="monsters-detail-inner">
            {isMobile ? (
              <div className="monster-detail-header-row">
                <button type="button" className="back-link monster-mobile-back" onClick={() => setMobileView('list')}>
                  <ChevronLeft size={16} />
                </button>
              </div>
            ) : null}
            {!selectedNote ? (
              <p className="map-npc-scene-empty">Select a session from the list.</p>
            ) : (
              <SessionNoteDetail note={selectedNote} role={role} onUpdate={updateNote} />
            )}
          </div>
        </div>
      ) : null}

      {importerOpen ? (
        <SessionNoteImporter
          npcs={npcs}
          onImport={(note) => {
            addNote(note)
            setImporterOpen(false)
            setSelectedNoteId(note.id)
            if (isMobile) setMobileView('detail')
          }}
          onClose={() => setImporterOpen(false)}
        />
      ) : null}

      {deleteCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>Delete Session Notes</h3>
            <p>Delete <strong>{notes.find((n) => n.id === deleteCandidate)?.title || 'this session'}</strong>?</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-danger" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button type="button" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

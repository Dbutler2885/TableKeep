import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Circle, Plus, Search, Tag, Trash2, UserRound, X } from 'lucide-react'
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../../firebase'
import type { NpcPrivateRecord, NpcRecord, Role } from '../../types/app'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { RichTextEditor } from '../common/RichTextEditor'
import { MOBILE_BREAKPOINT } from '../../constants/layout'

type NpcsTabProps = {
  campaignId: string
  role: Role | null
}

const defaultTokenIcon = {
  icon: 'pawn' as const,
  color: '#2f5bbf',
  size: 34,
}

const makeNpc = (): NpcRecord => ({
  id: crypto.randomUUID(),
  name: 'New NPC',
  title: '',
  visibleToPlayers: false,
  tags: [],
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultTokenIcon,
  playerDescription: '',
  playerNotes: '',
})

export function NpcsTab({ campaignId, role }: NpcsTabProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [npcs, setNpcs] = useState<NpcRecord[]>([])
  const [privateNotesById, setPrivateNotesById] = useState<Record<string, string>>({})
  const npcsRef = useRef<NpcRecord[]>([])
  const privateNotesRef = useRef<Record<string, string>>({})
  const pendingNpcWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPrivateWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPlayerNotesWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [selectedNpcId, setSelectedNpcId] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<NpcRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [tagsModalOpen, setTagsModalOpen] = useState(false)
  const [tagSelection, setTagSelection] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [tagFilterSearch, setTagFilterSearch] = useState('')

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

  useEffect(() => {
    npcsRef.current = npcs
  }, [npcs])

  useEffect(() => {
    privateNotesRef.current = privateNotesById
  }, [privateNotesById])

  useEffect(() => {
    return () => {
      Object.values(pendingNpcWritesRef.current).forEach((timer) => clearTimeout(timer))
      Object.values(pendingPrivateWritesRef.current).forEach((timer) => clearTimeout(timer))
      Object.values(pendingPlayerNotesWritesRef.current).forEach((timer) => clearTimeout(timer))
      pendingNpcWritesRef.current = {}
      pendingPrivateWritesRef.current = {}
      pendingPlayerNotesWritesRef.current = {}
    }
  }, [])

  useEffect(() => {
    const npcsCollection = collection(db, 'campaigns', campaignId, 'npcs')
    const npcsQuery = role === 'gm'
      ? query(npcsCollection)
      : query(npcsCollection, where('visibleToPlayers', '==', true))
    const unsub = onSnapshot(npcsQuery, (snap) => {
      const next = snap.docs
        .map((docSnap) => {
          if (pendingNpcWritesRef.current[docSnap.id] || pendingPlayerNotesWritesRef.current[docSnap.id]) {
            const local = npcsRef.current.find((npc) => npc.id === docSnap.id)
            if (local) return local
          }
          const data = docSnap.data() as Partial<NpcRecord>
          return {
            id: docSnap.id,
            name: typeof data.name === 'string' ? data.name : 'Unnamed NPC',
            title: typeof data.title === 'string' ? data.title : '',
            visibleToPlayers: data.visibleToPlayers === true,
            tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            portraitUrl: typeof data.portraitUrl === 'string' ? data.portraitUrl : null,
            portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
            portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
            tokenIcon: data.tokenIcon ?? defaultTokenIcon,
            playerDescription: typeof data.playerDescription === 'string' ? data.playerDescription : '',
            playerNotes: typeof data.playerNotes === 'string' ? data.playerNotes : '',
          } satisfies NpcRecord
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      setNpcs(next)
    })
    return () => unsub()
  }, [campaignId, role])

  useEffect(() => {
    if (role !== 'gm') {
      setPrivateNotesById({})
      return
    }
    const unsub = onSnapshot(collection(db, 'campaigns', campaignId, 'npcPrivate'), (snap) => {
      setPrivateNotesById(
        snap.docs.reduce<Record<string, string>>((acc, docSnap) => {
          if (pendingPrivateWritesRef.current[docSnap.id]) {
            acc[docSnap.id] = privateNotesRef.current[docSnap.id] ?? ''
            return acc
          }
          const data = docSnap.data() as Partial<NpcPrivateRecord>
          acc[docSnap.id] = typeof data.gmNotes === 'string' ? data.gmNotes : ''
          return acc
        }, {}),
      )
    })
    return () => unsub()
  }, [campaignId, role])

  useEffect(() => {
    setSelectedNpcId((current) => {
      if (npcs.length === 0) return ''
      return npcs.some((npc) => npc.id === current) ? current : npcs[0].id
    })
  }, [npcs])

  const selectedNpc = useMemo(
    () => npcs.find((npc) => npc.id === selectedNpcId) ?? null,
    [npcs, selectedNpcId],
  )

  useEffect(() => {
    if (!tagsModalOpen) return
    setTagSelection(selectedNpc?.tags ?? [])
    setNewTagInput('')
    setTagSearch('')
  }, [tagsModalOpen, selectedNpc])

  const scheduleNpcWrite = (npcId: string) => {
    const existing = pendingNpcWritesRef.current[npcId]
    if (existing) clearTimeout(existing)
    pendingNpcWritesRef.current[npcId] = setTimeout(() => {
      delete pendingNpcWritesRef.current[npcId]
      const npc = npcsRef.current.find((entry) => entry.id === npcId)
      if (!npc) return
      const { id, ...data } = npc
      void setDoc(doc(db, 'campaigns', campaignId, 'npcs', id), {
        ...data,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    }, 500)
  }

  const schedulePrivateWrite = (npcId: string) => {
    const existing = pendingPrivateWritesRef.current[npcId]
    if (existing) clearTimeout(existing)
    pendingPrivateWritesRef.current[npcId] = setTimeout(() => {
      delete pendingPrivateWritesRef.current[npcId]
      void setDoc(doc(db, 'campaigns', campaignId, 'npcPrivate', npcId), {
        id: npcId,
        gmNotes: privateNotesRef.current[npcId] ?? '',
        updatedAt: serverTimestamp(),
      }, { merge: true })
    }, 500)
  }

  const schedulePlayerNotesWrite = (npcId: string) => {
    const existing = pendingPlayerNotesWritesRef.current[npcId]
    if (existing) clearTimeout(existing)
    pendingPlayerNotesWritesRef.current[npcId] = setTimeout(() => {
      delete pendingPlayerNotesWritesRef.current[npcId]
      const npc = npcsRef.current.find((entry) => entry.id === npcId)
      if (!npc) return
      void setDoc(doc(db, 'campaigns', campaignId, 'npcs', npcId), {
        playerNotes: npc.playerNotes,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    }, 500)
  }

  const updateNpc = (npcId: string, updates: Partial<Omit<NpcRecord, 'id'>>) => {
    if (role !== 'gm') return
    setNpcs((current) => current.map((npc) => (npc.id === npcId ? { ...npc, ...updates } : npc)))
    scheduleNpcWrite(npcId)
  }

  const updateSelectedNpc = (updates: Partial<Omit<NpcRecord, 'id'>>) => {
    if (!selectedNpc) return
    updateNpc(selectedNpc.id, updates)
  }

  const updatePlayerNotes = (npcId: string, value: string) => {
    if (role !== 'player') return
    setNpcs((current) => current.map((npc) => (npc.id === npcId ? { ...npc, playerNotes: value } : npc)))
    schedulePlayerNotesWrite(npcId)
  }

  const updateGmNotes = (npcId: string, value: string) => {
    if (role !== 'gm') return
    setPrivateNotesById((current) => ({ ...current, [npcId]: value }))
    schedulePrivateWrite(npcId)
  }

  const addNpc = async () => {
    if (role !== 'gm') return
    const next = makeNpc()
    await setDoc(doc(db, 'campaigns', campaignId, 'npcs', next.id), {
      ...next,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'campaigns', campaignId, 'npcPrivate', next.id), {
      id: next.id,
      gmNotes: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setSelectedNpcId(next.id)
    if (isMobile) setMobileView('detail')
  }

  const deleteNpc = async () => {
    if (!deleteCandidate || role !== 'gm') return
    const npcId = deleteCandidate.id
    const publicPending = pendingNpcWritesRef.current[npcId]
    if (publicPending) {
      clearTimeout(publicPending)
      delete pendingNpcWritesRef.current[npcId]
    }
    const privatePending = pendingPrivateWritesRef.current[npcId]
    if (privatePending) {
      clearTimeout(privatePending)
      delete pendingPrivateWritesRef.current[npcId]
    }
    await deleteDoc(doc(db, 'campaigns', campaignId, 'npcs', npcId))
    await deleteDoc(doc(db, 'campaigns', campaignId, 'npcPrivate', npcId))
    setDeleteCandidate(null)
  }

  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'
  const gmNotes = selectedNpc ? (privateNotesById[selectedNpc.id] ?? '') : ''
  const allTags = useMemo(
    () => Array.from(new Set(npcs.flatMap((npc) => npc.tags))).sort((a, b) => a.localeCompare(b)),
    [npcs],
  )
  const visibleNpcs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = npcs.filter((npc) => {
      if (role !== 'gm' && !npc.visibleToPlayers) return false
      if (tagFilter !== 'all' && !npc.tags.includes(tagFilter)) return false
      if (!query) return true
      const haystack = [npc.name, npc.title, npc.tags.join(' ')].join(' ').toLowerCase()
      return haystack.includes(query)
    })
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }, [npcs, role, searchQuery, tagFilter])
  const groupedNpcs = useMemo(() => {
    if (role !== 'gm') return [{ key: 'all', label: '', items: visibleNpcs }]
    return [
      { key: 'shown', label: 'Shown to Players', items: visibleNpcs.filter((npc) => npc.visibleToPlayers) },
      { key: 'hidden', label: 'GM Only', items: visibleNpcs.filter((npc) => !npc.visibleToPlayers) },
    ].filter((group) => group.items.length > 0)
  }, [role, visibleNpcs])
  const tagsInUse = useMemo(() => {
    const used = new Set<string>()
    visibleNpcs.forEach((npc) => npc.tags.forEach((tag) => used.add(tag)))
    return allTags.filter((tag) => used.has(tag))
  }, [allTags, visibleNpcs])

  const selectNpc = async (npcId: string) => {
    if (npcId === selectedNpcId) return
    setSelectedNpcId(npcId)
    if (isMobile) setMobileView('detail')
  }

  const addTagToSelection = (tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed || tagSelection.includes(trimmed)) return
    setTagSelection((current) => [...current, trimmed])
  }

  const removeTagFromSelection = (tag: string) => {
    setTagSelection((current) => current.filter((entry) => entry !== tag))
  }

  const saveTags = async () => {
    if (role !== 'gm' || !selectedNpc) return
    const nextTags = Array.from(new Set(tagSelection.map((tag) => tag.trim().toLowerCase()).filter(Boolean)))
    if (nextTags.join('|') !== selectedNpc.tags.join('|')) {
      await updateSelectedNpc({ tags: nextTags })
    }
    setTagsModalOpen(false)
  }

  return (
    <div className="maps-layout monsters-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar characters-sidebar">
          <div className="maps-sidebar-header">
            <h2>NPCs</h2>
            {role === 'gm' ? (
              <button
                type="button"
                className="monster-add-btn"
                onClick={() => void addNpc()}
                aria-label="Add NPC"
              >
                <Plus size={16} />
              </button>
            ) : null}
          </div>
          <div className="npc-filter-bar">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search NPCs"
              aria-label="Search NPCs"
            />
            <div className="npc-tag-filter-wrapper">
              <Tag size={16} className="npc-tag-filter-icon" />
              <button
                type="button"
                className="npc-tag-filter-trigger"
                onClick={() => {
                  setTagFilterOpen((open) => !open)
                  setTagFilterSearch('')
                }}
              >
                {tagFilter === 'all' ? 'All tags' : tagFilter}
              </button>
              {tagFilterOpen ? (
                <>
                  <div className="npc-tag-filter-menu">
                    <div className="npc-tag-filter-search">
                      <Search size={14} />
                      <input
                        type="text"
                        value={tagFilterSearch}
                        onChange={(event) => setTagFilterSearch(event.target.value)}
                        placeholder="Search tags"
                      />
                    </div>
                    <div className="npc-tag-filter-options">
                      {!tagFilterSearch.trim() ? (
                        <button
                          type="button"
                          className={tagFilter === 'all' ? 'npc-tag-filter-option active' : 'npc-tag-filter-option'}
                          onClick={() => {
                            setTagFilter('all')
                            setTagFilterOpen(false)
                          }}
                        >
                          All tags
                        </button>
                      ) : null}
                      {tagsInUse
                        .filter((tag) => !tagFilterSearch.trim() || tag.includes(tagFilterSearch.trim().toLowerCase()))
                        .map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={tagFilter === tag ? 'npc-tag-filter-option active' : 'npc-tag-filter-option'}
                            onClick={() => {
                              setTagFilter(tag)
                              setTagFilterOpen(false)
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                      {tagFilterSearch.trim() && tagsInUse.filter((tag) => tag.includes(tagFilterSearch.trim().toLowerCase())).length === 0 ? (
                        <div className="npc-tag-filter-empty">No matching tags</div>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className="npc-tag-filter-backdrop"
                    onClick={() => setTagFilterOpen(false)}
                  />
                </>
              ) : null}
            </div>
          </div>
          {visibleNpcs.length === 0 ? <p>No NPCs match the current filters.</p> : null}
          <div className="monster-list-grid character-list-grid">
            {groupedNpcs.map((group) => (
              <div key={group.key} className="npc-group-block">
                {group.label ? <p className="npc-group-label">{group.label}</p> : null}
                {group.items.map((npc) => (
              <div key={npc.id} className={npc.id === selectedNpcId ? 'map-row active' : 'map-row'}>
                <div
                  className="map-select"
                  role="button"
                  tabIndex={0}
                  onClick={() => { void selectNpc(npc.id) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void selectNpc(npc.id)
                    }
                  }}
                >
                  <div className="map-thumb-column">
                    <div className="map-thumb-wrap">
                    {npc.portraitUrl ? (
                      <img
                        src={npc.portraitUrl}
                        alt={`${npc.name} portrait`}
                        className="map-thumb"
                        style={{ objectPosition: `${npc.portraitFocusX}% 0%` }}
                      />
                    ) : (
                      <div className="monster-portrait-empty small">
                        <UserRound size={14} />
                      </div>
                    )}
                    </div>
                    {role === 'gm' ? (
                      <button
                        type="button"
                        className={npc.visibleToPlayers ? 'map-visibility-btn on' : 'map-visibility-btn'}
                        onClick={(event) => {
                          event.stopPropagation()
                          updateNpc(npc.id, { visibleToPlayers: !npc.visibleToPlayers })
                        }}
                        aria-label={npc.visibleToPlayers ? 'Visible to players' : 'Hidden from players'}
                      >
                        {npc.visibleToPlayers ? <Check size={14} /> : <Circle size={14} />}
                      </button>
                    ) : null}
                  </div>
                  <div className="map-meta">
                    <strong>{npc.name || 'Unnamed NPC'}</strong>
                    <p className="monster-card-statline">{npc.title || 'No title'}</p>
                    {role === 'gm' && npc.tags.length > 0 ? (
                      <div className="item-faction-tag-list">
                        {npc.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="item-tag">{tag}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                {role === 'gm' ? (
                  <button
                    type="button"
                    className="map-delete-btn character-card-delete-btn"
                    onClick={() => setDeleteCandidate(npc)}
                    aria-label={`Delete ${npc.name || 'NPC'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
                ))}
              </div>
            ))}
          </div>
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
            {!selectedNpc ? (
              <p>Select an NPC from the list.</p>
            ) : (
              <div className="monster-editor-grid character-editor-grid">
                <section className="monster-section-block">
                  <div className="character-sheet-header-grid">
                    <label className="character-header-field character-header-field-name">
                      <span className="character-header-tag">Name</span>
                      <input
                        type="text"
                        value={selectedNpc.name}
                        onChange={(event) => updateSelectedNpc({ name: event.target.value })}
                        disabled={role !== 'gm'}
                      />
                    </label>
                    <label className="character-header-field character-header-field-title">
                      <span className="character-header-tag">Title</span>
                      <input
                        type="text"
                        value={selectedNpc.title}
                        onChange={(event) => updateSelectedNpc({ title: event.target.value })}
                        disabled={role !== 'gm'}
                      />
                    </label>
                  {role === 'gm' ? (
                    <label className="character-header-field character-header-field-align">
                      <span className="character-header-tag">Players</span>
                      <select
                        value={selectedNpc.visibleToPlayers ? 'shown' : 'hidden'}
                        onChange={(event) => updateSelectedNpc({ visibleToPlayers: event.target.value === 'shown' })}
                      >
                        <option value="hidden">Hidden</option>
                        <option value="shown">Shown</option>
                      </select>
                    </label>
                  ) : null}
                  {role === 'gm' ? (
                    <div className="character-header-field character-header-field-title">
                      <div className="npc-tag-summary-row">
                        <button type="button" className="map-edit-btn" onClick={() => setTagsModalOpen(true)} aria-label="Manage tags">
                          <Tag size={16} />
                        </button>
                        {selectedNpc.tags.length > 0 ? (
                          <div className="item-faction-tag-list">
                            {selectedNpc.tags.map((tag) => (
                              <span key={tag} className="item-tag">{tag}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="map-npc-scene-empty">No tags yet.</p>
                        )}
                      </div>
                    </div>
                  ) : selectedNpc.tags.length > 0 ? (
                    <div className="character-header-field character-header-field-title">
                      <span className="character-header-tag">Tags</span>
                      <div className="item-faction-tag-list">
                        {selectedNpc.tags.map((tag) => (
                          <span key={tag} className="item-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

                <section className="monster-section-block">
                  <h3 className="monster-section-title">Portrait</h3>
                  <div className="character-media-wrap">
                    <EntityMediaEditor
                      entityName={selectedNpc.name || 'npc'}
                      portraitUrl={selectedNpc.portraitUrl}
                      portraitFocusX={selectedNpc.portraitFocusX}
                      portraitFocusY={selectedNpc.portraitFocusY}
                      tokenIcon={selectedNpc.tokenIcon}
                      onChange={(updates) => void updateSelectedNpc(updates)}
                      portraitAltLabel="NPC portrait"
                      tokenButtonAriaLabel="Edit NPC token icon"
                      removePortraitMessage="Remove the portrait image from this NPC?"
                    />
                  </div>
                </section>

                <section className="monster-section-block">
                  <h3 className="monster-section-title">Player Description</h3>
                  <textarea
                    className="monster-notes"
                    value={selectedNpc.playerDescription}
                    onChange={(event) => updateSelectedNpc({ playerDescription: event.target.value })}
                    placeholder="Short player-facing description"
                    disabled={role !== 'gm'}
                  />
                </section>

                <section className="monster-section-block">
                  <h3 className="monster-section-title">Player Notes</h3>
                  <RichTextEditor
                    value={selectedNpc.playerNotes}
                    onChange={(value) => {
                      if (role === 'gm') {
                        updateSelectedNpc({ playerNotes: value })
                        return
                      }
                      updatePlayerNotes(selectedNpc.id, value)
                    }}
                    placeholder="Player-facing notes"
                    editable={role === 'gm' || role === 'player'}
                  />
                </section>

                {role === 'gm' ? (
                  <section className="monster-section-block">
                    <h3 className="monster-section-title">GM Notes</h3>
                    <RichTextEditor
                      value={gmNotes}
                      onChange={(value) => updateGmNotes(selectedNpc.id, value)}
                      placeholder="Private GM notes"
                      editable
                    />
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>Delete NPC</h3>
            <p>Delete <strong>{deleteCandidate.name || 'this NPC'}</strong>?</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-danger" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button type="button" onClick={() => void deleteNpc()}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
      {tagsModalOpen && selectedNpc ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => void saveTags()}>
          <div className="confirm-modal npc-tag-modal" onClick={(event) => event.stopPropagation()}>
            <div className="npc-tag-modal-header">
              <div className="npc-tag-modal-title">
                <Tag size={18} />
                <h3>Manage Tags</h3>
              </div>
              <button type="button" className="map-edit-btn" onClick={() => setTagsModalOpen(false)} aria-label="Close tags">
                <X size={16} />
              </button>
            </div>
            <p className="npc-tag-modal-subtitle">{selectedNpc.name || 'NPC'}</p>

            <section className="npc-tag-modal-section">
              <h4>Current Tags</h4>
              <div className="item-faction-tag-list">
                {tagSelection.length > 0 ? tagSelection.map((tag) => (
                  <button key={tag} type="button" className="npc-tag-chip selected" onClick={() => removeTagFromSelection(tag)}>
                    <span>{tag}</span>
                    <X size={12} />
                  </button>
                )) : <p className="map-npc-scene-empty">No tags selected.</p>}
              </div>
            </section>

            <section className="npc-tag-modal-section">
              <h4>Create Tag</h4>
              <div className="npc-tag-input-row">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(event) => setNewTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTagToSelection(newTagInput)
                      setNewTagInput('')
                    }
                  }}
                  placeholder="merchant"
                />
                <button
                  type="button"
                  className="monster-example-btn"
                  onClick={() => {
                    addTagToSelection(newTagInput)
                    setNewTagInput('')
                  }}
                  disabled={!newTagInput.trim()}
                >
                  <Plus size={14} />
                </button>
              </div>
            </section>

            {allTags.length > 0 ? (
              <section className="npc-tag-modal-section">
                <h4>Available Tags</h4>
                <div className="npc-tag-search-row">
                  <Search size={14} />
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(event) => setTagSearch(event.target.value)}
                    placeholder="Search tags"
                  />
                </div>
                <div className="item-faction-tag-list">
                  {allTags
                    .filter((tag) => !tagSelection.includes(tag))
                    .filter((tag) => !tagSearch.trim() || tag.includes(tagSearch.trim().toLowerCase()))
                    .map((tag) => (
                      <button key={tag} type="button" className="npc-tag-chip" onClick={() => addTagToSelection(tag)}>
                        <span>{tag}</span>
                        <Plus size={12} />
                      </button>
                    ))}
                </div>
              </section>
            ) : null}

            <div className="confirm-actions">
              <button type="button" onClick={() => setTagsModalOpen(false)}>Cancel</button>
              <button type="button" onClick={() => void saveTags()}>
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

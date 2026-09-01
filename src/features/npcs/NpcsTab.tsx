import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Circle, Plus, Search, Tag, Trash2, UserRound, X } from 'lucide-react'
import { deleteDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../../firebase'
import type { NpcPrivateRecord, NpcRecord, Role, TokenIconConfig } from '../../types/app'
import { campaignCollectionRef, campaignDocRef } from '../campaign/firestorePaths'
import { entityMediaForPersistence, isRenderableImageUrl, resolveStoragePathUrl, uploadEntityImage } from '../common/mediaStorage'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useSessionNotes } from '../notes/useSessionNotes'
import { NpcDetailEditor } from './NpcDetailEditor'
import { buildAutoNotesForNpc } from './npcAutoNotes'

type NpcsTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
}

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn' as const,
  color: '#2f5bbf',
  size: 34,
}

const byOrder = (a: NpcRecord, b: NpcRecord) => {
  const ao = a.sortOrder
  const bo = b.sortOrder
  if (typeof ao === 'number' && typeof bo === 'number') {
    if (ao !== bo) return ao - bo
  } else if (typeof ao === 'number') {
    return -1
  } else if (typeof bo === 'number') {
    return 1
  }
  return a.name.localeCompare(b.name)
}

// Reorder `items` so `sourceId` sits immediately before `targetId` (insert-before).
// Shared by the live drag preview and the committed reorder so they stay in sync.
const moveBefore = (items: NpcRecord[], sourceId: string, targetId: string) => {
  if (sourceId === targetId) return items
  const source = items.find((npc) => npc.id === sourceId)
  if (!source || !items.some((npc) => npc.id === targetId)) return items
  const without = items.filter((npc) => npc.id !== sourceId)
  const insertIndex = without.findIndex((npc) => npc.id === targetId)
  without.splice(insertIndex, 0, source)
  return without
}

const makeNpc = (): NpcRecord => ({
  id: crypto.randomUUID(),
  name: 'New NPC',
  title: '',
  visibleToPlayers: false,
  tags: [],
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultTokenIcon,
  playerDescription: '',
  playerNotes: '',
})

export function NpcsTab({ campaignId, groupId, role }: NpcsTabProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [npcs, setNpcs] = useState<NpcRecord[]>([])
  const [privateNotesById, setPrivateNotesById] = useState<Record<string, string>>({})
  const npcsRef = useRef<NpcRecord[]>([])
  const privateNotesRef = useRef<Record<string, string>>({})
  const pendingNpcWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPrivateWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPlayerNotesWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const inFlightNpcWritesRef = useRef<Record<string, boolean>>({})
  const inFlightPrivateWritesRef = useRef<Record<string, boolean>>({})
  const inFlightPlayerNotesWritesRef = useRef<Record<string, boolean>>({})
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
  const [draggingNpcId, setDraggingNpcId] = useState<string | null>(null)
  const [dragOverNpcId, setDragOverNpcId] = useState<string | null>(null)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const autoScrollRef = useRef<{ raf: number | null; speed: number }>({ raf: null, speed: 0 })

  const { notes: sessionNotes } = useSessionNotes(campaignId, true, groupId)

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
      inFlightNpcWritesRef.current = {}
      inFlightPrivateWritesRef.current = {}
      inFlightPlayerNotesWritesRef.current = {}
      if (autoScrollRef.current.raf != null) cancelAnimationFrame(autoScrollRef.current.raf)
      autoScrollRef.current.raf = null
      autoScrollRef.current.speed = 0
    }
  }, [])

  useEffect(() => {
    const npcsCollection = campaignCollectionRef(db, { campaignId, groupId }, 'npcs')
    const npcsQuery = role === 'gm'
      ? query(npcsCollection)
      : query(npcsCollection, where('visibleToPlayers', '==', true))
    const unsub = onSnapshot(npcsQuery, (snap) => {
      const next = snap.docs
        .map((docSnap) => {
          if (
            pendingNpcWritesRef.current[docSnap.id]
            || pendingPlayerNotesWritesRef.current[docSnap.id]
            || inFlightNpcWritesRef.current[docSnap.id]
            || inFlightPlayerNotesWritesRef.current[docSnap.id]
          ) {
            const local = npcsRef.current.find((npc) => npc.id === docSnap.id)
            if (local) return local
          }
          const data = docSnap.data() as Partial<NpcRecord>
          const local = npcsRef.current.find((npc) => npc.id === docSnap.id)
          const portraitPath = typeof data.portraitPath === 'string' ? data.portraitPath : ''
          const persistedPortraitUrl = typeof data.portraitUrl === 'string' ? data.portraitUrl : null
          const tokenIcon = (data.tokenIcon ?? defaultTokenIcon) as TokenIconConfig
          const portraitUrl = persistedPortraitUrl
            ?? (local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null)
          const customImageUrl = tokenIcon.customImageUrl
            ?? (
              tokenIcon.customImagePath
              && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
              && isRenderableImageUrl(local?.tokenIcon.customImageUrl)
                ? local.tokenIcon.customImageUrl
                : undefined
            )
          return {
            id: docSnap.id,
            name: typeof data.name === 'string' ? data.name : 'Unnamed NPC',
            title: typeof data.title === 'string' ? data.title : '',
            visibleToPlayers: data.visibleToPlayers === true,
            tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            portraitPath,
            portraitUrl,
            portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
            portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
            tokenIcon: customImageUrl
              ? {
                  ...tokenIcon,
                  customImageUrl,
                }
              : tokenIcon,
            playerDescription: typeof data.playerDescription === 'string' ? data.playerDescription : '',
            playerNotes: typeof data.playerNotes === 'string' ? data.playerNotes : '',
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
          } satisfies NpcRecord
        })
        .sort(byOrder)
      setNpcs(next)
    })
    return () => unsub()
  }, [campaignId, groupId, role])

  useEffect(() => {
    const npcsNeedingMedia = npcs.filter((npc) =>
      (npc.portraitPath && !isRenderableImageUrl(npc.portraitUrl))
      || (npc.tokenIcon.customImagePath && !isRenderableImageUrl(npc.tokenIcon.customImageUrl)),
    )
    if (npcsNeedingMedia.length === 0) return

    void Promise.allSettled(
      npcsNeedingMedia.map(async (npc) => {
        const [portraitUrl, customImageUrl] = await Promise.all([
          npc.portraitPath ? resolveStoragePathUrl(npc.portraitPath) : Promise.resolve<string | null>(null),
          npc.tokenIcon.customImagePath ? resolveStoragePathUrl(npc.tokenIcon.customImagePath) : Promise.resolve<string | null>(null),
        ])
        setNpcs((current) =>
          current.map((entry) =>
            entry.id === npc.id
              ? {
                  ...entry,
                  ...(portraitUrl ? { portraitUrl } : {}),
                  ...(customImageUrl
                    ? {
                        tokenIcon: {
                          ...entry.tokenIcon,
                          customImageUrl,
                        },
                      }
                    : {}),
                }
              : entry,
          ),
        )
      }),
    )
  }, [npcs])

  useEffect(() => {
    if (role !== 'gm') {
      setPrivateNotesById({})
      return
    }
    const unsub = onSnapshot(campaignCollectionRef(db, { campaignId, groupId }, 'npcPrivate'), (snap) => {
      setPrivateNotesById(
        snap.docs.reduce<Record<string, string>>((acc, docSnap) => {
          if (pendingPrivateWritesRef.current[docSnap.id] || inFlightPrivateWritesRef.current[docSnap.id]) {
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
  }, [campaignId, groupId, role])

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
      inFlightNpcWritesRef.current[npcId] = true
      const npc = npcsRef.current.find((entry) => entry.id === npcId)
      if (!npc) {
        delete inFlightNpcWritesRef.current[npcId]
        return
      }
      const { id, tokenIcon, portraitUrl, portraitPath, sortOrder, ...data } = npc
      void setDoc(campaignDocRef(db, { campaignId, groupId }, 'npcs', id), {
        ...data,
        ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
        ...entityMediaForPersistence({ portraitPath, portraitUrl, tokenIcon }),
        updatedAt: serverTimestamp(),
      }, { merge: true }).finally(() => {
        delete inFlightNpcWritesRef.current[npcId]
      })
    }, 500)
  }

  const schedulePrivateWrite = (npcId: string) => {
    const existing = pendingPrivateWritesRef.current[npcId]
    if (existing) clearTimeout(existing)
    pendingPrivateWritesRef.current[npcId] = setTimeout(() => {
      delete pendingPrivateWritesRef.current[npcId]
      inFlightPrivateWritesRef.current[npcId] = true
      void setDoc(campaignDocRef(db, { campaignId, groupId }, 'npcPrivate', npcId), {
        id: npcId,
        gmNotes: privateNotesRef.current[npcId] ?? '',
        updatedAt: serverTimestamp(),
      }, { merge: true }).finally(() => {
        delete inFlightPrivateWritesRef.current[npcId]
      })
    }, 500)
  }

  const schedulePlayerNotesWrite = (npcId: string) => {
    const existing = pendingPlayerNotesWritesRef.current[npcId]
    if (existing) clearTimeout(existing)
    pendingPlayerNotesWritesRef.current[npcId] = setTimeout(() => {
      delete pendingPlayerNotesWritesRef.current[npcId]
      inFlightPlayerNotesWritesRef.current[npcId] = true
      const npc = npcsRef.current.find((entry) => entry.id === npcId)
      if (!npc) {
        delete inFlightPlayerNotesWritesRef.current[npcId]
        return
      }
      void setDoc(campaignDocRef(db, { campaignId, groupId }, 'npcs', npcId), {
        playerNotes: npc.playerNotes,
        tags: npc.tags,
        ...entityMediaForPersistence(npc),
        portraitFocusX: npc.portraitFocusX,
        portraitFocusY: npc.portraitFocusY,
        updatedAt: serverTimestamp(),
      }, { merge: true }).finally(() => {
        delete inFlightPlayerNotesWritesRef.current[npcId]
      })
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

  const updatePlayerNpcFields = (npcId: string, updates: Partial<Omit<NpcRecord, 'id'>>) => {
    if (role !== 'player') return
    setNpcs((current) => current.map((npc) => (npc.id === npcId ? { ...npc, ...updates } : npc)))
    schedulePlayerNotesWrite(npcId)
  }

  const uploadNpcTokenImage = async (file: File) => {
    if (!selectedNpc) throw new Error('No NPC selected.')
    const { path, url, name } = await uploadEntityImage({
      campaignId,
      groupId,
      collectionName: 'npcs',
      entityId: selectedNpc.id,
      mediaKind: 'token-icons',
      file,
      maxWidth: 1024,
      maxHeight: 1024,
    })
    return {
      customImagePath: path,
      customImageUrl: url,
      customImageName: name,
    }
  }

  const uploadNpcPortraitImage = async (file: File) => {
    if (!selectedNpc) throw new Error('No NPC selected.')
    const { path, url } = await uploadEntityImage({
      campaignId,
      groupId,
      collectionName: 'npcs',
      entityId: selectedNpc.id,
      mediaKind: 'portraits',
      file,
      maxWidth: 600,
      maxHeight: 800,
    })
    return {
      portraitPath: path,
      portraitUrl: url,
    }
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

  // Tags are editable by GM and players (Firestore rules allow players to change tags).
  const updateNpcTags = (npcId: string, tags: string[]) => {
    if (role !== 'gm' && role !== 'player') return
    setNpcs((current) => current.map((npc) => (npc.id === npcId ? { ...npc, tags } : npc)))
    if (role === 'gm') scheduleNpcWrite(npcId)
    else schedulePlayerNotesWrite(npcId)
  }

  const addNpc = async () => {
    if (role !== 'gm') return
    const next = makeNpc()
    next.sortOrder = npcsRef.current.reduce((max, npc) => Math.max(max, npc.sortOrder ?? -1), -1) + 1
    await setDoc(campaignDocRef(db, { campaignId, groupId }, 'npcs', next.id), {
      ...next,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await setDoc(campaignDocRef(db, { campaignId, groupId }, 'npcPrivate', next.id), {
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
    delete inFlightNpcWritesRef.current[npcId]
    delete inFlightPlayerNotesWritesRef.current[npcId]
    const privatePending = pendingPrivateWritesRef.current[npcId]
    if (privatePending) {
      clearTimeout(privatePending)
      delete pendingPrivateWritesRef.current[npcId]
    }
    const playerPending = pendingPlayerNotesWritesRef.current[npcId]
    if (playerPending) {
      clearTimeout(playerPending)
      delete pendingPlayerNotesWritesRef.current[npcId]
    }
    delete inFlightPrivateWritesRef.current[npcId]
    await deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'npcs', npcId))
    await deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'npcPrivate', npcId))
    setDeleteCandidate(null)
  }

  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'
  const gmNotes = selectedNpc ? (privateNotesById[selectedNpc.id] ?? '') : ''
  const autoNotes = useMemo(
    () => selectedNpc ? buildAutoNotesForNpc(selectedNpc.id, sessionNotes) : [],
    [selectedNpc, sessionNotes],
  )
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
    return [...filtered].sort(byOrder)
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

  const canReorder = role === 'gm' || role === 'player'

  // Auto-scroll the NPC list while dragging near its top/bottom edge.
  const stepAutoScroll = () => {
    const el = listScrollRef.current
    const { speed } = autoScrollRef.current
    if (!el || speed === 0) {
      autoScrollRef.current.raf = null
      return
    }
    el.scrollTop += speed
    autoScrollRef.current.raf = requestAnimationFrame(stepAutoScroll)
  }

  const updateAutoScroll = (clientY: number) => {
    const el = listScrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = 60
    const maxSpeed = 16
    let speed = 0
    if (clientY < rect.top + edge && el.scrollTop > 0) {
      speed = -Math.ceil(maxSpeed * Math.min(1, (rect.top + edge - clientY) / edge))
    } else if (clientY > rect.bottom - edge && el.scrollTop + el.clientHeight < el.scrollHeight) {
      speed = Math.ceil(maxSpeed * Math.min(1, (clientY - (rect.bottom - edge)) / edge))
    }
    autoScrollRef.current.speed = speed
    if (speed !== 0 && autoScrollRef.current.raf == null) {
      autoScrollRef.current.raf = requestAnimationFrame(stepAutoScroll)
    } else if (speed === 0 && autoScrollRef.current.raf != null) {
      cancelAnimationFrame(autoScrollRef.current.raf)
      autoScrollRef.current.raf = null
    }
  }

  const stopAutoScroll = () => {
    if (autoScrollRef.current.raf != null) cancelAnimationFrame(autoScrollRef.current.raf)
    autoScrollRef.current.raf = null
    autoScrollRef.current.speed = 0
  }

  const reorderNpcs = (sourceId: string, targetId: string) => {
    if (!canReorder || sourceId === targetId) return
    // Reorder within the displayed sequence (groups in display order), same group only.
    const sequence = groupedNpcs.flatMap((group) => group.items)
    const source = sequence.find((npc) => npc.id === sourceId)
    const target = sequence.find((npc) => npc.id === targetId)
    if (!source || !target || source.visibleToPlayers !== target.visibleToPlayers) return
    const reordered = moveBefore(sequence, sourceId, targetId)
    const changed = reordered
      .map((npc, index) => ({ id: npc.id, sortOrder: index }))
      .filter(({ id, sortOrder }) => sequence.find((npc) => npc.id === id)?.sortOrder !== sortOrder)
    if (changed.length === 0) return
    setNpcs((current) =>
      current.map((npc) => {
        const update = changed.find((entry) => entry.id === npc.id)
        return update ? { ...npc, sortOrder: update.sortOrder } : npc
      }),
    )
    changed.forEach((entry) => scheduleNpcWrite(entry.id))
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
    if (!selectedNpc || (role !== 'gm' && role !== 'player')) return
    const nextTags = Array.from(new Set(tagSelection.map((tag) => tag.trim().toLowerCase()).filter(Boolean)))
    if (nextTags.join('|') !== selectedNpc.tags.join('|')) {
      updateNpcTags(selectedNpc.id, nextTags)
    }
    setTagsModalOpen(false)
  }

  return (
    <div className="maps-layout monsters-layout">
      {showListPane ? (
        <aside
          className="maps-sidebar monsters-sidebar characters-sidebar"
          onDragOver={(event) => {
            if (!canReorder || !draggingNpcId) return
            event.preventDefault()
            updateAutoScroll(event.clientY)
          }}
          onDrop={() => stopAutoScroll()}
        >
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
          <div className="monster-list-grid character-list-grid" ref={listScrollRef}>
            {groupedNpcs.map((group) => {
              const draggingInGroup = draggingNpcId != null && group.items.some((npc) => npc.id === draggingNpcId)
              const overInGroup = dragOverNpcId != null && group.items.some((npc) => npc.id === dragOverNpcId)
              const renderItems = draggingInGroup && overInGroup && draggingNpcId && dragOverNpcId
                ? moveBefore(group.items, draggingNpcId, dragOverNpcId)
                : group.items
              return (
              <div key={group.key} className="npc-group-block">
                {group.label ? <p className="npc-group-label">{group.label}</p> : null}
                {renderItems.map((npc) => {
              const isDragPlaceholder = draggingInGroup && draggingNpcId === npc.id
              return (
              <div
                key={npc.id}
                className={[
                  'map-row',
                  'npc-row',
                  npc.id === selectedNpcId ? 'active' : '',
                  canReorder ? 'npc-row-draggable' : '',
                  isDragPlaceholder ? 'npc-row-placeholder' : '',
                ].filter(Boolean).join(' ')}
                style={isDragPlaceholder && dragHeight ? { height: dragHeight } : undefined}
                draggable={canReorder}
                onDragStart={(event) => {
                  if (!canReorder) return
                  event.dataTransfer.effectAllowed = 'move'
                  const id = npc.id
                  const height = event.currentTarget.offsetHeight
                  // Defer the re-render to the next frame: emptying the dragged row
                  // into a placeholder synchronously here makes Chrome cancel the drag.
                  requestAnimationFrame(() => {
                    setDraggingNpcId(id)
                    setDragOverNpcId(id)
                    setDragHeight(height)
                  })
                }}
                onDragOver={(event) => {
                  if (!canReorder || !draggingNpcId) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  updateAutoScroll(event.clientY)
                  if (npc.id !== draggingNpcId && dragOverNpcId !== npc.id) setDragOverNpcId(npc.id)
                }}
                onDrop={(event) => {
                  if (!canReorder || !draggingNpcId) return
                  event.preventDefault()
                  reorderNpcs(draggingNpcId, dragOverNpcId ?? npc.id)
                  setDraggingNpcId(null)
                  setDragOverNpcId(null)
                  setDragHeight(null)
                  stopAutoScroll()
                }}
                onDragEnd={() => {
                  setDraggingNpcId(null)
                  setDragOverNpcId(null)
                  setDragHeight(null)
                  stopAutoScroll()
                }}
              >
                {isDragPlaceholder ? null : (
                <>
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
                        draggable={false}
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
                </>
                )}
              </div>
              )
                })}
              </div>
              )
            })}
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
              <NpcDetailEditor
                npc={selectedNpc}
                role={role}
                gmNotes={gmNotes}
                autoNotes={autoNotes}
                onChange={(updates) => {
                  if (role === 'gm') {
                    updateSelectedNpc(updates)
                    return
                  }
                  updatePlayerNpcFields(selectedNpc.id, updates)
                }}
                onChangePlayerNotes={(value) => {
                  if (role === 'gm') {
                    updateSelectedNpc({ playerNotes: value })
                    return
                  }
                  updatePlayerNotes(selectedNpc.id, value)
                }}
                onChangeGmNotes={(value) => updateGmNotes(selectedNpc.id, value)}
                onOpenTags={() => setTagsModalOpen(true)}
                onUploadPortraitImage={uploadNpcPortraitImage}
                onUploadTokenImage={uploadNpcTokenImage}
              />
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

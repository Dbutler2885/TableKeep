import { Check, Plus, Search, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { NpcPrivateRecord, NpcRecord } from '../../../types/app'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { uploadEntityImage } from '../../common/mediaStorage'
import { NpcDetailEditor } from '../../npcs/NpcDetailEditor'
import { npcDocWritePayload, npcMediaUploadParams, npcPrivateWritePayload, SCENE_NPC_WRITE_OPTIONS, sceneNpcDocSegments, sceneNpcPrivateDocSegments, toNpcGmNotes, toNpcRecord } from '../lib/sceneNpcRecord'

export function SceneNpcEditorModal({
  campaignId,
  groupId,
  npcId,
  allTags,
  onClose,
}: {
  campaignId: string
  groupId: string
  npcId: string
  allTags: string[]
  onClose: () => void
}) {
  const [npc, setNpc] = useState<NpcRecord | null>(null)
  const [gmNotes, setGmNotes] = useState('')
  const [tagsModalOpen, setTagsModalOpen] = useState(false)
  const [tagSelection, setTagSelection] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  const [tagSeed, setTagSeed] = useState<{ npc: NpcRecord | null; open: boolean }>({
    npc: null,
    open: false,
  })

  useEffect(() => {
    const unsub = onSnapshot(campaignDocRef(db, { campaignId, groupId }, ...sceneNpcDocSegments(npcId)), (snap) => {
      if (!snap.exists()) {
        setNpc(null)
        return
      }
      setNpc(toNpcRecord(snap.id, snap.data() as Partial<NpcRecord>))
    })
    return () => unsub()
  }, [campaignId, groupId, npcId])

  useEffect(() => {
    const unsub = onSnapshot(campaignDocRef(db, { campaignId, groupId }, ...sceneNpcPrivateDocSegments(npcId)), (snap) => {
      const data = snap.data() as Partial<NpcPrivateRecord> | undefined
      setGmNotes(toNpcGmNotes(data))
    })
    return () => unsub()
  }, [campaignId, groupId, npcId])

  if (tagsModalOpen && npc && (tagSeed.npc !== npc || !tagSeed.open)) {
    setTagSeed({ npc, open: true })
    setTagSelection(npc.tags)
    setNewTagInput('')
    setTagSearch('')
  } else if (!tagsModalOpen && tagSeed.open) {
    setTagSeed({ npc: null, open: false })
  }

  const persistNpc = async (updates: Partial<Omit<NpcRecord, 'id'>>) => {
    if (!npc) return
    const nextNpc = { ...npc, ...updates }
    setNpc(nextNpc)
    await setDoc(campaignDocRef(db, { campaignId, groupId }, ...sceneNpcDocSegments(nextNpc.id)), {
      ...npcDocWritePayload(nextNpc),
      updatedAt: serverTimestamp(),
    }, SCENE_NPC_WRITE_OPTIONS)
  }

  const persistGmNotes = async (value: string) => {
    setGmNotes(value)
    await setDoc(campaignDocRef(db, { campaignId, groupId }, ...sceneNpcPrivateDocSegments(npcId)), {
      ...npcPrivateWritePayload(npcId, value),
      updatedAt: serverTimestamp(),
    }, SCENE_NPC_WRITE_OPTIONS)
  }

  const uploadNpcTokenImage = async (file: File) => {
    const { path, url, name } = await uploadEntityImage({
      campaignId,
      groupId,
      entityId: npcId,
      file,
      ...npcMediaUploadParams('token-icons'),
    })
    return { customImagePath: path, customImageUrl: url, customImageName: name }
  }

  const uploadNpcPortraitImage = async (file: File) => {
    const { path, url } = await uploadEntityImage({
      campaignId,
      groupId,
      entityId: npcId,
      file,
      ...npcMediaUploadParams('portraits'),
    })
    return { portraitPath: path, portraitUrl: url }
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
    if (!npc) return
    const nextTags = Array.from(new Set(tagSelection.map((tag) => tag.trim().toLowerCase()).filter(Boolean)))
    await persistNpc({ tags: nextTags })
    setTagsModalOpen(false)
  }

  return (
    <>
      <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="confirm-modal map-npc-editor-modal" onClick={(event) => event.stopPropagation()}>
          <div className="map-npc-editor-modal-header">
            <h3>Scene NPC</h3>
            <button type="button" className="map-edit-btn" onClick={onClose} aria-label="Close NPC editor">
              <X size={16} />
            </button>
          </div>
          <div className="map-npc-editor-modal-body">
            {npc ? (
              <NpcDetailEditor
                npc={npc}
                role="gm"
                gmNotes={gmNotes}
                autoNotes={[]}
                onChange={(updates) => void persistNpc(updates)}
                onChangePlayerNotes={(value) => void persistNpc({ playerNotes: value })}
                onChangeGmNotes={(value) => void persistGmNotes(value)}
                onOpenTags={() => setTagsModalOpen(true)}
                onUploadPortraitImage={uploadNpcPortraitImage}
                onUploadTokenImage={uploadNpcTokenImage}
              />
            ) : (
              <p>Loading NPC...</p>
            )}
          </div>
        </div>
      </div>
      {tagsModalOpen && npc ? (
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
            <p className="npc-tag-modal-subtitle">{npc.name || 'NPC'}</p>
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
    </>
  )
}

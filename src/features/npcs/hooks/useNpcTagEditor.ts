import { useState } from 'react'
import type { NpcRecord } from '../../../types/app'
import type { NpcTagDraft } from '../lib/npcTagDraft'
import { emptyTagDraft, tagDraftFor, withNewTag, withoutTag, withTag } from '../lib/npcTagDraft'

type SyncedTo = { open: boolean; npc: NpcRecord | null }

const outOfSync = (syncedTo: SyncedTo, open: boolean, npc: NpcRecord | null) =>
  syncedTo.open !== open || syncedTo.npc !== npc

// The tags dialog. Opening it, or any change to the selected NPC while it is
// open, starts the draft again from that NPC's tags. `save` returns whether
// the dialog may close.
export function useNpcTagEditor(selectedNpc: NpcRecord | null, save: (selection: string[]) => boolean) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<NpcTagDraft>(emptyTagDraft)
  const [syncedTo, setSyncedTo] = useState<SyncedTo>({ open, npc: selectedNpc })
  if (outOfSync(syncedTo, open, selectedNpc)) {
    setSyncedTo({ open, npc: selectedNpc })
    if (open) setDraft(tagDraftFor(selectedNpc))
  }

  return {
    open,
    draft,
    openEditor: () => setOpen(true),
    close: () => setOpen(false),
    setNewTagInput: (newTagInput: string) => setDraft((current) => ({ ...current, newTagInput })),
    setTagSearch: (tagSearch: string) => setDraft((current) => ({ ...current, tagSearch })),
    addTag: (tag: string) => setDraft((current) => withTag(current, tag)),
    submitNewTag: () => setDraft(withNewTag),
    removeTag: (tag: string) => setDraft((current) => withoutTag(current, tag)),
    save: () => {
      if (save(draft.selection)) setOpen(false)
    },
  }
}

export type NpcTagEditor = ReturnType<typeof useNpcTagEditor>

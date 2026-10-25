import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { NpcRecord, Role } from '../../types/app'
import { useSessionNotes } from '../notes/useSessionNotes'
import { NpcDeleteDialog } from './components/NpcDeleteDialog'
import { NpcDetailTabs } from './components/NpcDetailTabs'
import { NpcListPane } from './components/NpcListPane'
import { NpcTagsModal } from './components/NpcTagsModal'
import { useNpcDocuments } from './hooks/useNpcDocuments'
import { useNpcDrag } from './hooks/useNpcDrag'
import { useNpcFilters } from './hooks/useNpcFilters'
import { useNpcLayout } from './hooks/useNpcLayout'
import { useNpcPrivateNotes } from './hooks/useNpcPrivateNotes'
import { useNpcSelection } from './hooks/useNpcSelection'
import { useNpcTagEditor } from './hooks/useNpcTagEditor'
import { useNpcWriteQueues } from './hooks/useNpcWriteQueues'
import type { NpcActionContext } from './lib/npcActions'
import {
  addNpc,
  applyReorder,
  editNpcFields,
  editPlayerNotes,
  saveNpcTags,
  updateGmNotes,
  updateNpc,
  uploadPortraitFor,
  uploadTokenImageFor,
} from './lib/npcActions'
import { deleteNpcDocuments } from './lib/npcFirestore'
import { canReorderNpcs, reorderChanges } from './lib/npcList'
import { gmNotesFor } from './lib/npcRecords'
import { forgetNpcWrites } from './lib/npcWriteQueue'
import { NpcDetailEditor } from './NpcDetailEditor'
import type { NpcAutoNote } from './npcAutoNotes'
import { autoNotesForNpc } from './npcAutoNotes'

/** The NPC's character sheet, as its rule set shows it to the GM. */
type NpcSheetTab = (npc: NpcRecord) => ReactNode

type NpcsTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
  /** The GM's character sheet tab beside each NPC's story; absent where there is none. */
  sheetTab?: NpcSheetTab
}

// Only the GM deletes. The NPC's queued writes are dropped first, so none of
// them lands after its documents are gone.
async function deleteNpc(context: NpcActionContext, npc: NpcRecord | null, onDeleted: () => void) {
  if (!npc || context.role !== 'gm') return
  forgetNpcWrites(context.queues, npc.id)
  await deleteNpcDocuments(context.scope, npc.id)
  onDeleted()
}

type NpcEditorProps = {
  npc: NpcRecord
  actions: NpcActionContext
  gmNotes: string
  autoNotes: NpcAutoNote[]
  onOpenTags: () => void
}

// The selected NPC's editor, and where each of its edits goes.
function NpcEditor({ npc, actions, gmNotes, autoNotes, onOpenTags }: NpcEditorProps) {
  return (
    <NpcDetailEditor
      npc={npc}
      role={actions.role}
      gmNotes={gmNotes}
      autoNotes={autoNotes}
      onChange={(updates) => editNpcFields(actions, npc.id, updates)}
      onChangePlayerNotes={(value) => editPlayerNotes(actions, npc.id, value)}
      onChangeGmNotes={(value) => updateGmNotes(actions, npc.id, value)}
      onOpenTags={onOpenTags}
      onUploadPortraitImage={(file) => uploadPortraitFor(actions, npc.id, file)}
      onUploadTokenImage={(file) => uploadTokenImageFor(actions, npc.id, file)}
    />
  )
}

type NpcDetailPaneProps = Omit<NpcEditorProps, 'npc'> & {
  npc: NpcRecord | null
  isMobile: boolean
  onBack: () => void
  sheetTab: NpcSheetTab | undefined
}

function NpcDetailPane({ npc, isMobile, onBack, sheetTab, ...editorProps }: NpcDetailPaneProps) {
  return (
    <div className="monsters-detail">
      <div className="monsters-detail-inner">
        {isMobile ? (
          <div className="monster-detail-header-row">
            <button type="button" className="back-link monster-mobile-back" onClick={onBack}>
              <ChevronLeft size={16} />
            </button>
          </div>
        ) : null}
        {!npc ? (
          <p>Select an NPC from the list.</p>
        ) : (
          <NpcDetailTabs npc={npc} story={<NpcEditor npc={npc} {...editorProps} />} sheetTab={sheetTab} />
        )}
      </div>
    </div>
  )
}

export function NpcsTab({ campaignId, groupId, role, sheetTab }: NpcsTabProps) {
  const scope = { campaignId, groupId }
  const layout = useNpcLayout()
  const queues = useNpcWriteQueues()
  const { npcs, setNpcs, npcsRef } = useNpcDocuments(scope, role, queues)
  const { privateNotesById, setPrivateNotesById, privateNotesRef } = useNpcPrivateNotes(scope, role, queues)
  const { selectedNpcId, selectedNpc, setSelectedNpcId } = useNpcSelection(npcs)
  const filters = useNpcFilters(npcs, role)
  const [deleteCandidate, setDeleteCandidate] = useState<NpcRecord | null>(null)
  const { notes: sessionNotes } = useSessionNotes(campaignId, true, groupId)
  const autoNotes = useMemo(() => autoNotesForNpc(selectedNpc, sessionNotes), [selectedNpc, sessionNotes])

  const actions: NpcActionContext = { scope, role, queues, npcsRef, privateNotesRef, setNpcs, setPrivateNotesById }
  const tagEditor = useNpcTagEditor(selectedNpc, (selection) => saveNpcTags(actions, selectedNpc, selection))
  const { listRef, controls: drag } = useNpcDrag(canReorderNpcs(role), (sourceId, targetId) => {
    applyReorder(actions, reorderChanges(filters.groupedNpcs, sourceId, targetId))
  })
  const openNpc = (npcId: string) => {
    setSelectedNpcId(npcId)
    layout.showDetail()
  }

  return (
    <div className="maps-layout monsters-layout">
      {layout.showListPane ? (
        <NpcListPane
          role={role}
          filters={filters}
          selectedNpcId={selectedNpcId}
          drag={drag}
          listRef={listRef}
          onAdd={() => void addNpc(actions, openNpc)}
          onSelect={openNpc}
          onToggleVisibility={(npc) => updateNpc(actions, npc.id, { visibleToPlayers: !npc.visibleToPlayers })}
          onDelete={setDeleteCandidate}
        />
      ) : null}

      {layout.showDetailPane ? (
        <NpcDetailPane
          npc={selectedNpc}
          isMobile={layout.isMobile}
          onBack={layout.showList}
          actions={actions}
          gmNotes={gmNotesFor(privateNotesById, selectedNpc)}
          autoNotes={autoNotes}
          onOpenTags={tagEditor.openEditor}
          sheetTab={sheetTab}
        />
      ) : null}

      <NpcDeleteDialog
        npc={deleteCandidate}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void deleteNpc(actions, deleteCandidate, () => setDeleteCandidate(null))}
      />
      <NpcTagsModal editor={tagEditor} npc={selectedNpc} allTags={filters.allTags} />
    </div>
  )
}

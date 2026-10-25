// The edits the NPC tab makes. Each one updates local state at once and
// queues the matching debounced write, and each checks the viewer's role:
// the GM writes the whole NPC, a player only the fields the rules allow.
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { NpcRecord, Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { createNpcDocuments, writeNpc, writeNpcPrivateNotes, writePlayerNpcFields } from './npcFirestore'
import type { SortOrderChange } from './npcList'
import { applySortOrders, canEditNpcTags } from './npcList'
import { uploadNpcPortrait, uploadNpcTokenImage } from './npcMediaStorage'
import { findNpc, makeNpc, nextSortOrder, patchNpc } from './npcRecords'
import { normalizedTags, tagsChanged } from './npcTagDraft'
import type { NpcWriteQueues } from './npcWriteQueue'

export type NpcUpdates = Partial<Omit<NpcRecord, 'id'>>

export type NpcActionContext = {
  scope: CampaignScope
  role: Role | null
  queues: NpcWriteQueues
  npcsRef: RefObject<NpcRecord[]>
  privateNotesRef: RefObject<Record<string, string>>
  setNpcs: Dispatch<SetStateAction<NpcRecord[]>>
  setPrivateNotesById: Dispatch<SetStateAction<Record<string, string>>>
}

// The NPC is read when the timer fires, so the write carries every edit made
// in the meantime, and nothing is written if the NPC has gone.
function scheduleNpcWrite(context: NpcActionContext, npcId: string) {
  context.queues.npc.schedule(npcId, () => {
    const npc = findNpc(context.npcsRef.current, npcId)
    return npc ? writeNpc(context.scope, npc) : undefined
  })
}

function schedulePlayerFieldsWrite(context: NpcActionContext, npcId: string) {
  context.queues.player.schedule(npcId, () => {
    const npc = findNpc(context.npcsRef.current, npcId)
    return npc ? writePlayerNpcFields(context.scope, npc) : undefined
  })
}

function schedulePrivateNotesWrite(context: NpcActionContext, npcId: string) {
  context.queues.private.schedule(npcId, () =>
    writeNpcPrivateNotes(context.scope, npcId, context.privateNotesRef.current[npcId] ?? ''))
}

export function updateNpc(context: NpcActionContext, npcId: string, updates: NpcUpdates) {
  if (context.role !== 'gm') return
  context.setNpcs((current) => patchNpc(current, npcId, updates))
  scheduleNpcWrite(context, npcId)
}

export function updatePlayerNpcFields(context: NpcActionContext, npcId: string, updates: NpcUpdates) {
  if (context.role !== 'player') return
  context.setNpcs((current) => patchNpc(current, npcId, updates))
  schedulePlayerFieldsWrite(context, npcId)
}

// The detail editor's field edits, routed by who is editing.
export function editNpcFields(context: NpcActionContext, npcId: string, updates: NpcUpdates) {
  if (context.role === 'gm') updateNpc(context, npcId, updates)
  else updatePlayerNpcFields(context, npcId, updates)
}

export const editPlayerNotes = (context: NpcActionContext, npcId: string, playerNotes: string) =>
  editNpcFields(context, npcId, { playerNotes })

export function updateGmNotes(context: NpcActionContext, npcId: string, gmNotes: string) {
  if (context.role !== 'gm') return
  context.setPrivateNotesById((current) => ({ ...current, [npcId]: gmNotes }))
  schedulePrivateNotesWrite(context, npcId)
}

// Tags are editable by GM and players (Firestore rules allow players to change tags).
export function updateNpcTags(context: NpcActionContext, npcId: string, tags: string[]) {
  if (!canEditNpcTags(context.role)) return
  context.setNpcs((current) => patchNpc(current, npcId, { tags }))
  if (context.role === 'gm') scheduleNpcWrite(context, npcId)
  else schedulePlayerFieldsWrite(context, npcId)
}

// Saves the dialog's selection when it differs from the NPC's tags, and
// returns whether the dialog may close: a viewer who cannot edit tags stays.
export function saveNpcTags(context: NpcActionContext, npc: NpcRecord | null, selection: string[]) {
  if (!npc || !canEditNpcTags(context.role)) return false
  const tags = normalizedTags(selection)
  if (tagsChanged(npc.tags, tags)) updateNpcTags(context, npc.id, tags)
  return true
}

// Players may reorder too; the new order goes through the full NPC write.
export function applyReorder(context: NpcActionContext, changes: SortOrderChange[]) {
  if (changes.length === 0) return
  context.setNpcs((current) => applySortOrders(current, changes))
  changes.forEach((change) => scheduleNpcWrite(context, change.id))
}

// A new NPC goes after every ordered one, with an empty private document.
export async function addNpc(context: NpcActionContext, onAdded: (npcId: string) => void) {
  if (context.role !== 'gm') return
  const npc = makeNpc()
  npc.sortOrder = nextSortOrder(context.npcsRef.current)
  await createNpcDocuments(context.scope, npc)
  onAdded(npc.id)
}

export const uploadPortraitFor = (context: NpcActionContext, npcId: string, file: File) =>
  uploadNpcPortrait(context.scope, context.role, npcId, file)

export const uploadTokenImageFor = (context: NpcActionContext, npcId: string, file: File) =>
  uploadNpcTokenImage(context.scope, context.role, npcId, file)

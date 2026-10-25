// How an NPC document becomes an NpcRecord, and the record-level helpers the
// tab shares. Nothing here touches Firebase.
import type { NpcRecord, TokenIconConfig } from '../../../types/app'
import { isRenderableImageUrl } from '../../common/mediaFields'

export type NpcDocumentSnapshot = {
  id: string
  data: () => unknown
}

export const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn' as const,
  color: '#2f5bbf',
  size: 34,
}

export const makeNpc = (): NpcRecord => ({
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

// NPCs without a sort order go after every ordered one.
const orderKey = (npc: NpcRecord) => (typeof npc.sortOrder === 'number' ? npc.sortOrder : Number.POSITIVE_INFINITY)

// Sort order first, then name. Two unordered NPCs subtract to NaN, which falls
// through to the name just as two equal orders do.
export const byOrder = (a: NpcRecord, b: NpcRecord) => orderKey(a) - orderKey(b) || a.name.localeCompare(b.name)

// Reorder `items` so `sourceId` sits immediately before `targetId` (insert-before).
// Shared by the live drag preview and the committed reorder so they stay in sync.
export const moveBefore = (items: NpcRecord[], sourceId: string | null, targetId: string | null) => {
  if (sourceId === targetId) return items
  const source = items.find((npc) => npc.id === sourceId)
  if (!source || !items.some((npc) => npc.id === targetId)) return items
  const without = items.filter((npc) => npc.id !== sourceId)
  const insertIndex = without.findIndex((npc) => npc.id === targetId)
  without.splice(insertIndex, 0, source)
  return without
}

export const nextSortOrder = (npcs: NpcRecord[]) =>
  npcs.reduce((max, npc) => Math.max(max, npc.sortOrder ?? -1), -1) + 1

export const findNpc = (npcs: NpcRecord[], npcId: string) => npcs.find((npc) => npc.id === npcId) ?? null

const stringOr = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)

const numberOr = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback)

const readTags = (value: unknown) =>
  Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []

// A URL resolved earlier for the same portrait path outlives the snapshot,
// because the stored document never carries one.
const carriedPortraitUrl = (local: NpcRecord | undefined, portraitPath: string) =>
  local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null

const sameCustomImage = (tokenIcon: TokenIconConfig, localIcon: TokenIconConfig | undefined) =>
  Boolean(tokenIcon.customImagePath) && localIcon?.customImagePath === tokenIcon.customImagePath

const carriedCustomImageUrl = (tokenIcon: TokenIconConfig, localIcon: TokenIconConfig | undefined) => {
  const url = localIcon?.customImageUrl
  return sameCustomImage(tokenIcon, localIcon) && isRenderableImageUrl(url) ? url : undefined
}

const readTokenIcon = (value: unknown, localIcon: TokenIconConfig | undefined) => {
  const tokenIcon = (value ?? defaultTokenIcon) as TokenIconConfig
  const customImageUrl = tokenIcon.customImageUrl ?? carriedCustomImageUrl(tokenIcon, localIcon)
  return customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon
}

export function readNpcDocument(id: string, data: Partial<NpcRecord>, local: NpcRecord | undefined): NpcRecord {
  const portraitPath = stringOr(data.portraitPath, '')
  return {
    id,
    name: stringOr(data.name, 'Unnamed NPC'),
    title: stringOr(data.title, ''),
    visibleToPlayers: data.visibleToPlayers === true,
    tags: readTags(data.tags),
    portraitPath,
    portraitUrl: typeof data.portraitUrl === 'string' ? data.portraitUrl : carriedPortraitUrl(local, portraitPath),
    portraitFocusX: numberOr(data.portraitFocusX, 50),
    portraitFocusY: numberOr(data.portraitFocusY, 50),
    tokenIcon: readTokenIcon(data.tokenIcon, local?.tokenIcon),
    playerDescription: stringOr(data.playerDescription, ''),
    playerNotes: stringOr(data.playerNotes, ''),
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
  }
}

// An NPC with a write still pending or in flight keeps its local copy, so a
// snapshot cannot roll back an edit the server has not seen yet.
export function readNpcSnapshot(
  docs: NpcDocumentSnapshot[],
  current: NpcRecord[],
  isBusy: (npcId: string) => boolean,
): NpcRecord[] {
  return docs
    .map((docSnap) => {
      const local = current.find((npc) => npc.id === docSnap.id)
      if (local && isBusy(docSnap.id)) return local
      return readNpcDocument(docSnap.id, docSnap.data() as Partial<NpcRecord>, local)
    })
    .sort(byOrder)
}

const readGmNotes = (data: unknown) => stringOr((data as { gmNotes?: unknown }).gmNotes, '')

export function readPrivateNotes(
  docs: NpcDocumentSnapshot[],
  current: Record<string, string>,
  isBusy: (npcId: string) => boolean,
): Record<string, string> {
  return docs.reduce<Record<string, string>>((notes, docSnap) => {
    notes[docSnap.id] = isBusy(docSnap.id) ? current[docSnap.id] ?? '' : readGmNotes(docSnap.data())
    return notes
  }, {})
}

export const gmNotesFor = (notesById: Record<string, string>, npc: NpcRecord | null) =>
  npc ? notesById[npc.id] ?? '' : ''

const needsUrl = (path: string | undefined, url: string | null | undefined) => Boolean(path) && !isRenderableImageUrl(url)

export const needsMediaUrls = (npc: NpcRecord) =>
  needsUrl(npc.portraitPath, npc.portraitUrl) || needsUrl(npc.tokenIcon.customImagePath, npc.tokenIcon.customImageUrl)

const withResolvedMedia = (npc: NpcRecord, portraitUrl: string | null, customImageUrl: string | null) => ({
  ...npc,
  ...(portraitUrl ? { portraitUrl } : {}),
  ...(customImageUrl ? { tokenIcon: { ...npc.tokenIcon, customImageUrl } } : {}),
})

export const applyResolvedMedia = (
  npcs: NpcRecord[],
  npcId: string,
  portraitUrl: string | null,
  customImageUrl: string | null,
) => npcs.map((npc) => (npc.id === npcId ? withResolvedMedia(npc, portraitUrl, customImageUrl) : npc))

export const patchNpc = (npcs: NpcRecord[], npcId: string, updates: Partial<Omit<NpcRecord, 'id'>>) =>
  npcs.map((npc) => (npc.id === npcId ? { ...npc, ...updates } : npc))

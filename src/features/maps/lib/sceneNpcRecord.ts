import type { NpcPrivateRecord, NpcRecord } from '../../../types/app'

export const sceneNpcDocSegments = (npcId: string) => ['npcs', npcId]
export const sceneNpcPrivateDocSegments = (npcId: string) => ['npcPrivate', npcId]
export const SCENE_NPC_WRITE_OPTIONS = { merge: true } as const

export const toNpcRecord = (id: string, data: Partial<NpcRecord> | undefined): NpcRecord => ({
  id,
  name: typeof data?.name === 'string' ? data.name : 'Unnamed NPC',
  title: typeof data?.title === 'string' ? data.title : '',
  visibleToPlayers: data?.visibleToPlayers === true,
  tags: Array.isArray(data?.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  portraitPath: typeof data?.portraitPath === 'string' ? data.portraitPath : '',
  portraitUrl: typeof data?.portraitUrl === 'string' ? data.portraitUrl : null,
  portraitFocusX: typeof data?.portraitFocusX === 'number' ? data.portraitFocusX : 50,
  portraitFocusY: typeof data?.portraitFocusY === 'number' ? data.portraitFocusY : 50,
  tokenIcon: data?.tokenIcon ?? { icon: 'pawn', color: '#2f5bbf', size: 34 },
  playerDescription: typeof data?.playerDescription === 'string' ? data.playerDescription : '',
  playerNotes: typeof data?.playerNotes === 'string' ? data.playerNotes : '',
})

export const toNpcGmNotes = (data: Partial<NpcPrivateRecord> | undefined) => (
  typeof data?.gmNotes === 'string' ? data.gmNotes : ''
)

export const npcDocWritePayload = (npc: NpcRecord): Omit<NpcRecord, 'id'> => {
  const { id: _id, ...data } = npc
  return data
}

export const npcPrivateWritePayload = (npcId: string, gmNotes: string) => ({ id: npcId, gmNotes })

export const npcMediaUploadParams = (kind: 'token-icons' | 'portraits') => ({
  collectionName: 'npcs' as const,
  mediaKind: kind,
  maxWidth: kind === 'token-icons' ? 1024 : 600,
  maxHeight: kind === 'token-icons' ? 1024 : 800,
})

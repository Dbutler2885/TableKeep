import { describe, expect, it } from 'vitest'
import { npcDocWritePayload, npcMediaUploadParams, npcPrivateWritePayload, sceneNpcDocSegments, sceneNpcPrivateDocSegments, toNpcGmNotes, toNpcRecord } from './sceneNpcRecord'

describe('scene NPC records', () => {
  it('builds public and private document segments', () => {
    expect(sceneNpcDocSegments('npc-1')).toEqual(['npcs', 'npc-1'])
    expect(sceneNpcPrivateDocSegments('npc-1')).toEqual(['npcPrivate', 'npc-1'])
  })
  it('applies every default and filters non-string tags', () => {
    expect(toNpcRecord('npc-1', { tags: ['a', 3, 'b'] as string[] })).toEqual({ id: 'npc-1', name: 'Unnamed NPC', title: '', visibleToPlayers: false, tags: ['a', 'b'], portraitPath: '', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 }, playerDescription: '', playerNotes: '' })
  })
  it('round trips write payloads without ids', () => {
    const record = toNpcRecord('npc-1', { name: 'Innkeeper', visibleToPlayers: true })
    expect(toNpcRecord(record.id, npcDocWritePayload(record))).toEqual(record)
    expect(npcPrivateWritePayload('npc-1', 'secret')).toEqual({ id: 'npc-1', gmNotes: 'secret' })
  })
  it('coerces missing and non-string GM notes', () => {
    expect(toNpcGmNotes(undefined)).toBe('')
    expect(toNpcGmNotes({})).toBe('')
    expect(toNpcGmNotes({ gmNotes: 3 as unknown as string })).toBe('')
  })
  it('pins both media parameter sets', () => {
    expect(npcMediaUploadParams('token-icons')).toEqual({ collectionName: 'npcs', mediaKind: 'token-icons', maxWidth: 1024, maxHeight: 1024 })
    expect(npcMediaUploadParams('portraits')).toEqual({ collectionName: 'npcs', mediaKind: 'portraits', maxWidth: 600, maxHeight: 800 })
  })
})

import { useMemo, useState } from 'react'
import type { MapRecord, NpcSummary } from '../lib/types'

// The map's NPCs not yet preloaded into its scene, and which of them the picker
// shows. A pick that gets preloaded moves the picker on to the first one left.
export function useSceneNpcPicker(mapNpcs: NpcSummary[], sceneNpcIds: string[]) {
  const [pickerId, setPickerId] = useState('')
  const availableNpcs = useMemo(
    () => mapNpcs.filter((npc) => !sceneNpcIds.includes(npc.id)),
    [mapNpcs, sceneNpcIds],
  )
  const picked = availableNpcs.some((npc) => npc.id === pickerId)
  return {
    availableNpcs,
    pickerId: picked ? pickerId : availableNpcs[0]?.id ?? '',
    setPickerId,
  }
}

export type SceneNpcPicker = ReturnType<typeof useSceneNpcPicker>

// Every tag on the map's NPCs, sorted, for the scene NPC editor.
export function useAllNpcTags(mapNpcs: NpcSummary[]) {
  return useMemo(
    () => Array.from(new Set(mapNpcs.flatMap((npc) => npc.tags))).sort((a, b) => a.localeCompare(b)),
    [mapNpcs],
  )
}

// The selected map's preloaded scene NPCs, and the NPC it is presenting.
export function useSceneNpcs(mapNpcs: NpcSummary[], selectedMap: MapRecord | null) {
  const sceneNpcIds = selectedMap?.sceneNpcIds
  const presentedNpcId = selectedMap?.presentedNpcId
  const sceneNpcs = useMemo(
    () => mapNpcs.filter((npc) => sceneNpcIds?.includes(npc.id)),
    [mapNpcs, sceneNpcIds],
  )
  const presentedNpc = useMemo(
    () => mapNpcs.find((npc) => npc.id === presentedNpcId) ?? null,
    [mapNpcs, presentedNpcId],
  )
  return { sceneNpcs, presentedNpc }
}

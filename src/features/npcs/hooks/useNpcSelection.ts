import { useMemo, useState } from 'react'
import type { NpcRecord } from '../../../types/app'
import { findNpc } from '../lib/npcRecords'

// Keep the selection while its NPC is listed, otherwise fall back to the first.
const keepSelection = (npcs: NpcRecord[], current: string) => {
  if (npcs.length === 0) return ''
  return npcs.some((npc) => npc.id === current) ? current : npcs[0].id
}

// The selected NPC. The selection is re-checked whenever the list changes, so
// one that has just been added keeps waiting until its document arrives.
export function useNpcSelection(npcs: NpcRecord[]) {
  const [selectedNpcId, setSelectedNpcId] = useState('')
  const [checkedNpcs, setCheckedNpcs] = useState(npcs)
  if (checkedNpcs !== npcs) {
    setCheckedNpcs(npcs)
    setSelectedNpcId((current) => keepSelection(npcs, current))
  }
  const selectedNpc = useMemo(() => findNpc(npcs, selectedNpcId), [npcs, selectedNpcId])
  return { selectedNpcId, selectedNpc, setSelectedNpcId }
}

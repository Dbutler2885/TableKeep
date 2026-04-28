import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignCollectionRef } from '../campaign/firestorePaths'

export type EntitySummary = {
  id: string
  name: string
}

export function useEntityPickers(campaignId: string, groupId: string | null = null) {
  const [monsters, setMonsters] = useState<EntitySummary[]>([])
  const [npcs, setNpcs] = useState<EntitySummary[]>([])
  const [items, setItems] = useState<EntitySummary[]>([])

  useEffect(() => {
    if (!campaignId) return
    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'monsters'),
      (snap) => {
        setMonsters(
          snap.docs
            .map((d) => ({
              id: d.id,
              name: typeof d.data().name === 'string' ? d.data().name : 'Unnamed',
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      },
    )
    return () => unsub()
  }, [campaignId, groupId])

  useEffect(() => {
    if (!campaignId) return
    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'npcs'),
      (snap) => {
        setNpcs(
          snap.docs
            .map((d) => ({
              id: d.id,
              name: typeof d.data().name === 'string' ? d.data().name : 'Unnamed',
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      },
    )
    return () => unsub()
  }, [campaignId, groupId])

  useEffect(() => {
    if (!campaignId) return
    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'items'),
      (snap) => {
        setItems(
          snap.docs
            .map((d) => ({
              id: d.id,
              name: typeof d.data().name === 'string' ? d.data().name : 'Unnamed',
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      },
    )
    return () => unsub()
  }, [campaignId, groupId])

  return { monsters, npcs, items }
}

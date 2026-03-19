import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'

export type EntitySummary = {
  id: string
  name: string
}

export function useEntityPickers(campaignId: string) {
  const [monsters, setMonsters] = useState<EntitySummary[]>([])
  const [npcs, setNpcs] = useState<EntitySummary[]>([])
  const [items, setItems] = useState<EntitySummary[]>([])

  useEffect(() => {
    if (!campaignId) return
    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'monsters'),
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
  }, [campaignId])

  useEffect(() => {
    if (!campaignId) return
    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'npcs'),
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
  }, [campaignId])

  useEffect(() => {
    if (!campaignId) return
    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'items'),
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
  }, [campaignId])

  return { monsters, npcs, items }
}

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CharacterRecord } from '../../types/app'

export function useCharacters(campaignId: string | null, userId: string, setError: (message: string) => void) {
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')

  useEffect(() => {
    if (!campaignId) return

    let cancelled = false

    const loadCharacters = async () => {
      setCharactersLoading(true)
      try {
        const snap = await getDocs(collection(db, 'campaigns', campaignId, 'characters'))
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string
            ownerUserId?: string
            class?: string
            level?: number
          }

          return {
            id: docSnap.id,
            name: data.name ?? docSnap.id,
            ownerUserId: data.ownerUserId ?? '',
            className: data.class ?? 'Unknown',
            level: typeof data.level === 'number' ? data.level : 1,
            hpCurrent: typeof (data as { hpCurrent?: number }).hpCurrent === 'number'
              ? (data as { hpCurrent: number }).hpCurrent
              : 0,
            hpMax: typeof (data as { hpMax?: number }).hpMax === 'number'
              ? (data as { hpMax: number }).hpMax
              : 0,
            ac: typeof (data as { ac?: number }).ac === 'number' ? (data as { ac: number }).ac : 10,
            xp: typeof (data as { xp?: number }).xp === 'number' ? (data as { xp: number }).xp : 0,
          }
        })

        if (!cancelled) {
          setCharacters(next)

          if (next.length === 0) {
            setSelectedCharacterId('')
          } else {
            setSelectedCharacterId((current) => {
              const existing = next.find((character) => character.id === current)
              if (existing) return existing.id
              const owned = next.find((character) => character.ownerUserId === userId)
              return (owned ?? next[0]).id
            })
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load characters'
        if (!cancelled) {
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setCharactersLoading(false)
        }
      }
    }

    void loadCharacters()

    return () => {
      cancelled = true
    }
  }, [campaignId, userId, setError])

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  return {
    characters,
    charactersLoading,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CharacterRecord, Role, TokenIconConfig } from '../../types/app'

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

export function useCharacters(
  campaignId: string | null,
  userId: string,
  currentUsername: string,
  role: Role | null,
  setError: (message: string) => void,
) {
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)
  const charactersRef = useRef<CharacterRecord[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    charactersRef.current = characters
  }, [characters])

  useEffect(() => {
    if (!campaignId) {
      setCurrentCharacterId(null)
      return
    }

    const membershipRef = doc(db, 'users', userId, 'campaignMemberships', campaignId)
    const unsub = onSnapshot(
      membershipRef,
      (snap) => {
        const value = snap.data()?.currentCharacterId
        setCurrentCharacterId(typeof value === 'string' ? value : null)
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Unable to load current character'
        setError(message)
      },
    )

    return () => unsub()
  }, [campaignId, setError, userId])

  useEffect(() => {
    if (!campaignId || !role) return
    setCharactersLoading(true)

    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'characters'),
      (snap) => {
        const all = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string
            ownerUserId?: string
            ownerUsername?: string
            class?: string
            level?: number
          }

          return {
            id: docSnap.id,
            name: data.name ?? docSnap.id,
            ownerUserId: data.ownerUserId ?? '',
            ownerUsername:
              typeof data.ownerUsername === 'string'
                ? data.ownerUsername
                : ((data.ownerUserId ?? '') === userId ? currentUsername : null),
            className: data.class ?? '-',
            level: typeof data.level === 'number' ? data.level : 1,
            hpCurrent:
              typeof (data as { hpCurrent?: number }).hpCurrent === 'number'
                ? (data as { hpCurrent: number }).hpCurrent
                : 0,
            hpMax:
              typeof (data as { hpMax?: number }).hpMax === 'number'
                ? (data as { hpMax: number }).hpMax
                : 0,
            ac: typeof (data as { ac?: number }).ac === 'number' ? (data as { ac: number }).ac : 10,
            xp: typeof (data as { xp?: number }).xp === 'number' ? (data as { xp: number }).xp : 0,
            portraitUrl: typeof (data as { portraitUrl?: string | null }).portraitUrl === 'string'
              ? (data as { portraitUrl: string }).portraitUrl
              : null,
            portraitFocusX: typeof (data as { portraitFocusX?: number }).portraitFocusX === 'number'
              ? (data as { portraitFocusX: number }).portraitFocusX
              : 50,
            portraitFocusY: typeof (data as { portraitFocusY?: number }).portraitFocusY === 'number'
              ? (data as { portraitFocusY: number }).portraitFocusY
              : 50,
            tokenIcon: (data as { tokenIcon?: TokenIconConfig }).tokenIcon ?? defaultTokenIcon,
          }
        })

        const next = role === 'gm' ? all : all.filter((character) => character.ownerUserId === userId)
        setCharacters(next)
        setCharactersLoading(false)

        if (next.length === 0) {
          setSelectedCharacterId('')
          return
        }

        setSelectedCharacterId((current) => {
          const existing = next.find((character) => character.id === current)
          if (existing) return existing.id
          const currentCharacter = currentCharacterId
            ? next.find((character) => character.id === currentCharacterId)
            : null
          if (currentCharacter) return currentCharacter.id
          const owned = next.find((character) => character.ownerUserId === userId)
          return (owned ?? next[0]).id
        })
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Unable to load characters'
        setError(message)
        setCharactersLoading(false)
      },
    )

    return () => {
      unsub()
    }
  }, [campaignId, currentCharacterId, currentUsername, role, userId, setError])

  useEffect(() => {
    if (!campaignId || role !== 'player') return

    const ownedCharacters = characters.filter((character) => character.ownerUserId === userId)
    if (ownedCharacters.length === 0) return

    const hasValidCurrent = !!currentCharacterId && ownedCharacters.some((character) => character.id === currentCharacterId)
    if (hasValidCurrent) return

    const fallbackCharacterId = ownedCharacters[0].id
    void setCurrentCharacter(fallbackCharacterId)
  }, [campaignId, characters, currentCharacterId, role, userId])

  useEffect(() => {
    return () => {
      Object.values(pendingWritesRef.current).forEach((timer) => clearTimeout(timer))
      pendingWritesRef.current = {}
    }
  }, [])

  const scheduleCharacterWrite = (characterId: string) => {
    if (!campaignId) return
    const existing = pendingWritesRef.current[characterId]
    if (existing) clearTimeout(existing)

    pendingWritesRef.current[characterId] = setTimeout(() => {
      delete pendingWritesRef.current[characterId]
      const character = charactersRef.current.find((entry) => entry.id === characterId)
      if (!character) return

      void setDoc(
        doc(db, 'campaigns', campaignId, 'characters', characterId),
        {
          name: character.name,
          ownerUserId: character.ownerUserId,
          ownerUsername: character.ownerUsername ?? null,
          class: character.className,
          level: character.level,
          hpCurrent: character.hpCurrent,
          hpMax: character.hpMax,
          ac: character.ac,
          xp: character.xp,
          portraitUrl: character.portraitUrl,
          portraitFocusX: character.portraitFocusX,
          portraitFocusY: character.portraitFocusY,
          tokenIcon: character.tokenIcon,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }, 500)
  }

  const updateCharacter = (characterId: string, updates: Partial<CharacterRecord>) => {
    setCharacters((current) => {
      const target = current.find((character) => character.id === characterId)
      if (!target) return current
      const canEdit = role === 'gm' || target.ownerUserId === userId
      if (!canEdit) return current
      return current.map((character) =>
        character.id === characterId
          ? {
              ...character,
              ...updates,
            }
          : character,
      )
    })

    scheduleCharacterWrite(characterId)
  }

  const deleteCharacter = (characterId: string) => {
    if (!campaignId) return
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target) return
    const canDelete = role === 'gm'
    if (!canDelete) return

    const pending = pendingWritesRef.current[characterId]
    if (pending) {
      clearTimeout(pending)
      delete pendingWritesRef.current[characterId]
    }

    setCharacters((current) => {
      const next = current.filter((character) => character.id !== characterId)
      if (next.length === 0) {
        setSelectedCharacterId('')
      } else if (selectedCharacterId === characterId) {
        setSelectedCharacterId(next[0].id)
      }
      return next
    })

    void deleteDoc(doc(db, 'campaigns', campaignId, 'characters', characterId))
  }

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  const setCurrentCharacter = async (characterId: string) => {
    if (!campaignId || !role) return
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target) return
    if (role === 'player' && target.ownerUserId !== userId) return

    setCurrentCharacterId(characterId)

    await Promise.all([
      setDoc(
        doc(db, 'users', userId, 'campaignMemberships', campaignId),
        {
          campaignId,
          userId,
          role,
          status: 'active',
          currentCharacterId: characterId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
      setDoc(
        doc(db, 'campaigns', campaignId, 'members', userId),
        {
          userId,
          role,
          status: 'active',
          currentCharacterId: characterId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ])
  }

  return {
    characters,
    charactersLoading,
    currentCharacterId,
    setCurrentCharacter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    updateCharacter,
    deleteCharacter,
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CharacterRecord, CharacterSheetDetails, Role, TokenIconConfig } from '../../types/app'
import { isRenderableImageUrl, resolveStoragePathUrl, sanitizeTokenIconForPersistence } from '../common/mediaStorage'

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
  enabled = true,
) {
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)
  const [activePlayerIds, setActivePlayerIds] = useState<string[]>([])
  const charactersRef = useRef<CharacterRecord[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const inFlightWritesRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    charactersRef.current = characters
  }, [characters])

  useEffect(() => {
    if (!campaignId || !enabled) {
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
  }, [campaignId, enabled, setError, userId])

  useEffect(() => {
    if (!campaignId || !enabled) {
      setActivePlayerIds([])
      return
    }

    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'members'),
      (snap) => {
        const next = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as {
              userId?: string
              role?: Role
              status?: string
            }
            if (data.role !== 'player' || data.status !== 'active' || typeof data.userId !== 'string') return null
            return data.userId
          })
          .filter((entry): entry is string => entry !== null)
        setActivePlayerIds(next)
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Unable to load campaign members'
        setError(message)
      },
    )

    return () => unsub()
  }, [campaignId, enabled, setError])

  useEffect(() => {
    if (!campaignId || !role || !enabled) {
      setCharacters([])
      setCharactersLoading(false)
      return
    }
    setCharactersLoading(true)

    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'characters'),
      (snap) => {
        const all = snap.docs.map((docSnap) => {
          // Clobbering guard: keep local version if a write is pending
          if (pendingWritesRef.current[docSnap.id] || inFlightWritesRef.current[docSnap.id]) {
            const local = charactersRef.current.find((c) => c.id === docSnap.id)
            if (local) return local
          }

          const data = docSnap.data() as {
            name?: string
            ownerUserId?: string
            ownerUsername?: string
            creationMode?: 'new' | 'established'
            creationModeExplicit?: boolean
            creationStatus?: 'draft' | 'established_draft' | 'active'
            class?: string
            level?: number
          }
          const local = charactersRef.current.find((character) => character.id === docSnap.id)

          const creationModeExplicit = data.creationModeExplicit === true
          const creationMode: CharacterRecord['creationMode'] =
            creationModeExplicit && data.creationMode === 'established' ? 'established' : 'new'
          const creationStatus: CharacterRecord['creationStatus'] = data.creationStatus === 'draft'
            ? 'draft'
            : data.creationStatus === 'established_draft'
              ? 'established_draft'
              : data.creationStatus === 'active'
                ? 'active'
                : creationModeExplicit && creationMode === 'new'
                  ? 'draft'
                  : 'active'

          const rawDetails = (data as { details?: unknown }).details
          const details: CharacterSheetDetails | null =
            typeof rawDetails === 'object' && rawDetails !== null
              ? (rawDetails as CharacterSheetDetails)
              : null

          const rawHpCurrent =
            typeof (data as { hpCurrent?: number }).hpCurrent === 'number'
              ? (data as { hpCurrent: number }).hpCurrent
              : 0
          const rawHpMax =
            typeof (data as { hpMax?: number }).hpMax === 'number'
              ? (data as { hpMax: number }).hpMax
              : 0
          const hpMax = Math.max(0, rawHpMax)
          const hpCurrent = Math.max(0, Math.min(rawHpCurrent, hpMax))
          const portraitPath = typeof (data as { portraitPath?: string }).portraitPath === 'string'
            ? (data as { portraitPath: string }).portraitPath
            : ''
          const persistedPortraitUrl = typeof (data as { portraitUrl?: string | null }).portraitUrl === 'string'
            ? (data as { portraitUrl: string }).portraitUrl
            : null
          const tokenIcon = (data as { tokenIcon?: TokenIconConfig }).tokenIcon ?? defaultTokenIcon
          const portraitUrl = persistedPortraitUrl
            ?? (local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null)
          const customImageUrl = tokenIcon.customImageUrl
            ?? (
              local?.tokenIcon.customImagePath
              && local.tokenIcon.customImagePath === tokenIcon.customImagePath
              && isRenderableImageUrl(local.tokenIcon.customImageUrl)
                ? local.tokenIcon.customImageUrl
                : undefined
            )

          return {
            id: docSnap.id,
            name: data.name ?? docSnap.id,
            ownerUserId: data.ownerUserId ?? '',
            ownerUsername:
              typeof data.ownerUsername === 'string'
                ? data.ownerUsername
                : ((data.ownerUserId ?? '') === userId ? currentUsername : null),
            creationMode,
            creationModeExplicit,
            creationStatus,
            className: data.class ?? '-',
            level: typeof data.level === 'number' ? data.level : 1,
            hpCurrent,
            hpMax,
            ac: typeof (data as { ac?: number }).ac === 'number' ? (data as { ac: number }).ac : 10,
            xp: typeof (data as { xp?: number }).xp === 'number' ? (data as { xp: number }).xp : 0,
            portraitPath,
            portraitUrl,
            portraitFocusX: typeof (data as { portraitFocusX?: number }).portraitFocusX === 'number'
              ? (data as { portraitFocusX: number }).portraitFocusX
              : 50,
            portraitFocusY: typeof (data as { portraitFocusY?: number }).portraitFocusY === 'number'
              ? (data as { portraitFocusY: number }).portraitFocusY
              : 50,
            tokenIcon: customImageUrl
              ? {
                  ...tokenIcon,
                  customImageUrl,
                }
              : tokenIcon,
            details,
          }
        })

        const next = role === 'gm'
          ? all
          : all.filter((character) => activePlayerIds.includes(character.ownerUserId))
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
  }, [activePlayerIds, campaignId, currentCharacterId, currentUsername, enabled, role, userId, setError])

  useEffect(() => {
    const charactersNeedingMedia = characters.filter((character) =>
      (character.portraitPath && !isRenderableImageUrl(character.portraitUrl))
      || (character.tokenIcon.customImagePath && !isRenderableImageUrl(character.tokenIcon.customImageUrl)),
    )
    if (charactersNeedingMedia.length === 0) return

    void Promise.allSettled(
      charactersNeedingMedia.map(async (character) => {
        const [portraitUrl, customImageUrl] = await Promise.all([
          character.portraitPath ? resolveStoragePathUrl(character.portraitPath) : Promise.resolve<string | null>(null),
          character.tokenIcon.customImagePath ? resolveStoragePathUrl(character.tokenIcon.customImagePath) : Promise.resolve<string | null>(null),
        ])

        setCharacters((current) =>
          current.map((entry) =>
            entry.id === character.id
              ? {
                  ...entry,
                  ...(portraitUrl ? { portraitUrl } : {}),
                  ...(customImageUrl
                    ? {
                        tokenIcon: {
                          ...entry.tokenIcon,
                          customImageUrl,
                        },
                      }
                    : {}),
                }
              : entry,
          ),
        )
      }),
    )
  }, [characters])

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
      inFlightWritesRef.current = {}
    }
  }, [])

  const scheduleCharacterWrite = (characterId: string) => {
    if (!campaignId) return
    const existing = pendingWritesRef.current[characterId]
    if (existing) clearTimeout(existing)

    pendingWritesRef.current[characterId] = setTimeout(() => {
      delete pendingWritesRef.current[characterId]
      inFlightWritesRef.current[characterId] = true
      const character = charactersRef.current.find((entry) => entry.id === characterId)
      if (!character) {
        delete inFlightWritesRef.current[characterId]
        return
      }

      void setDoc(
        doc(db, 'campaigns', campaignId, 'characters', characterId),
        {
          name: character.name,
          ownerUserId: character.ownerUserId,
          ownerUsername: character.ownerUsername ?? null,
          creationMode: character.creationMode,
          creationModeExplicit: character.creationModeExplicit,
          creationStatus: character.creationStatus,
          class: character.className,
          level: character.level,
          hpCurrent: character.hpCurrent,
          hpMax: character.hpMax,
          ac: character.ac,
          xp: character.xp,
          portraitPath: character.portraitPath ?? '',
          portraitFocusX: character.portraitFocusX,
          portraitFocusY: character.portraitFocusY,
          tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
          details: character.details ? JSON.parse(JSON.stringify(character.details)) : null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).finally(() => {
        delete inFlightWritesRef.current[characterId]
      })
    }, 500)
  }

  const updateCharacter = (characterId: string, updates: Partial<CharacterRecord>) => {
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target) return
    const canEdit = role === 'gm' || target.ownerUserId === userId
    if (!canEdit) return
    const nextUpdates = { ...updates }
    const nextHpMax = typeof nextUpdates.hpMax === 'number'
      ? Math.max(0, nextUpdates.hpMax)
      : Math.max(0, target.hpMax)
    if (typeof nextUpdates.hpMax === 'number') {
      nextUpdates.hpMax = nextHpMax
    }
    if (typeof nextUpdates.hpCurrent === 'number') {
      nextUpdates.hpCurrent = Math.max(0, Math.min(nextUpdates.hpCurrent, nextHpMax))
    }

    const nextCharacters = charactersRef.current.map((character) =>
      character.id === characterId
        ? {
            ...character,
            ...nextUpdates,
          }
        : character,
    )
    charactersRef.current = nextCharacters
    setCharacters(nextCharacters)

    scheduleCharacterWrite(characterId)
  }

  const syncCharacterLocal = (characterId: string, updates: Partial<CharacterRecord>) => {
    setCharacters((current) =>
      current.map((character) =>
        character.id === characterId
          ? {
              ...character,
              ...updates,
            }
          : character,
      ),
    )
  }

  const deleteCharacter = (characterId: string) => {
    if (!campaignId) return
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target) return
    const canDelete = role === 'gm' || target.ownerUserId === userId
    if (!canDelete) return

    const pending = pendingWritesRef.current[characterId]
    if (pending) {
      clearTimeout(pending)
      delete pendingWritesRef.current[characterId]
    }
    delete inFlightWritesRef.current[characterId]

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

  const hasPendingWrite = (id: string) => !!pendingWritesRef.current[id] || !!inFlightWritesRef.current[id]

  return {
    characters,
    charactersLoading,
    currentCharacterId,
    setCurrentCharacter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    updateCharacter,
    syncCharacterLocal,
    deleteCharacter,
    hasPendingWrite,
  }
}

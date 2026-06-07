import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { Role, TokenIconConfig } from '../../types/app'
import { campaignCollectionRef, campaignDocRef, campaignUserStateRef } from '../campaign/firestorePaths'
import { isRenderableImageUrl, resolveStoragePathUrl, sanitizeTokenIconForPersistence } from '../common/mediaStorage'
import { defaultVtmSheet, defaultVtmTokenIcon, makeVtmCharacter } from './vtmDefaults'
import type { VtmCharacterRecord, VtmCharacterSheet } from './vtmTypes'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const mergeObject = <T extends Record<string, unknown>>(defaults: T, raw: unknown): T => {
  if (!isRecord(raw)) return defaults
  return { ...defaults, ...raw } as T
}

const normalizeSheet = (raw: unknown): VtmCharacterSheet => {
  const defaults = defaultVtmSheet()
  if (!isRecord(raw)) return defaults
  return {
    ...defaults,
    ...raw,
    attributes: {
      physical: mergeObject(defaults.attributes.physical, raw.attributes && isRecord(raw.attributes) ? raw.attributes.physical : null),
      social: mergeObject(defaults.attributes.social, raw.attributes && isRecord(raw.attributes) ? raw.attributes.social : null),
      mental: mergeObject(defaults.attributes.mental, raw.attributes && isRecord(raw.attributes) ? raw.attributes.mental : null),
    },
    abilities: {
      talents: mergeObject(defaults.abilities.talents, raw.abilities && isRecord(raw.abilities) ? raw.abilities.talents : null),
      skills: mergeObject(defaults.abilities.skills, raw.abilities && isRecord(raw.abilities) ? raw.abilities.skills : null),
      knowledges: mergeObject(defaults.abilities.knowledges, raw.abilities && isRecord(raw.abilities) ? raw.abilities.knowledges : null),
    },
    attributePriority: mergeObject(defaults.attributePriority, raw.attributePriority),
    abilityPriority: mergeObject(defaults.abilityPriority, raw.abilityPriority),
    virtues: mergeObject(defaults.virtues, raw.virtues),
    health: mergeObject(defaults.health, raw.health),
    expandedBackground: mergeObject(defaults.expandedBackground, raw.expandedBackground),
    possessions: mergeObject(defaults.possessions, raw.possessions),
    appearance: mergeObject(defaults.appearance, raw.appearance),
    disciplines: Array.isArray(raw.disciplines) ? raw.disciplines as VtmCharacterSheet['disciplines'] : defaults.disciplines,
    backgrounds: Array.isArray(raw.backgrounds) ? raw.backgrounds as VtmCharacterSheet['backgrounds'] : defaults.backgrounds,
    otherTraits: Array.isArray(raw.otherTraits) ? raw.otherTraits as VtmCharacterSheet['otherTraits'] : defaults.otherTraits,
    rituals: Array.isArray(raw.rituals) ? raw.rituals as VtmCharacterSheet['rituals'] : defaults.rituals,
    bloodBonds: Array.isArray(raw.bloodBonds) ? raw.bloodBonds as VtmCharacterSheet['bloodBonds'] : defaults.bloodBonds,
    havens: Array.isArray(raw.havens) ? raw.havens as VtmCharacterSheet['havens'] : defaults.havens,
    combatWeapons: Array.isArray(raw.combatWeapons) ? raw.combatWeapons as VtmCharacterSheet['combatWeapons'] : defaults.combatWeapons,
    armor: Array.isArray(raw.armor) ? raw.armor as VtmCharacterSheet['armor'] : defaults.armor,
    xpLedger: Array.isArray(raw.xpLedger) ? raw.xpLedger as VtmCharacterSheet['xpLedger'] : defaults.xpLedger,
  }
}

export function useVtmCharacters(
  campaignId: string | null,
  groupId: string | null,
  userId: string,
  currentUsername: string,
  role: Role | null,
  gmUserId: string | null,
  setError: (message: string) => void,
  enabled = true,
) {
  const [characters, setCharacters] = useState<VtmCharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)
  const charactersRef = useRef<VtmCharacterRecord[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const inFlightWritesRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    charactersRef.current = characters
  }, [characters])

  useEffect(() => {
    if (!campaignId || !groupId || !enabled) {
      queueMicrotask(() => setCurrentCharacterId(null))
      return
    }
    const unsub = onSnapshot(
      campaignUserStateRef(db, { campaignId, groupId }, userId),
      (snap) => {
        const value = snap.data()?.currentCharacterId
        setCurrentCharacterId(typeof value === 'string' ? value : null)
      },
      (err) => setError(err instanceof Error ? err.message : 'Unable to load current character'),
    )
    return () => unsub()
  }, [campaignId, enabled, groupId, setError, userId])

  useEffect(() => {
    if (!campaignId || !groupId || !role || !enabled) {
      queueMicrotask(() => {
        setCharacters([])
        setCharactersLoading(false)
      })
      return
    }
    queueMicrotask(() => setCharactersLoading(true))
    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'characters'),
      (snap) => {
        const all = snap.docs
          .map((docSnap) => {
            if (pendingWritesRef.current[docSnap.id] || inFlightWritesRef.current[docSnap.id]) {
              const local = charactersRef.current.find((character) => character.id === docSnap.id)
              if (local) return local
            }
            const data = docSnap.data() as Record<string, unknown>
            if (data.system !== 'vtm') return null
            const local = charactersRef.current.find((character) => character.id === docSnap.id)
            const tokenIcon = (isRecord(data.tokenIcon) ? data.tokenIcon : defaultVtmTokenIcon) as TokenIconConfig
            const portraitPath = typeof data.portraitPath === 'string' ? data.portraitPath : ''
            const persistedPortraitUrl = typeof data.portraitUrl === 'string' ? data.portraitUrl : null
            const portraitUrl = persistedPortraitUrl
              ?? (local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null)
            const customImageUrl = tokenIcon.customImageUrl
              ?? (
                tokenIcon.customImagePath
                && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
                && isRenderableImageUrl(local.tokenIcon.customImageUrl)
                  ? local.tokenIcon.customImageUrl
                  : undefined
              )
            const creationMode = data.creationMode === 'established' ? 'established' : 'new'
            const creationStatus = data.creationStatus === 'draft' || data.creationStatus === 'established_draft' || data.creationStatus === 'active'
              ? data.creationStatus
              : creationMode === 'new'
                ? 'draft'
                : 'established_draft'
            return {
              id: docSnap.id,
              system: 'vtm' as const,
              name: typeof data.name === 'string' ? data.name : 'New Vampire',
              ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : '',
              ownerUsername: typeof data.ownerUsername === 'string' ? data.ownerUsername : null,
              creationMode,
              creationModeExplicit: data.creationModeExplicit === true,
              creationStatus,
              xp: typeof data.xp === 'number' ? data.xp : 0,
              portraitPath,
              portraitUrl,
              portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
              portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
              tokenIcon: customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon,
              vtm: normalizeSheet(data.vtm),
            }
          })
          .filter((character): character is VtmCharacterRecord => character !== null)
        const next = role === 'gm' ? all : all.filter((character) => character.ownerUserId !== gmUserId)
        setCharacters(next)
        setCharactersLoading(false)
        setSelectedCharacterId((current) => {
          if (next.some((character) => character.id === current)) return current
          const currentCharacter = currentCharacterId ? next.find((character) => character.id === currentCharacterId) : null
          if (currentCharacter) return currentCharacter.id
          return (next.find((character) => character.ownerUserId === userId) ?? next[0])?.id ?? ''
        })
      },
      (err) => {
        setError(err instanceof Error ? err.message : 'Unable to load VtM characters')
        setCharactersLoading(false)
      },
    )
    return () => unsub()
  }, [campaignId, currentCharacterId, enabled, gmUserId, groupId, role, setError, userId])

  useEffect(() => {
    const charactersNeedingMedia = characters.filter((character) =>
      (character.portraitPath && !isRenderableImageUrl(character.portraitUrl))
      || (character.tokenIcon.customImagePath && !isRenderableImageUrl(character.tokenIcon.customImageUrl)),
    )
    if (charactersNeedingMedia.length === 0) return
    void Promise.allSettled(charactersNeedingMedia.map(async (character) => {
      const [portraitUrl, customImageUrl] = await Promise.all([
        character.portraitPath ? resolveStoragePathUrl(character.portraitPath) : Promise.resolve<string | null>(null),
        character.tokenIcon.customImagePath ? resolveStoragePathUrl(character.tokenIcon.customImagePath) : Promise.resolve<string | null>(null),
      ])
      setCharacters((current) => current.map((entry) => entry.id === character.id
        ? {
            ...entry,
            ...(portraitUrl ? { portraitUrl } : {}),
            ...(customImageUrl ? { tokenIcon: { ...entry.tokenIcon, customImageUrl } } : {}),
          }
        : entry))
    }))
  }, [characters])

  useEffect(() => {
    return () => {
      Object.values(pendingWritesRef.current).forEach((timer) => clearTimeout(timer))
      pendingWritesRef.current = {}
      inFlightWritesRef.current = {}
    }
  }, [])

  const scheduleCharacterWrite = (characterId: string) => {
    if (!campaignId || !groupId) return
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
        campaignDocRef(db, { campaignId, groupId }, 'characters', characterId),
        {
          system: 'vtm',
          name: character.name,
          ownerUserId: character.ownerUserId,
          ownerUsername: character.ownerUsername ?? null,
          creationMode: character.creationMode,
          creationModeExplicit: character.creationModeExplicit,
          creationStatus: character.creationStatus,
          xp: character.xp,
          portraitPath: character.portraitPath ?? '',
          portraitFocusX: character.portraitFocusX,
          portraitFocusY: character.portraitFocusY,
          tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
          vtm: JSON.parse(JSON.stringify(character.vtm)) as unknown,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).finally(() => {
        delete inFlightWritesRef.current[characterId]
      })
    }, 500)
  }

  const updateCharacter = (characterId: string, updates: Partial<VtmCharacterRecord>) => {
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target) return
    if (role !== 'gm' && target.ownerUserId !== userId) return
    const next = charactersRef.current.map((character) =>
      character.id === characterId ? { ...character, ...updates } : character,
    )
    charactersRef.current = next
    setCharacters(next)
    scheduleCharacterWrite(characterId)
  }

  const addCharacter = async (creationMode: 'new' | 'established') => {
    if (!campaignId || !groupId || !role) return
    if (role !== 'gm' && charactersRef.current.some((character) => character.ownerUserId === userId)) return
    const character = makeVtmCharacter(userId, currentUsername, creationMode)
    setSelectedCharacterId(character.id)
    setCharacters((current) => [...current, character])
    await setDoc(campaignDocRef(db, { campaignId, groupId }, 'characters', character.id), {
      system: 'vtm',
      name: character.name,
      ownerUserId: character.ownerUserId,
      ownerUsername: character.ownerUsername ?? null,
      creationMode: character.creationMode,
      creationModeExplicit: character.creationModeExplicit,
      creationStatus: character.creationStatus,
      xp: character.xp,
      portraitPath: '',
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
      vtm: character.vtm,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const deleteCharacter = (characterId: string) => {
    if (!campaignId || !groupId) return
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target || (role !== 'gm' && target.ownerUserId !== userId)) return
    setCharacters((current) => current.filter((character) => character.id !== characterId))
    void deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'characters', characterId))
  }

  const setCurrentCharacter = async (characterId: string) => {
    if (!campaignId || !groupId || !role) return
    const target = charactersRef.current.find((character) => character.id === characterId)
    if (!target || (role === 'player' && target.ownerUserId !== userId)) return
    setCurrentCharacterId(characterId)
    await setDoc(
      campaignUserStateRef(db, { campaignId, groupId }, userId),
      { currentCharacterId: characterId, updatedAt: serverTimestamp() },
      { merge: true },
    )
  }

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  return {
    characters,
    charactersLoading,
    currentCharacterId,
    setCurrentCharacter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    addCharacter,
    updateCharacter,
    deleteCharacter,
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type {
  CharacterAbilityScores,
  CharacterAdventureScores,
  CharacterRecord,
  CharacterSaveScores,
  CharacterThiefSkills,
  CharacterWeaponRow,
  Role,
  TokenIconConfig,
} from '../../types/app'

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

const emptyAbilityScores = (): CharacterAbilityScores => ({
  STR: '',
  INT: '',
  WIS: '',
  DEX: '',
  CON: '',
  CHA: '',
})

const emptySaveScores = (): CharacterSaveScores => ({
  D: '',
  W: '',
  P: '',
  B: '',
  S: '',
})

const emptyAdventureScores = (): CharacterAdventureScores => ({
  FG: '1',
  FT: '1',
  HT: '1',
  LD: '1',
  SD: '1',
})

const emptyThiefSkills = (): CharacterThiefSkills => ({
  CS: '1',
  TR: '1',
  HN: '1',
  HS: '1',
  MS: '1',
  OL: '1',
  PP: '1',
  RL: '1',
})

export function useCharacters(
  campaignId: string | null,
  userId: string,
  role: Role | null,
  setError: (message: string) => void,
) {
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const charactersRef = useRef<CharacterRecord[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const creatingStarterRef = useRef(false)

  useEffect(() => {
    charactersRef.current = characters
  }, [characters])

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
            class?: string
            level?: number
          }

          return {
            id: docSnap.id,
            name: data.name ?? docSnap.id,
            title: typeof (data as { title?: string }).title === 'string' ? (data as { title: string }).title : '',
            ownerUserId: data.ownerUserId ?? '',
            className: data.class ?? '-',
            alignment: typeof (data as { alignment?: string }).alignment === 'string'
              ? (data as { alignment: string }).alignment
              : 'Neutrality',
            level: typeof data.level === 'number' ? data.level : 1,
            hpCurrent:
              typeof (data as { hpCurrent?: number }).hpCurrent === 'number'
                ? (data as { hpCurrent: number }).hpCurrent
                : 0,
            hpMax:
              typeof (data as { hpMax?: number }).hpMax === 'number'
                ? (data as { hpMax: number }).hpMax
                : 0,
            hpBaseRoll: typeof (data as { hpBaseRoll?: number }).hpBaseRoll === 'number'
              ? (data as { hpBaseRoll: number }).hpBaseRoll
              : undefined,
            ac: typeof (data as { ac?: number }).ac === 'number' ? (data as { ac: number }).ac : 10,
            acManualOverride: typeof (data as { acManualOverride?: boolean }).acManualOverride === 'boolean'
              ? (data as { acManualOverride: boolean }).acManualOverride
              : false,
            xp: typeof (data as { xp?: number }).xp === 'number' ? (data as { xp: number }).xp : 0,
            xpNext: typeof (data as { xpNext?: string }).xpNext === 'string' ? (data as { xpNext: string }).xpNext : '',
            xpPrimeModifier: typeof (data as { xpPrimeModifier?: string }).xpPrimeModifier === 'string'
              ? (data as { xpPrimeModifier: string }).xpPrimeModifier
              : '',
            thaco: typeof (data as { thaco?: string }).thaco === 'string' ? (data as { thaco: string }).thaco : '',
            abilityScores: (data as { abilityScores?: CharacterAbilityScores }).abilityScores ?? emptyAbilityScores(),
            rolledAbilityScores:
              (data as { rolledAbilityScores?: CharacterAbilityScores }).rolledAbilityScores ?? emptyAbilityScores(),
            abilityScoresRolled: typeof (data as { abilityScoresRolled?: boolean }).abilityScoresRolled === 'boolean'
              ? (data as { abilityScoresRolled: boolean }).abilityScoresRolled
              : false,
            saveScores: (data as { saveScores?: CharacterSaveScores }).saveScores ?? emptySaveScores(),
            adventureScores:
              (data as { adventureScores?: CharacterAdventureScores }).adventureScores ?? emptyAdventureScores(),
            adventureSeedClass:
              typeof (data as { adventureSeedClass?: string }).adventureSeedClass === 'string'
                ? (data as { adventureSeedClass: string }).adventureSeedClass
                : '',
            thiefSkills: (data as { thiefSkills?: CharacterThiefSkills }).thiefSkills ?? emptyThiefSkills(),
            aswNotes: typeof (data as { aswNotes?: string }).aswNotes === 'string' ? (data as { aswNotes: string }).aswNotes : '',
            languages:
              typeof (data as { languages?: string }).languages === 'string' ? (data as { languages: string }).languages : '',
            unencumberingItems:
              typeof (data as { unencumberingItems?: string }).unencumberingItems === 'string'
                ? (data as { unencumberingItems: string }).unencumberingItems
                : '',
            equippedItems:
              Array.isArray((data as { equippedItems?: string[] }).equippedItems)
                ? (data as { equippedItems: string[] }).equippedItems
                : [],
            packedItems:
              Array.isArray((data as { packedItems?: string[] }).packedItems)
                ? (data as { packedItems: string[] }).packedItems
                : [],
            otherNotes:
              typeof (data as { otherNotes?: string }).otherNotes === 'string' ? (data as { otherNotes: string }).otherNotes : '',
            weapons:
              Array.isArray((data as { weapons?: CharacterWeaponRow[] }).weapons)
                ? (data as { weapons: CharacterWeaponRow[] }).weapons
                : [],
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
          if (role !== 'gm' && !creatingStarterRef.current) {
            creatingStarterRef.current = true
            const starterId = crypto.randomUUID()
            void setDoc(doc(db, 'campaigns', campaignId, 'characters', starterId), {
              name: 'New Character',
              ownerUserId: userId,
              class: '-',
              level: 1,
              title: '',
              alignment: 'Neutrality',
              hpCurrent: 0,
              hpMax: 0,
              hpBaseRoll: 0,
              ac: 10,
              acManualOverride: false,
              xp: 0,
              xpNext: '',
              xpPrimeModifier: '',
              thaco: '',
              abilityScores: emptyAbilityScores(),
              rolledAbilityScores: emptyAbilityScores(),
              abilityScoresRolled: false,
              saveScores: emptySaveScores(),
              adventureScores: emptyAdventureScores(),
              adventureSeedClass: '-',
              thiefSkills: emptyThiefSkills(),
              aswNotes: '',
              languages: '',
              unencumberingItems: '',
              equippedItems: [],
              packedItems: [],
              otherNotes: '',
              weapons: [],
              portraitUrl: null,
              portraitFocusX: 50,
              portraitFocusY: 50,
              tokenIcon: defaultTokenIcon,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }).catch((err: unknown) => {
              const message = err instanceof Error ? err.message : 'Unable to create starter character'
              setError(message)
              creatingStarterRef.current = false
            })
          }
          setSelectedCharacterId('')
          return
        }

        creatingStarterRef.current = false

        setSelectedCharacterId((current) => {
          const existing = next.find((character) => character.id === current)
          if (existing) return existing.id
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
  }, [campaignId, role, userId, setError])

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
          class: character.className,
          level: character.level,
          title: character.title ?? '',
          alignment: character.alignment ?? 'Neutrality',
          hpCurrent: character.hpCurrent,
          hpMax: character.hpMax,
          hpBaseRoll: character.hpBaseRoll ?? 0,
          ac: character.ac,
          acManualOverride: character.acManualOverride ?? false,
          xp: character.xp,
          xpNext: character.xpNext ?? '',
          xpPrimeModifier: character.xpPrimeModifier ?? '',
          thaco: character.thaco ?? '',
          abilityScores: character.abilityScores ?? emptyAbilityScores(),
          rolledAbilityScores: character.rolledAbilityScores ?? emptyAbilityScores(),
          abilityScoresRolled: character.abilityScoresRolled ?? false,
          saveScores: character.saveScores ?? emptySaveScores(),
          adventureScores: character.adventureScores ?? emptyAdventureScores(),
          adventureSeedClass: character.adventureSeedClass ?? character.className,
          thiefSkills: character.thiefSkills ?? emptyThiefSkills(),
          aswNotes: character.aswNotes ?? '',
          languages: character.languages ?? '',
          unencumberingItems: character.unencumberingItems ?? '',
          equippedItems: character.equippedItems ?? [],
          packedItems: character.packedItems ?? [],
          otherNotes: character.otherNotes ?? '',
          weapons: character.weapons ?? [],
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

  return {
    characters,
    charactersLoading,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    updateCharacter,
    deleteCharacter,
  }
}

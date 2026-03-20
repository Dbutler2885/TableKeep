import { useEffect, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CampaignItem, WeaponEffect, WeaponRollTable, WeaponRollTableEntry } from '../../types/app'
import { isRenderableImageUrl, resolveStoragePathUrl, sanitizeTokenIconForPersistence } from '../common/mediaStorage'

const defaultWeaponStats: CampaignItem['weaponStats'] = {
  damageDiceCount: '',
  damageDiceSides: '',
  attackBonus: '',
  damageBonus: '',
  rangeShort: '',
  rangeMedium: '',
  rangeLong: '',
  slow: false,
  twoHanded: false,
}

const defaultArmourStats: CampaignItem['armourStats'] = {
  armourClass: '',
  shieldMod: '',
  magicMod: '',
  armourType: 'body',
}

const defaultConsumableStats: CampaignItem['consumableStats'] = {
  useMode: 'consume',
  effectText: '',
}

const normalizeWeaponRollTableEntries = (value: unknown): WeaponRollTableEntry[] => {
  if (!Array.isArray(value)) return []
  return value.map((entry, index) => {
    const source = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {}
    return {
      id: typeof source.id === 'string' ? source.id : `entry-${index + 1}`,
      roll: typeof source.roll === 'string' ? source.roll : '',
      text: typeof source.text === 'string' ? source.text : '',
    }
  })
}

const normalizeWeaponEffects = (value: unknown): WeaponEffect[] => {
  if (!Array.isArray(value)) return []
  return value.map((effect, index) => {
    const source = (effect && typeof effect === 'object') ? effect as Record<string, unknown> : {}
    const conditionValues = Array.isArray(source.conditionValues)
      ? source.conditionValues.filter((entry): entry is string => typeof entry === 'string')
      : typeof source.conditionValue === 'string' && source.conditionValue.trim()
        ? source.conditionValue.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
        : []
    return {
      id: typeof source.id === 'string' ? source.id : `effect-${index + 1}`,
      trigger: source.trigger === 'passive' || source.trigger === 'on_hit' || source.trigger === 'on_crit' || source.trigger === 'versus_target'
        ? source.trigger
        : 'passive',
      conditionType: source.conditionType === 'alignment' || source.conditionType === 'armour_state' || source.conditionType === 'creature_type' || source.conditionType === 'custom'
        ? source.conditionType
        : 'none',
      conditionValues,
      outcomeType:
        source.outcomeType === 'attack_bonus'
        || source.outcomeType === 'damage_bonus'
        || source.outcomeType === 'replace_damage'
        || source.outcomeType === 'extra_damage'
        || source.outcomeType === 'roll_table'
        || source.outcomeType === 'grant_trait'
        || source.outcomeType === 'show_text'
          ? source.outcomeType
          : 'show_text',
      outcomeValue: typeof source.outcomeValue === 'string' ? source.outcomeValue : '',
      notes: typeof source.notes === 'string' ? source.notes : '',
    }
  })
}

const normalizeWeaponRollTables = (value: unknown): WeaponRollTable[] => {
  if (!Array.isArray(value)) return []
  return value.map((table, index) => {
    const source = (table && typeof table === 'object') ? table as Record<string, unknown> : {}
    return {
      id: typeof source.id === 'string' ? source.id : `table-${index + 1}`,
      name: typeof source.name === 'string' ? source.name : '',
      dieSides: typeof source.dieSides === 'string' ? source.dieSides : '',
      entries: normalizeWeaponRollTableEntries(source.entries),
    }
  })
}

const normalizeWeaponStats = (value: unknown): CampaignItem['weaponStats'] => {
  const source = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
  const toText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
  return {
    damageDiceCount: toText(source.damageDiceCount),
    damageDiceSides: toText(source.damageDiceSides),
    attackBonus: toText(source.attackBonus),
    damageBonus: toText(source.damageBonus),
    rangeShort: toText(source.rangeShort),
    rangeMedium: toText(source.rangeMedium),
    rangeLong: toText(source.rangeLong),
    slow: source.slow === true,
    twoHanded: source.twoHanded === true,
  }
}

const normalizeArmourStats = (value: unknown): CampaignItem['armourStats'] => {
  const source = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
  const toText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
  return {
    armourClass: toText(source.armourClass),
    shieldMod: toText(source.shieldMod),
    magicMod: toText(source.magicMod),
    armourType: source.armourType === 'shield' ? 'shield' : 'body',
  }
}

const normalizeConsumableStats = (value: unknown): CampaignItem['consumableStats'] => {
  const source = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
  return {
    useMode: source.useMode === 'use' ? 'use' : 'consume',
    effectText: typeof source.effectText === 'string' ? source.effectText : '',
  }
}

const normalizeCampaignItem = (id: string, data: Record<string, unknown>): CampaignItem => {
  const type = data.type === 'weapon' || data.type === 'armour' || data.type === 'ammunition' || data.type === 'consumable' || data.type === 'general' || data.type === 'gold' || data.type === 'treasure'
    ? data.type
    : 'general'
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    type,
    typeId: typeof data.typeId === 'string' ? data.typeId : 'custom',
    typeName: typeof data.typeName === 'string' ? data.typeName : (typeof data.name === 'string' ? data.name : 'Item'),
    status: data.status === 'dropped' ? 'dropped' : 'authored',
    droppedByCharacterId: typeof data.droppedByCharacterId === 'string' ? data.droppedByCharacterId : undefined,
    droppedByCharacterName: typeof data.droppedByCharacterName === 'string' ? data.droppedByCharacterName : undefined,
    portraitPath: typeof data.portraitPath === 'string' ? data.portraitPath : '',
    portraitUrl: typeof data.portraitUrl === 'string' ? data.portraitUrl : null,
    portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
    portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
    tokenIcon: data.tokenIcon && typeof data.tokenIcon === 'object'
      ? data.tokenIcon as CampaignItem['tokenIcon']
      : { icon: 'pawn', color: '#bf2f2a', size: 34 },
    description: typeof data.description === 'string' ? data.description : '',
    gpValue: typeof data.gpValue === 'string' ? data.gpValue : typeof data.gpValue === 'number' ? String(data.gpValue) : '',
    qty: typeof data.qty === 'string' ? data.qty : typeof data.qty === 'number' ? String(data.qty) : '1',
    isMagic: data.isMagic === true,
    weaponStats: normalizeWeaponStats(data.weaponStats),
    weaponEffects: normalizeWeaponEffects(data.weaponEffects),
    weaponRollTables: normalizeWeaponRollTables(data.weaponRollTables),
    armourStats: normalizeArmourStats(data.armourStats),
    consumableStats: normalizeConsumableStats(data.consumableStats),
    specialRule: typeof data.specialRule === 'string' ? data.specialRule : '',
    notes: typeof data.notes === 'string' ? data.notes : '',
    ...(typeof data.goldAmount === 'number' ? { goldAmount: data.goldAmount } : {}),
  }
}

export const toFirestoreItem = (item: CampaignItem): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    name: item.name,
    type: item.type,
    typeId: item.typeId,
    typeName: item.typeName,
    status: item.status,
    portraitPath: item.portraitPath ?? '',
    portraitFocusX: item.portraitFocusX,
    portraitFocusY: item.portraitFocusY,
    tokenIcon: sanitizeTokenIconForPersistence(item.tokenIcon),
    description: item.description,
    gpValue: item.gpValue,
    qty: item.qty,
    isMagic: item.isMagic,
    weaponStats: { ...defaultWeaponStats, ...item.weaponStats },
    weaponEffects: item.weaponEffects,
    weaponRollTables: item.weaponRollTables,
    armourStats: { ...defaultArmourStats, ...item.armourStats },
    consumableStats: { ...defaultConsumableStats, ...item.consumableStats },
    specialRule: item.specialRule,
    notes: item.notes,
  }

  if (item.droppedByCharacterId) payload.droppedByCharacterId = item.droppedByCharacterId
  if (item.droppedByCharacterName) payload.droppedByCharacterName = item.droppedByCharacterName
  if (typeof item.goldAmount === 'number') payload.goldAmount = item.goldAmount

  return payload
}

export function useItems(campaignId: string) {
  const [items, setItems] = useState<CampaignItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const itemsRef = useRef<CampaignItem[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    if (!campaignId) return
    setItemsLoading(true)

    const unsub = onSnapshot(
      collection(db, 'campaigns', campaignId, 'items'),
      (snap) => {
        const all = snap.docs.map((docSnap) => {
          if (pendingWritesRef.current[docSnap.id]) {
            const local = itemsRef.current.find((i) => i.id === docSnap.id)
            if (local) return local
          }

          const data = docSnap.data() as Record<string, unknown>
          const local = itemsRef.current.find((item) => item.id === docSnap.id)
          const normalized = normalizeCampaignItem(docSnap.id, data)
          return {
            ...normalized,
            portraitUrl: normalized.portraitUrl
              ?? (local && local.portraitPath === normalized.portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null),
            tokenIcon: !normalized.tokenIcon.customImageUrl
              && normalized.tokenIcon.customImagePath
              && local
              && local.tokenIcon.customImagePath === normalized.tokenIcon.customImagePath
              && isRenderableImageUrl(local.tokenIcon.customImageUrl)
              ? {
                  ...normalized.tokenIcon,
                  customImageUrl: local.tokenIcon.customImageUrl,
                }
              : normalized.tokenIcon,
          }
        })

        setItems(all)
        setItemsLoading(false)
      },
      () => {
        setItemsLoading(false)
      },
    )

    return () => unsub()
  }, [campaignId])

  useEffect(() => {
    const itemsNeedingMedia = items.filter((item) =>
      (item.portraitPath && !isRenderableImageUrl(item.portraitUrl))
      || (item.tokenIcon.customImagePath && !isRenderableImageUrl(item.tokenIcon.customImageUrl)),
    )
    if (itemsNeedingMedia.length === 0) return

    void Promise.allSettled(
      itemsNeedingMedia.map(async (item) => {
        const [portraitUrl, customImageUrl] = await Promise.all([
          item.portraitPath ? resolveStoragePathUrl(item.portraitPath) : Promise.resolve<string | null>(null),
          item.tokenIcon.customImagePath ? resolveStoragePathUrl(item.tokenIcon.customImagePath) : Promise.resolve<string | null>(null),
        ])

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
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
  }, [items])

  useEffect(() => {
    return () => {
      Object.values(pendingWritesRef.current).forEach((timer) => clearTimeout(timer))
      pendingWritesRef.current = {}
    }
  }, [])

  const scheduleItemWrite = (itemId: string) => {
    if (!campaignId) return
    const existing = pendingWritesRef.current[itemId]
    if (existing) clearTimeout(existing)

    pendingWritesRef.current[itemId] = setTimeout(() => {
      delete pendingWritesRef.current[itemId]
      const item = itemsRef.current.find((i) => i.id === itemId)
      if (!item) return

      const { id } = item
      void setDoc(
        doc(db, 'campaigns', campaignId, 'items', id),
        { ...toFirestoreItem(item), updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((error) => {
        console.error('Failed to update campaign item', { itemId: id, error })
      })
    }, 500)
  }

  const addItem = (item: CampaignItem) => {
    setItems((current) => [item, ...current])
    if (!campaignId) return
    const { id } = item
    void setDoc(
      doc(db, 'campaigns', campaignId, 'items', id),
      { ...toFirestoreItem(item), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    ).catch((error) => {
      console.error('Failed to create campaign item', { itemId: id, error })
    })
  }

  const updateItem = (itemId: string, patch: Partial<CampaignItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    )
    scheduleItemWrite(itemId)
  }

  const deleteItem = (itemId: string) => {
    if (!campaignId) return
    const pending = pendingWritesRef.current[itemId]
    if (pending) {
      clearTimeout(pending)
      delete pendingWritesRef.current[itemId]
    }
    setItems((current) => current.filter((item) => item.id !== itemId))
    void deleteDoc(doc(db, 'campaigns', campaignId, 'items', itemId)).catch((error) => {
      console.error('Failed to delete campaign item', { itemId, error })
    })
  }

  return { items, itemsLoading, addItem, updateItem, deleteItem }
}

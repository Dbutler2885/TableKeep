import { useEffect, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CampaignItem } from '../../types/app'

const defaultWeaponStats: CampaignItem['weaponStats'] = {
  damageDiceCount: '',
  damageDiceSides: '',
  attackBonus: '',
  damageBonus: '',
  rangeShort: '',
  rangeMedium: '',
  rangeLong: '',
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
  const type = data.type === 'weapon' || data.type === 'armour' || data.type === 'ammunition' || data.type === 'consumable' || data.type === 'general'
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
    armourStats: normalizeArmourStats(data.armourStats),
    consumableStats: normalizeConsumableStats(data.consumableStats),
    specialRule: typeof data.specialRule === 'string' ? data.specialRule : '',
    notes: typeof data.notes === 'string' ? data.notes : '',
  }
}

export const toFirestoreItem = (item: CampaignItem): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    name: item.name,
    type: item.type,
    typeId: item.typeId,
    typeName: item.typeName,
    status: item.status,
    portraitUrl: item.portraitUrl,
    portraitFocusX: item.portraitFocusX,
    portraitFocusY: item.portraitFocusY,
    tokenIcon: item.tokenIcon,
    description: item.description,
    gpValue: item.gpValue,
    qty: item.qty,
    isMagic: item.isMagic,
    weaponStats: { ...defaultWeaponStats, ...item.weaponStats },
    armourStats: { ...defaultArmourStats, ...item.armourStats },
    consumableStats: { ...defaultConsumableStats, ...item.consumableStats },
    specialRule: item.specialRule,
    notes: item.notes,
  }

  if (item.droppedByCharacterId) payload.droppedByCharacterId = item.droppedByCharacterId
  if (item.droppedByCharacterName) payload.droppedByCharacterName = item.droppedByCharacterName

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
          return normalizeCampaignItem(docSnap.id, data)
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
      )
    }, 500)
  }

  const addItem = (item: CampaignItem) => {
    setItems((current) => [item, ...current])
    if (!campaignId) return
    const { id } = item
    void setDoc(
      doc(db, 'campaigns', campaignId, 'items', id),
      { ...toFirestoreItem(item), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    )
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
    void deleteDoc(doc(db, 'campaigns', campaignId, 'items', itemId))
  }

  return { items, itemsLoading, addItem, updateItem, deleteItem }
}

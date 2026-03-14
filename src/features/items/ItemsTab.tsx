import { ChevronLeft, Gift, Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import type { CampaignItem, CampaignItemType, CharacterInventoryItem, CharacterGoldItem, CharacterRecord, CharacterSheetDetails, Role } from '../../types/app'
import type { TokenIconConfig } from '../tokens/TokenIconEditor'
import { ConfirmModal } from '../common/ConfirmModal'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { uploadEntityImage } from '../common/mediaStorage'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useItems, toFirestoreItem } from './useItems'
import { campaignItemToInventoryItem, campaignGoldToInventoryChunks } from './itemConversion'
import { computeAvailablePackedSlots, computeOverflow, makeDroppedGoldCampaignItem } from '../character/inventoryOverflow'
import { OSE_WEAPON_CATALOG, weaponCatalogById } from '../character/weaponCatalog'
import { OSE_ARMOUR_CATALOG, armourCatalogById } from '../character/armourCatalog'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'
import { ammoCatalogById } from '../character/ammoCatalog'
import { consumableCatalogById } from '../character/consumableCatalog'
import { generalCatalogById } from '../character/generalCatalog'
import {
  armourTypeFromTemplateId,
  normalizeTemplateArmourValues,
  parseArmourTemplateValues,
  parseDamageDice,
  parseRangeBands,
} from '../character/inventoryRules'
import type { WeaponEffect, WeaponEffectConditionType, WeaponEffectOutcomeType, WeaponEffectTrigger, WeaponRollTable } from '../../types/app'

type ItemTypeFilter = CampaignItemType | 'all' | 'dropped'

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

type ItemsTabProps = {
  campaignId: string
  role: Role | null
  characters: CharacterRecord[]
}

const itemTypeOptions: Array<{ value: CampaignItemType; label: string }> = [
  { value: 'weapon', label: 'Weapons' },
  { value: 'armour', label: 'Armour' },
  { value: 'ammunition', label: 'Ammo' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'general', label: 'General' },
]

const weaponEffectTriggerOptions: Array<{ value: WeaponEffectTrigger; label: string }> = [
  { value: 'passive', label: 'Passive' },
  { value: 'versus_target', label: 'Versus Target' },
  { value: 'on_hit', label: 'On Hit' },
  { value: 'on_crit', label: 'On Crit' },
]

const weaponEffectConditionOptions: Array<{ value: WeaponEffectConditionType; label: string }> = [
  { value: 'none', label: 'Always' },
  { value: 'alignment', label: 'Target Alignment' },
  { value: 'armour_state', label: 'Target Armour State' },
  { value: 'creature_type', label: 'Creature Type/Tag' },
  { value: 'custom', label: 'Custom' },
]

const weaponEffectOutcomeOptions: Array<{ value: WeaponEffectOutcomeType; label: string }> = [
  { value: 'attack_bonus', label: 'Attack Bonus' },
  { value: 'damage_bonus', label: 'Damage Bonus' },
  { value: 'replace_damage', label: 'Replace Damage' },
  { value: 'extra_damage', label: 'Extra Damage' },
  { value: 'roll_table', label: 'Roll Table' },
  { value: 'grant_trait', label: 'Grant Trait/Immunity' },
  { value: 'show_text', label: 'Show Text' },
]

const alignmentConditionOptions = [
  { value: 'lawful', label: 'Lawful' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'chaotic', label: 'Chaotic' },
]

const armourStateConditionOptions = [
  { value: 'armoured', label: 'Armoured' },
  { value: 'unarmoured', label: 'Unarmoured' },
  { value: 'natural_armour', label: 'Natural Armour' },
]

const damageDieOptions = ['4', '6', '8', '10', '12', '20']
const rollTableDieOptions = ['4', '6', '8', '10', '12', '20']

const generalCatalog = OSE_STORE_ITEMS.filter((i) => i.kind === 'general')
const ammoCatalog = OSE_STORE_ITEMS.filter((i) => i.kind === 'ammunition')
const consumableCatalog = OSE_STORE_ITEMS.filter((i) => i.kind === 'consumable')

const newWeaponEffect = (): WeaponEffect => ({
  id: crypto.randomUUID(),
  trigger: 'passive',
  conditionType: 'none',
  conditionValues: [],
  outcomeType: 'show_text',
  outcomeValue: '',
  notes: '',
})

const newWeaponRollTable = (): WeaponRollTable => ({
  id: crypto.randomUUID(),
  name: '',
  dieSides: '8',
  entries: Array.from({ length: 8 }, (_, index) => ({
    id: crypto.randomUUID(),
    roll: String(index + 1),
    text: '',
  })),
})

const parseOutcomeDamageDice = (value: string): { count: string; sides: string } => {
  const match = value.trim().match(/^(\d+)\s*d\s*(\d+)$/i)
  if (!match) return { count: '', sides: '' }
  return { count: match[1], sides: match[2] }
}

const formatOutcomeDamageDice = (count: string, sides: string): string => {
  const nextCount = count.trim()
  const nextSides = sides.trim()
  if (!nextCount || !nextSides) return ''
  return `${nextCount}d${nextSides}`
}

const toConsumableTypeId = (storeId: string) =>
  storeId.startsWith('gear-') ? storeId.replace('gear-', 'con-') : storeId

const toConsumableStoreId = (typeId: string) =>
  typeId.startsWith('con-') ? typeId.replace('con-', 'gear-') : typeId

const applyGeneralTemplate = (templateId: string): Partial<CampaignItem> => {
  const template = generalCatalogById[templateId]
  if (!template) return { typeId: 'custom', typeName: '' }
  return {
    typeId: template.id,
    typeName: template.name,
    name: template.name,
    gpValue: String(template.costGp),
    description: template.description,
    qty: '1',
  }
}

const applyAmmoTemplate = (templateId: string): Partial<CampaignItem> => {
  const template = ammoCatalogById[templateId]
  if (!template) return { typeId: 'custom', typeName: '' }
  return {
    typeId: template.id,
    typeName: template.name,
    name: template.name,
    gpValue: String(template.costGp),
    description: template.description,
    qty: String(template.qty),
  }
}

const applyConsumableTemplate = (storeId: string): Partial<CampaignItem> => {
  const templateId = toConsumableTypeId(storeId)
  const template = consumableCatalogById[templateId]
  if (!template) return { typeId: 'custom', typeName: '' }
  return {
    typeId: template.id,
    typeName: template.name,
    name: template.name,
    gpValue: String(template.costGp),
    description: template.description,
    qty: String(template.qty),
    consumableStats: {
      useMode: template.useMode,
      effectText: template.effectText,
    },
  }
}

const applyWeaponTemplate = (templateId: string): Partial<CampaignItem> => {
  const template = weaponCatalogById[templateId]
  if (!template) return { typeId: 'custom', typeName: '' }
  const storeItem = OSE_STORE_ITEMS.find((item) => item.weaponId === templateId)
  return {
    typeId: template.id,
    typeName: template.name,
    name: template.name,
    gpValue: template.costGp,
    description: storeItem?.description ?? template.qualities.join(', '),
    qty: '1',
    weaponStats: {
      damageDiceCount: parseDamageDice(template.damage).damageDiceCount,
      damageDiceSides: parseDamageDice(template.damage).damageDiceSides,
      attackBonus: '',
      damageBonus: '',
      ...parseRangeBands(template.range),
      slow: template.qualities.includes('Slow'),
      twoHanded: template.twoHanded,
    },
  }
}

const applyArmourTemplate = (templateId: string): Partial<CampaignItem> => {
  const template = armourCatalogById[templateId]
  if (!template) return { typeId: 'custom', typeName: '' }
  const normalizedArmour = normalizeTemplateArmourValues(
    parseArmourTemplateValues(template.ac),
    armourTypeFromTemplateId(template.id),
  )
  const storeItem = OSE_STORE_ITEMS.find((item) => item.armourId === templateId)
  return {
    typeId: template.id,
    typeName: template.name,
    name: template.name,
    gpValue: String(template.costGp),
    description: storeItem?.description ?? '',
    qty: '1',
    armourStats: {
      ...normalizedArmour,
      armourType: armourTypeFromTemplateId(template.id),
    },
  }
}

const newItemTemplate = (type: CampaignItemType): CampaignItem => ({
  id: crypto.randomUUID(),
  name: '',
  type,
  typeId: 'custom',
  typeName: '',
  status: 'authored',
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: defaultTokenIcon,
  description: '',
  gpValue: '',
  qty: '1',
  isMagic: false,
  weaponStats: {
    damageDiceCount: '',
    damageDiceSides: '',
    attackBonus: '',
    damageBonus: '',
    rangeShort: '',
    rangeMedium: '',
    rangeLong: '',
    slow: false,
    twoHanded: false,
  },
  weaponEffects: [],
  weaponRollTables: [],
  armourStats: {
    armourClass: '',
    shieldMod: '',
    magicMod: '',
    armourType: 'body',
  },
  consumableStats: {
    useMode: 'consume',
    effectText: '',
  },
  specialRule: '',
  notes: '',
})

export function ItemsTab({ campaignId, role, characters }: ItemsTabProps) {
  const { items, addItem: hookAddItem, updateItem, deleteItem: hookDeleteItem } = useItems(campaignId)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<CampaignItem | null>(null)
  const [grantTargetId, setGrantTargetId] = useState<string>('')
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<ItemTypeFilter>('all')
  const [worldNotesOpenByItemId, setWorldNotesOpenByItemId] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const canEdit = role === 'gm'

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setMobileView('list')
    }
    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => (a.typeName || a.name).localeCompare(b.typeName || b.name))
    if (typeFilter === 'all') return sorted.filter((item) => item.status !== 'dropped')
    if (typeFilter === 'dropped') return sorted.filter((item) => item.status === 'dropped')
    return sorted.filter((item) => item.type === typeFilter && item.status !== 'dropped')
  }, [items, typeFilter])

  const selectedItem = filteredItems.find((item) => item.id === selectedItemId) ?? items.find((item) => item.id === selectedItemId) ?? null
  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'

  const addItem = () => {
    const defaultType: CampaignItemType = typeFilter === 'all' || typeFilter === 'dropped' ? 'general' : typeFilter
    const nextItem = newItemTemplate(defaultType)
    hookAddItem(nextItem)
    setSelectedItemId(nextItem.id)
    if (isMobile) setMobileView('detail')
  }

  const updateSelectedItem = (updates: Partial<CampaignItem>) => {
    if (!selectedItemId) return
    updateItem(selectedItemId, updates)
  }

  const updateWeaponEffect = (effectId: string, updates: Partial<WeaponEffect>) => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponEffects: selectedItem.weaponEffects.map((effect) =>
        effect.id === effectId ? { ...effect, ...updates } : effect,
      ),
    })
  }

  const defaultConditionValuesForType = (conditionType: WeaponEffectConditionType): string[] => {
    if (conditionType === 'alignment') return []
    if (conditionType === 'armour_state') return []
    if (conditionType === 'creature_type') return []
    return []
  }

  const toggleWeaponEffectConditionValue = (effectId: string, value: string) => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponEffects: selectedItem.weaponEffects.map((effect) => {
        if (effect.id !== effectId) return effect
        const nextValues = effect.conditionValues.includes(value)
          ? effect.conditionValues.filter((entry) => entry !== value)
          : [...effect.conditionValues, value]
        return { ...effect, conditionValues: nextValues }
      }),
    })
  }

  const addWeaponEffect = () => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponEffects: [...selectedItem.weaponEffects, newWeaponEffect()],
    })
  }

  const removeWeaponEffect = (effectId: string) => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponEffects: selectedItem.weaponEffects.filter((effect) => effect.id !== effectId),
    })
  }

  const updateWeaponRollTable = (tableId: string, updates: Partial<WeaponRollTable>) => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponRollTables: selectedItem.weaponRollTables.map((table) =>
        table.id === tableId ? { ...table, ...updates } : table,
      ),
    })
  }

  const addWeaponRollTable = () => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponRollTables: [...selectedItem.weaponRollTables, newWeaponRollTable()],
    })
  }

  const removeWeaponRollTable = (tableId: string) => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponRollTables: selectedItem.weaponRollTables.filter((table) => table.id !== tableId),
    })
  }

  const updateWeaponRollTableEntry = (
    tableId: string,
    entryId: string,
    updates: { roll?: string; text?: string },
  ) => {
    if (!selectedItem || selectedItem.type !== 'weapon') return
    updateSelectedItem({
      weaponRollTables: selectedItem.weaponRollTables.map((table) =>
        table.id === tableId
          ? {
              ...table,
              entries: table.entries.map((entry) =>
                entry.id === entryId ? { ...entry, ...updates } : entry,
              ),
            }
          : table,
      ),
    })
  }

  const resizeWeaponRollTableEntries = (table: WeaponRollTable, dieSides: string): WeaponRollTable => {
    const sideCount = Number.parseInt(dieSides, 10)
    if (Number.isNaN(sideCount) || sideCount < 1) {
      return { ...table, dieSides, entries: [] }
    }
    const nextEntries = Array.from({ length: sideCount }, (_, index) => {
      const existing = table.entries[index]
      return {
        id: existing?.id ?? crypto.randomUUID(),
        roll: String(index + 1),
        text: existing?.text ?? '',
      }
    })
    return {
      ...table,
      dieSides,
      entries: nextEntries,
    }
  }

  const uploadItemTokenImage = async (file: File) => {
    if (!selectedItem) throw new Error('No item selected.')
    const { path, url, name } = await uploadEntityImage({
      campaignId,
      collectionName: 'items',
      entityId: selectedItem.id,
      mediaKind: 'token-icons',
      file,
      maxWidth: 1024,
      maxHeight: 1024,
    })
    return {
      customImagePath: path,
      customImageUrl: url,
      customImageName: name,
    }
  }

  const uploadItemPortraitImage = async (file: File) => {
    if (!selectedItem) throw new Error('No item selected.')
    const { path, url } = await uploadEntityImage({
      campaignId,
      collectionName: 'items',
      entityId: selectedItem.id,
      mediaKind: 'portraits',
      file,
      maxWidth: 600,
      maxHeight: 800,
    })
    return {
      portraitPath: path,
      portraitUrl: url,
    }
  }

  const updateType = (nextType: CampaignItemType) => {
    if (!selectedItem) return
    const next: Partial<CampaignItem> = { type: nextType, typeId: 'custom', typeName: '' }
    if (nextType !== 'weapon') {
      next.weaponStats = { damageDiceCount: '', damageDiceSides: '', attackBonus: '', damageBonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', slow: false, twoHanded: false }
      next.weaponEffects = []
      next.weaponRollTables = []
    }
    if (nextType !== 'armour') {
      next.armourStats = { armourClass: '', shieldMod: '', magicMod: '', armourType: 'body' }
    }
    if (nextType !== 'consumable') {
      next.consumableStats = { useMode: 'consume', effectText: '' }
    }
    updateSelectedItem(next)
  }

  const confirmDeleteItem = () => {
    if (!deleteCandidate) return
    const deleteId = deleteCandidate.id
    if (selectedItemId === deleteId) {
      const remaining = items.filter((item) => item.id !== deleteId)
      setSelectedItemId(remaining[0]?.id ?? null)
    }
    setWorldNotesOpenByItemId((current) => {
      const next = { ...current }
      delete next[deleteId]
      return next
    })
    hookDeleteItem(deleteId)
    setDeleteCandidate(null)
  }

  const grantItemToCharacter = async () => {
    if (!selectedItem || !grantTargetId || grantBusy) return
    setGrantBusy(true)
    setGrantFeedback(null)
    try {
      const isGoldGrant = selectedItem.type === 'gold'
      const charRef = doc(db, 'campaigns', campaignId, 'characters', grantTargetId)
      const targetName = characters.find((c) => c.id === grantTargetId)?.name ?? 'character'

      // Pre-generate deterministic ID for overflow gold doc (safe for transaction retry)
      const overflowGoldDocId = crypto.randomUUID()

      let overflowFeedback: string | null = null

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(charRef)
        if (!snap.exists()) throw new Error('Target character not found')
        const data = snap.data() as { details?: CharacterSheetDetails | null } | undefined
        const existingDetails = (data?.details && typeof data.details === 'object')
          ? data.details as Record<string, unknown>
          : {}
        const currentInventory: CharacterInventoryItem[] = Array.isArray(existingDetails.inventory)
          ? existingDetails.inventory
          : []

        // Compute available packed slots from STR
        const abilityScores = (existingDetails.abilityScores && typeof existingDetails.abilityScores === 'object')
          ? existingDetails.abilityScores as Record<string, string>
          : {}
        const strScore = Number.parseInt(abilityScores.STR ?? '', 10)
        const availableSlots = computeAvailablePackedSlots(strScore)

        // Build candidate inventory
        let candidateInventory: CharacterInventoryItem[]
        let grantAmount = 0
        let existingGoldBeforeGrant = 0
        if (isGoldGrant) {
          grantAmount = selectedItem.goldAmount ?? 0
          existingGoldBeforeGrant = currentInventory
            .filter((i): i is CharacterGoldItem => i.kind === 'gold')
            .reduce((sum, g) => sum + (g.qty ?? 0), 0)
          const nonGold = currentInventory.filter((i) => i.kind !== 'gold')
          const equipped = nonGold.filter((i) => i.equipped)
          const packedNonGold = nonGold.filter((i) => !i.equipped)
          const totalGold = existingGoldBeforeGrant + grantAmount
          const goldChunks = campaignGoldToInventoryChunks(totalGold)
          candidateInventory = [...equipped, ...packedNonGold, ...goldChunks]
        } else {
          const inventoryItem = campaignItemToInventoryItem(selectedItem)
          candidateInventory = [...currentInventory, inventoryItem]
        }

        const overflow = computeOverflow(candidateInventory, availableSlots, grantTargetId, targetName)
        overflowFeedback = overflow.feedbackMessage

        // Write kept inventory to character doc
        tx.set(charRef, {
          details: {
            ...existingDetails,
            inventory: overflow.keptInventory,
          },
        }, { merge: true })

        // Write non-gold overflow items in same transaction
        for (const droppedItem of overflow.droppedItems) {
          const itemRef = doc(db, 'campaigns', campaignId, 'items', droppedItem.id)
          tx.set(itemRef, { ...toFirestoreItem(droppedItem), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        }

        // Write gold overflow in same transaction.
        // If source is dropped gold, remainder stays on source doc (below), so skip creating a new dropped gold doc.
        const sourceIsDroppedGold = isGoldGrant && selectedItem.status === 'dropped'
        if (overflow.droppedGoldAmount > 0 && !sourceIsDroppedGold) {
          const goldDoc = makeDroppedGoldCampaignItem(overflow.droppedGoldAmount, grantTargetId, targetName, overflowGoldDocId)
          const goldRef = doc(db, 'campaigns', campaignId, 'items', overflowGoldDocId)
          tx.set(goldRef, { ...toFirestoreItem(goldDoc), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        }

        // Handle dropped gold source doc: decrement remainder on same doc, or delete if fully picked up.
        if (sourceIsDroppedGold) {
          const sourceRef = doc(db, 'campaigns', campaignId, 'items', selectedItem.id)
          const keptGoldTotal = overflow.keptInventory
            .filter((i): i is CharacterGoldItem => i.kind === 'gold')
            .reduce((sum, g) => sum + (g.qty ?? 0), 0)
          const acceptedFromSource = Math.max(0, Math.min(grantAmount, keptGoldTotal - existingGoldBeforeGrant))
          const sourceRemainder = Math.max(0, grantAmount - acceptedFromSource)

          if (sourceRemainder <= 0) {
            tx.delete(sourceRef)
          } else {
            tx.set(
              sourceRef,
              { goldAmount: sourceRemainder, updatedAt: serverTimestamp() },
              { merge: true },
            )
          }
        }
      })

      const label = isGoldGrant ? `${selectedItem.goldAmount ?? 0} gp` : `"${selectedItem.typeName || selectedItem.name}"`
      const feedbackParts = [`Granted ${label} to ${targetName}`]
      if (overflowFeedback) feedbackParts.push(overflowFeedback)
      setGrantFeedback(feedbackParts.join('. '))
      setTimeout(() => setGrantFeedback(null), 5000)
    } catch (error) {
      console.error('Grant item failed', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      setGrantFeedback(`Grant failed: ${message}`)
    } finally {
      setGrantBusy(false)
    }
  }

  const worldNotesHasContent =
    !!selectedItem?.specialRule.trim() ||
    !!selectedItem?.notes.trim()
  const worldNotesOpen = selectedItem
    ? (worldNotesOpenByItemId[selectedItem.id] ?? worldNotesHasContent)
    : false

  const droppedCount = items.filter((item) => item.status === 'dropped').length
  const authoredItems = items.filter((item) => item.status !== 'dropped')

  const typeDropdown = (item: CampaignItem) => {
    if (item.type === 'weapon') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                updateSelectedItem(applyWeaponTemplate(id))
              }
            }}
          >
            <option value="custom">Custom</option>
            {OSE_WEAPON_CATALOG.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      )
    }
    if (item.type === 'armour') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                updateSelectedItem(applyArmourTemplate(id))
              }
            }}
          >
            <option value="custom">Custom</option>
            {OSE_ARMOUR_CATALOG.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )
    }
    if (item.type === 'ammunition') {
      return (
        <label>
          Type
          <select
            value={item.typeId}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                updateSelectedItem(applyAmmoTemplate(id))
              }
            }}
          >
            <option value="custom">Custom</option>
            {ammoCatalog.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )
    }
    if (item.type === 'consumable') {
      return (
        <label>
          Type
          <select
            value={item.typeId === 'custom' ? 'custom' : toConsumableStoreId(item.typeId)}
            disabled={!canEdit}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'custom') {
                updateSelectedItem({ typeId: 'custom', typeName: '' })
              } else {
                updateSelectedItem(applyConsumableTemplate(id))
              }
            }}
          >
            <option value="custom">Custom</option>
            {consumableCatalog.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )
    }
    // general
    return (
      <label>
        Type
        <select
          value={item.typeId}
          disabled={!canEdit}
        onChange={(event) => {
          const id = event.target.value
          if (id === 'custom') {
            updateSelectedItem({ typeId: 'custom', typeName: '' })
          } else {
            updateSelectedItem(applyGeneralTemplate(id))
          }
        }}
      >
          <option value="custom">Custom</option>
          {generalCatalog.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="maps-layout monsters-layout items-layout">
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar items-sidebar">
          <div className="maps-sidebar-header">
            <h2>Items</h2>
            {canEdit ? (
              <button type="button" className="monster-add-btn" onClick={addItem} aria-label="Add item">
                <Plus size={16} />
              </button>
            ) : null}
          </div>

          <div className="item-type-filter-grid">
            <button
              type="button"
              className={typeFilter === 'all' ? 'item-type-filter active' : 'item-type-filter'}
              onClick={() => setTypeFilter('all')}
            >
              <span>All</span>
              <small>{authoredItems.length}</small>
            </button>
            {itemTypeOptions.map((option) => {
              const count = authoredItems.filter((item) => item.type === option.value).length
              return (
                <button
                  key={option.value}
                  type="button"
                  className={typeFilter === option.value ? 'item-type-filter active' : 'item-type-filter'}
                  onClick={() => setTypeFilter(option.value)}
                >
                  <span>{option.label}</span>
                  <small>{count}</small>
                </button>
              )
            })}
            <button
              type="button"
              className={typeFilter === 'dropped' ? 'item-type-filter active' : 'item-type-filter'}
              onClick={() => setTypeFilter('dropped')}
            >
              <span>Dropped</span>
              <small>{droppedCount}</small>
            </button>
          </div>

          {filteredItems.length === 0 ? <p>{canEdit ? 'No items yet. Click + to create one.' : 'No items yet.'}</p> : null}

          <div className="item-list-grid">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={item.id === selectedItemId ? 'item-row active' : 'item-row'}
              >
                <div
                  className="item-select"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedItemId(item.id)
                    if (isMobile) setMobileView('detail')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedItemId(item.id)
                      if (isMobile) setMobileView('detail')
                    }
                  }}
                >
                  <div className="item-card-head">
                    <h4>{item.type === 'gold' ? `Gold: ${item.goldAmount ?? 0} gp` : (item.typeName.trim() || item.name.trim() || 'Unnamed Item')}</h4>
                    <span className="item-card-type">{item.status === 'dropped' ? 'dropped' : item.type}</span>
                  </div>
                  <p>
                    {item.status === 'dropped' && item.droppedByCharacterName
                      ? `Dropped by ${item.droppedByCharacterName}`
                      : item.type === 'gold' ? `${item.goldAmount ?? 0} gp`
                      : item.name.trim() || item.description.trim() || 'No details yet'}
                  </p>
                </div>
                {canEdit ? (
                  <div className="item-actions">
                    <button
                      type="button"
                      className="map-delete-btn"
                      onClick={() => setDeleteCandidate(item)}
                      aria-label={`Delete ${item.typeName || item.name || 'item'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {showDetailPane ? (
        <div className="monsters-detail items-detail">
          <div className="monsters-detail-inner items-detail-inner">
            {isMobile && selectedItem ? (
              <button
                type="button"
                className="back-link monster-mobile-back"
                onClick={() => setMobileView('list')}
                aria-label="Back to item list"
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}

            {!selectedItem ? (
              <p>Select an item from the list or click + to create one.</p>
            ) : (
              <div className="item-editor-grid">
                {canEdit ? (
                  <div className="item-media-rail">
                    <EntityMediaEditor
                      entityName={selectedItem.typeName || selectedItem.name || 'item'}
                      portraitUrl={selectedItem.portraitUrl}
                      portraitFocusX={selectedItem.portraitFocusX}
                      portraitFocusY={selectedItem.portraitFocusY}
                      tokenIcon={selectedItem.tokenIcon}
                      onChange={(updates) => updateSelectedItem(updates)}
                      onUploadPortraitImage={uploadItemPortraitImage}
                      onUploadTokenImage={uploadItemTokenImage}
                      portraitAltLabel="Item portrait"
                      tokenButtonAriaLabel="Edit item token icon"
                      removePortraitMessage="Remove the portrait image from this item?"
                    />
                  </div>
                ) : null}
                <section className="item-section">
                  <h3 className="monster-section-title">Identity</h3>
                  <div className="item-identity-grid">
                    <label>
                      Kind
                      <select value={selectedItem.type} disabled={!canEdit} onChange={(event) => updateType(event.target.value as CampaignItemType)}>
                        {itemTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {typeDropdown(selectedItem)}
                    {selectedItem.typeId === 'custom' ? (
                      <label className="item-field-name">
                        Type Name
                        <input
                          type="text"
                          value={selectedItem.typeName}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ typeName: event.target.value })}
                        />
                      </label>
                    ) : null}
                    <label className="item-field-name">
                      Name
                      <input
                        type="text"
                        value={selectedItem.name}
                        readOnly={!canEdit}
                        onChange={(event) => updateSelectedItem({ name: event.target.value })}
                      />
                    </label>
                    <label className="item-field-description">
                      Description
                      <input
                        type="text"
                        value={selectedItem.description}
                        readOnly={!canEdit}
                        onChange={(event) => updateSelectedItem({ description: event.target.value })}
                      />
                    </label>
                  </div>
                </section>

                <section className="item-section">
                  <h3 className="monster-section-title">Value</h3>
                  <div className="item-numeric-grid">
                    <label>
                      GP
                      <input
                        type="number"
                        min={0}
                        value={selectedItem.gpValue}
                        readOnly={!canEdit}
                        onChange={(event) => updateSelectedItem({ gpValue: event.target.value })}
                      />
                    </label>
                    {(selectedItem.type === 'ammunition' || selectedItem.type === 'consumable') ? (
                      <label>
                        Qty
                        <input
                          type="number"
                          min={0}
                          value={selectedItem.qty}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ qty: event.target.value })}
                        />
                      </label>
                    ) : null}
                    <label className="item-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedItem.isMagic}
                        disabled={!canEdit}
                        onChange={(event) => updateSelectedItem({ isMagic: event.target.checked })}
                      />
                      Magic
                    </label>
                  </div>
                </section>

                {selectedItem.type === 'weapon' ? (
                  <>
                    <section className="item-section">
                      <h3 className="monster-section-title">Weapon Stats</h3>
                      <div className="item-numeric-grid item-template-grid">
                        <label>
                          Dice #
                          <input
                            type="number"
                            min={0}
                            value={selectedItem.weaponStats.damageDiceCount}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, damageDiceCount: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          Die
                          <select
                            value={selectedItem.weaponStats.damageDiceSides}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: {
                                  ...selectedItem.weaponStats,
                                  damageDiceSides: event.target.value,
                                  damageDiceCount: selectedItem.weaponStats.damageDiceCount || (event.target.value ? '1' : ''),
                                },
                              })
                            }
                          >
                            <option value="">—</option>
                            <option value="4">d4</option>
                            <option value="6">d6</option>
                            <option value="8">d8</option>
                            <option value="10">d10</option>
                            <option value="12">d12</option>
                            <option value="20">d20</option>
                          </select>
                        </label>
                        <label>
                          Atk +
                          <input
                            type="number"
                            value={selectedItem.weaponStats.attackBonus}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, attackBonus: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          Dmg +
                          <input
                            type="number"
                            value={selectedItem.weaponStats.damageBonus}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, damageBonus: event.target.value },
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="item-numeric-grid">
                        <label>
                          Range S
                          <input
                            type="text"
                            value={selectedItem.weaponStats.rangeShort}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, rangeShort: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          Range M
                          <input
                            type="text"
                            value={selectedItem.weaponStats.rangeMedium}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, rangeMedium: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          Range L
                          <input
                            type="text"
                            value={selectedItem.weaponStats.rangeLong}
                            readOnly={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, rangeLong: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="item-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedItem.weaponStats.slow}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, slow: event.target.checked },
                              })
                            }
                          />
                          Slow
                        </label>
                        <label className="item-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedItem.weaponStats.twoHanded}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateSelectedItem({
                                weaponStats: { ...selectedItem.weaponStats, twoHanded: event.target.checked },
                              })
                            }
                          />
                          Two-handed
                        </label>
                      </div>
                    </section>

                    <section className="item-section">
                      <div className="section-head">
                        <div>
                          <h3 className="monster-section-title">Weapon Effects</h3>
                          <p className="item-section-help">Add conditional rules for crits, target state, alignment, and other combat hooks.</p>
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            className="icon-btn add-btn"
                            onClick={addWeaponEffect}
                            aria-label="Add weapon effect"
                          >
                            <Plus size={13} />
                          </button>
                        ) : null}
                      </div>
                      {selectedItem.weaponEffects.length === 0 ? (
                        <p className="item-section-help">No conditional weapon effects yet.</p>
                      ) : (
                        <div className="item-weapon-effects">
                          {selectedItem.weaponEffects.map((effect) => (
                            <div key={effect.id} className="item-weapon-effect-card">
                              <div className="item-weapon-effect-grid">
                                <label>
                                  Trigger
                                  <select
                                    value={effect.trigger}
                                    disabled={!canEdit}
                                    onChange={(event) => updateWeaponEffect(effect.id, { trigger: event.target.value as WeaponEffectTrigger })}
                                  >
                                    {weaponEffectTriggerOptions.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Condition
                                  <select
                                    value={effect.conditionType}
                                    disabled={!canEdit}
                                    onChange={(event) =>
                                      updateWeaponEffect(effect.id, {
                                        conditionType: event.target.value as WeaponEffectConditionType,
                                        conditionValues: defaultConditionValuesForType(event.target.value as WeaponEffectConditionType),
                                      })}
                                  >
                                    {weaponEffectConditionOptions.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Outcome
                                  <select
                                    value={effect.outcomeType}
                                    disabled={!canEdit}
                                    onChange={(event) => updateWeaponEffect(effect.id, { outcomeType: event.target.value as WeaponEffectOutcomeType })}
                                  >
                                    {weaponEffectOutcomeOptions.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="map-delete-btn"
                                    onClick={() => removeWeaponEffect(effect.id)}
                                    aria-label="Remove weapon effect"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : null}
                                <label className="item-field-description">
                                  {effect.conditionType === 'none' ? 'Condition Value' : 'Matches'}
                                  {effect.conditionType === 'alignment' ? (
                                    <div className="item-checkbox-chip-list">
                                      {alignmentConditionOptions.map((option) => (
                                        <label key={option.value} className="item-checkbox-chip">
                                          <input
                                            type="checkbox"
                                            checked={effect.conditionValues.includes(option.value)}
                                            disabled={!canEdit}
                                            onChange={() => toggleWeaponEffectConditionValue(effect.id, option.value)}
                                          />
                                          <span>{option.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  ) : effect.conditionType === 'armour_state' ? (
                                    <div className="item-checkbox-chip-list">
                                      {armourStateConditionOptions.map((option) => (
                                        <label key={option.value} className="item-checkbox-chip">
                                          <input
                                            type="checkbox"
                                            checked={effect.conditionValues.includes(option.value)}
                                            disabled={!canEdit}
                                            onChange={() => toggleWeaponEffectConditionValue(effect.id, option.value)}
                                          />
                                          <span>{option.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  ) : effect.conditionType === 'creature_type' ? (
                                    <input
                                      type="text"
                                      value={effect.conditionValues.join(', ')}
                                      readOnly={!canEdit}
                                      onChange={(event) =>
                                        updateWeaponEffect(effect.id, {
                                          conditionValues: event.target.value
                                            .split(',')
                                            .map((entry) => entry.trim())
                                            .filter((entry) => entry.length > 0),
                                        })}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={effect.conditionValues.join(', ')}
                                      readOnly={!canEdit || effect.conditionType === 'none'}
                                      onChange={(event) =>
                                        updateWeaponEffect(effect.id, {
                                          conditionValues: event.target.value.trim() ? [event.target.value] : [],
                                        })}
                                      placeholder={
                                        effect.conditionType === 'custom'
                                          ? 'GM-defined condition'
                                          : 'Always active'
                                      }
                                    />
                                  )}
                                </label>
                                <label className="item-field-description">
                                  Outcome Value
                                  {effect.outcomeType === 'roll_table' ? (
                                    <select
                                      value={effect.outcomeValue}
                                      disabled={!canEdit}
                                      onChange={(event) => updateWeaponEffect(effect.id, { outcomeValue: event.target.value })}
                                    >
                                      <option value="">Select table…</option>
                                      {selectedItem.weaponRollTables.map((table) => (
                                        <option key={table.id} value={table.id}>
                                          {table.name.trim() || `Unnamed d${table.dieSides || '?'}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : effect.outcomeType === 'replace_damage' || effect.outcomeType === 'extra_damage' ? (
                                    <div className="item-dice-value-row">
                                      <input
                                        type="number"
                                        min={0}
                                        value={parseOutcomeDamageDice(effect.outcomeValue).count}
                                        readOnly={!canEdit}
                                        onChange={(event) => {
                                          const parsed = parseOutcomeDamageDice(effect.outcomeValue)
                                          updateWeaponEffect(effect.id, {
                                            outcomeValue: formatOutcomeDamageDice(event.target.value, parsed.sides),
                                          })
                                        }}
                                      />
                                      <select
                                        value={parseOutcomeDamageDice(effect.outcomeValue).sides}
                                        disabled={!canEdit}
                                        onChange={(event) => {
                                          const parsed = parseOutcomeDamageDice(effect.outcomeValue)
                                          updateWeaponEffect(effect.id, {
                                            outcomeValue: formatOutcomeDamageDice(parsed.count || (event.target.value ? '1' : ''), event.target.value),
                                          })
                                        }}
                                      >
                                        <option value="">Die</option>
                                        {damageDieOptions.map((die) => (
                                          <option key={die} value={die}>{`d${die}`}</option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <input
                                      type="text"
                                      value={effect.outcomeValue}
                                      readOnly={!canEdit}
                                      onChange={(event) => updateWeaponEffect(effect.id, { outcomeValue: event.target.value })}
                                      placeholder={
                                        effect.outcomeType === 'attack_bonus' || effect.outcomeType === 'damage_bonus'
                                            ? '+2'
                                            : 'Effect summary'
                                      }
                                    />
                                  )}
                                </label>
                                <label className="item-field-description">
                                  Notes
                                  <input
                                    type="text"
                                    value={effect.notes}
                                    readOnly={!canEdit}
                                    onChange={(event) => updateWeaponEffect(effect.id, { notes: event.target.value })}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="item-section">
                      <div className="section-head">
                        <div>
                          <h3 className="monster-section-title">Weapon Roll Tables</h3>
                          <p className="item-section-help">Create named tables you can reference from weapon effects like crits.</p>
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            className="icon-btn add-btn"
                            onClick={addWeaponRollTable}
                            aria-label="Add weapon roll table"
                          >
                            <Plus size={13} />
                          </button>
                        ) : null}
                      </div>
                      {selectedItem.weaponRollTables.length === 0 ? (
                        <p className="item-section-help">No roll tables yet.</p>
                      ) : (
                        <div className="item-weapon-tables">
                          {selectedItem.weaponRollTables.map((table) => (
                            <div key={table.id} className="item-weapon-table-card">
                              <div className="item-weapon-table-head">
                                <label>
                                  Table Name
                                  <input
                                    type="text"
                                    value={table.name}
                                    readOnly={!canEdit}
                                    onChange={(event) => updateWeaponRollTable(table.id, { name: event.target.value })}
                                  />
                                </label>
                                <label>
                                  Die
                                  <select
                                    value={table.dieSides}
                                    disabled={!canEdit}
                                    onChange={(event) =>
                                      updateWeaponRollTable(
                                        table.id,
                                        resizeWeaponRollTableEntries(table, event.target.value),
                                      )}
                                  >
                                    {rollTableDieOptions.map((die) => (
                                      <option key={die} value={die}>{`d${die}`}</option>
                                    ))}
                                  </select>
                                </label>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="map-delete-btn"
                                    onClick={() => removeWeaponRollTable(table.id)}
                                    aria-label="Remove weapon roll table"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : null}
                              </div>
                              <div className="item-weapon-table-entries">
                                <div className="item-weapon-table-row item-weapon-table-row-head">
                                  <span>Roll</span>
                                  <span>Result</span>
                                </div>
                                {table.entries.map((entry) => (
                                  <div key={entry.id} className="item-weapon-table-entry">
                                    <div className="item-weapon-table-roll-cell">{entry.roll}</div>
                                    <input
                                      type="text"
                                      value={entry.text}
                                      readOnly={!canEdit}
                                      onChange={(event) => updateWeaponRollTableEntry(table.id, entry.id, { text: event.target.value })}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                ) : null}

                {selectedItem.type === 'armour' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Armour Stats</h3>
                    <div className="item-numeric-grid">
                      <label>
                        {selectedItem.armourStats.armourType === 'shield' ? 'Shield Mod' : 'Armour Class'}
                        <input
                          type="number"
                          value={selectedItem.armourStats.armourType === 'shield' ? selectedItem.armourStats.shieldMod : selectedItem.armourStats.armourClass}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              armourStats: selectedItem.armourStats.armourType === 'shield'
                                ? { ...selectedItem.armourStats, shieldMod: event.target.value }
                                : { ...selectedItem.armourStats, armourClass: event.target.value },
                            })
                          }
                        />
                      </label>
                      <label>
                        Magic Mod
                        <input
                          type="number"
                          value={selectedItem.armourStats.magicMod}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              armourStats: { ...selectedItem.armourStats, magicMod: event.target.value },
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                      <label>
                        Type
                        <select
                          value={selectedItem.armourStats.armourType}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              armourStats: { ...selectedItem.armourStats, armourType: event.target.value as 'body' | 'shield' },
                            })
                          }
                        >
                          <option value="body">Body Armour</option>
                          <option value="shield">Shield</option>
                        </select>
                      </label>
                    </div>
                  </section>
                ) : null}

                {selectedItem.type === 'consumable' ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Consumable Stats</h3>
                    <div className="item-numeric-grid">
                      <label>
                        Use Mode
                        <select
                          value={selectedItem.consumableStats.useMode}
                          disabled={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              consumableStats: { ...selectedItem.consumableStats, useMode: event.target.value as 'consume' | 'use' },
                            })
                          }
                        >
                          <option value="consume">Consume (drink, eat, apply)</option>
                          <option value="use">Use (light, activate, burn)</option>
                        </select>
                      </label>
                      <label className="item-field-description">
                        Effect
                        <input
                          type="text"
                          value={selectedItem.consumableStats.effectText}
                          readOnly={!canEdit}
                          onChange={(event) =>
                            updateSelectedItem({
                              consumableStats: { ...selectedItem.consumableStats, effectText: event.target.value },
                            })
                          }
                        />
                      </label>
                    </div>
                  </section>
                ) : null}

                <section className="item-section">
                  <div className="section-head">
                    <h3 className="monster-section-title">Story Notes</h3>
                    {!worldNotesOpen ? (
                      <button
                        type="button"
                        className="icon-btn add-btn"
                        onClick={() =>
                          setWorldNotesOpenByItemId((current) => ({ ...current, [selectedItem.id]: true }))
                        }
                        aria-label="Show world notes"
                      >
                        <Plus size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn remove-btn"
                        onClick={() =>
                          setWorldNotesOpenByItemId((current) => ({ ...current, [selectedItem.id]: false }))
                        }
                        aria-label="Hide story notes"
                      >
                        <Minus size={13} />
                      </button>
                    )}
                  </div>
                  {worldNotesOpen ? (
                    <div className="item-world-grid">
                      <label>
                        Special Rule
                        <input
                          type="text"
                          value={selectedItem.specialRule}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ specialRule: event.target.value })}
                        />
                      </label>
                      <label>
                        Notes
                        <textarea
                          value={selectedItem.notes}
                          readOnly={!canEdit}
                          onChange={(event) => updateSelectedItem({ notes: event.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}
                </section>

                {canEdit && characters.length > 0 ? (
                  <section className="item-section">
                    <h3 className="monster-section-title">Grant to Character</h3>
                    <div className="item-grant-row">
                      <select
                        value={grantTargetId}
                        onChange={(event) => setGrantTargetId(event.target.value)}
                      >
                        <option value="">Select character…</option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || 'Unnamed'} ({c.className} {c.level})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-btn add-btn"
                        disabled={!grantTargetId || grantBusy}
                        onClick={grantItemToCharacter}
                        aria-label="Grant item to selected character"
                      >
                        <Gift size={14} />
                        {grantBusy ? ' …' : ' Grant'}
                      </button>
                    </div>
                    {grantFeedback ? <p className="item-grant-feedback">{grantFeedback}</p> : null}
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
      <ConfirmModal
        open={deleteCandidate !== null}
        title="Delete Item?"
        message={`Permanently remove "${deleteCandidate?.typeName || deleteCandidate?.name || ''}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteItem}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  )
}

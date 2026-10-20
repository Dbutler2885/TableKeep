import type {
  CampaignItem,
  CharacterGoldItem,
  CharacterInventoryItem,
} from '../../types/app'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { inventoryItemToCampaignItem } from '../items/itemConversion'

// ---------------------------------------------------------------------------
// Gold utilities (moved from CharacterTab.tsx so both CharacterTab and
// itemConversion can share them without circular deps)
// ---------------------------------------------------------------------------

export const GOLD_CHUNK_SIZE = 100
export const MAX_GOLD_CHUNKS = 500

export const normalizeGoldAmount = (amount: number): number => {
  if (!Number.isFinite(amount)) return 0
  return Math.max(0, Math.floor(amount))
}

export const goldChunksForAmount = (amount: number): number[] => {
  const safeAmount = normalizeGoldAmount(amount)
  if (safeAmount <= 0) return []
  const chunks: number[] = []
  let remaining = safeAmount
  while (remaining > 0 && chunks.length < MAX_GOLD_CHUNKS) {
    const isLastAllowedChunk = chunks.length === MAX_GOLD_CHUNKS - 1
    const chunk = isLastAllowedChunk ? remaining : Math.min(GOLD_CHUNK_SIZE, remaining)
    chunks.push(chunk)
    remaining -= chunk
  }
  return chunks
}

const makeId = (): string => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const makeGoldItem = (amount: number): CharacterGoldItem => ({
  id: makeId(),
  kind: 'gold',
  typeId: 'gold',
  typeName: 'Gold',
  costGp: 0,
  equipped: false,
  notes: '',
  qty: amount,
  stack: DEFAULT_STACK_POLICY.gold,
})

// ---------------------------------------------------------------------------
// Overflow computation (packed-slot capacity is OSE's carrying rule, in
// `ruleSets/ose/packedSlots.ts`)
// ---------------------------------------------------------------------------

export type OverflowResult = {
  keptInventory: CharacterInventoryItem[]
  droppedItems: CampaignItem[]
  droppedGoldAmount: number
  feedbackMessage: string | null
}

export function computeOverflow(
  fullInventory: CharacterInventoryItem[],
  availablePackedSlots: number,
  characterId: string,
  characterName: string,
): OverflowResult {
  const equipped = fullInventory.filter((i) => i.equipped)
  const packed = fullInventory.filter((i) => !i.equipped)

  if (packed.length <= availablePackedSlots) {
    return { keptInventory: fullInventory, droppedItems: [], droppedGoldAmount: 0, feedbackMessage: null }
  }

  const nonGold = packed.filter((i) => i.kind !== 'gold')
  const gold = packed.filter((i): i is CharacterGoldItem => i.kind === 'gold')

  const droppedItems: CampaignItem[] = []
  let keptNonGold: CharacterInventoryItem[]

  if (nonGold.length > availablePackedSlots) {
    // Non-gold exceeds capacity — LIFO: overflow newest (end of array) first
    keptNonGold = nonGold.slice(0, availablePackedSlots)
    const overflowNonGold = nonGold.slice(availablePackedSlots)
    for (const item of overflowNonGold) {
      droppedItems.push(
        inventoryItemToCampaignItem(item, {
          status: 'dropped',
          droppedByCharacterId: characterId,
          droppedByCharacterName: characterName,
        }),
      )
    }
  } else {
    keptNonGold = nonGold
  }

  const goldSlotsAvailable = availablePackedSlots - keptNonGold.length
  const totalGold = gold.reduce((sum, g) => sum + (g.qty ?? 0), 0)
  const fittableGold = Math.min(totalGold, goldSlotsAvailable * GOLD_CHUNK_SIZE)
  const droppedGoldAmount = totalGold - fittableGold

  const keptGoldItems = goldChunksForAmount(fittableGold).map((chunk) => makeGoldItem(chunk))

  const feedbackMessage = (droppedItems.length > 0 || droppedGoldAmount > 0)
    ? 'Not all items fit in packed slots, so some were moved to Dropped Items. Reorganize your loadout and ask the GM to grant them back when you have space.'
    : null

  return {
    keptInventory: [...equipped, ...keptNonGold, ...keptGoldItems],
    droppedItems,
    droppedGoldAmount,
    feedbackMessage,
  }
}

// ---------------------------------------------------------------------------
// Dropped Items documents for overflow (written by `writeDroppedOverflow.ts`)
// ---------------------------------------------------------------------------

// Default stat sub-objects for canonical CampaignItem shape
const defaultWeaponStats: CampaignItem['weaponStats'] = {
  damageDiceCount: '', damageDiceSides: '', attackBonus: '',
  damageBonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', slow: false, twoHanded: false,
}
const defaultArmourStats: CampaignItem['armourStats'] = { armourClass: '', shieldMod: '', magicMod: '', armourType: 'body' }
const defaultConsumableStats: CampaignItem['consumableStats'] = { useMode: 'consume', effectText: '' }

export function makeDroppedGoldCampaignItem(
  goldAmount: number,
  characterId: string,
  characterName: string,
  docId?: string,
): CampaignItem {
  return {
    id: docId ?? makeId(),
    name: '',
    type: 'gold',
    typeId: 'gold',
    typeName: 'Gold',
    status: 'dropped',
    droppedByCharacterId: characterId,
    droppedByCharacterName: characterName,
    portraitUrl: null,
    portraitFocusX: 50,
    portraitFocusY: 50,
    tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
    description: '',
    gpValue: '0',
    qty: '1',
    isMagic: false,
    weaponStats: defaultWeaponStats,
    weaponEffects: [],
    weaponRollTables: [],
    armourStats: defaultArmourStats,
    consumableStats: defaultConsumableStats,
    specialRule: '',
    notes: '',
    goldAmount,
  }
}

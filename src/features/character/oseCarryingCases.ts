// OSE carrying as it works today, recorded as one table of cases split by
// operation. Capacity and transfer cases hold for both the app copy and the
// Cloud Functions copy of the rule; spill cases hold for the app copy only,
// because the server never spills. `oseCarrying.function.test.ts` runs them.
import type {
  CharacterAmmunitionItem,
  CharacterGeneralItem,
  CharacterGoldItem,
  CharacterInventoryItem,
  TransferableInventoryItem,
} from '../../types/app'

export type CapacityCase = {
  name: string
  /** The character's stored `details`, which both copies read STR from. */
  details: unknown
  packedSlots: number
}

export type TransferCase = {
  name: string
  receiverStr: string
  senderInventory: CharacterInventoryItem[]
  receiverInventory: CharacterInventoryItem[]
  transfer: { itemId: string; itemSnapshot: TransferableInventoryItem }
  expected:
    | { ok: true; senderInventory: CharacterInventoryItem[]; receiverInventory: CharacterInventoryItem[] }
    | { ok: false; reason: 'packed_slots' }
}

export type SpillCase = {
  name: string
  operation: 'add' | 'grant'
  str: string
  /** The inventory once the added or granted items are in, before anything spills. */
  candidateInventory: CharacterInventoryItem[]
  expected: {
    /** Item ids in order; gold rows are re-minted, so they appear as `gold:<qty>`. */
    keptInventory: string[]
    /** Names of the items moved to Dropped Items, in order. */
    droppedItemNames: string[]
    droppedGoldAmount: number
    feedbackMessage: string | null
  }
}

export const OVERFLOW_FEEDBACK_MESSAGE =
  'Not all items fit in packed slots, so some were moved to Dropped Items. Reorganize your loadout and ask the GM to grant them back when you have space.'

const general = (id: string, overrides: Partial<CharacterGeneralItem> = {}): CharacterGeneralItem => ({
  id,
  kind: 'general',
  typeId: 'general',
  typeName: 'General',
  name: `Item ${id}`,
  costGp: 1,
  equipped: false,
  notes: '',
  qty: 1,
  stack: { stackable: false },
  ...overrides,
})

const equipped = (id: string) => general(id, { equipped: true })

const gold = (id: string, qty: number): CharacterGoldItem => ({
  id,
  kind: 'gold',
  typeId: 'gold',
  typeName: 'Gold',
  costGp: 0,
  equipped: false,
  notes: '',
  qty,
  stack: { stackable: true, maxStack: 100 },
})

const arrows = (id: string, qty: number): CharacterAmmunitionItem => ({
  id,
  kind: 'ammunition',
  typeId: 'ammo-arrows',
  typeName: 'Arrows',
  name: 'Arrows',
  costGp: 0,
  equipped: false,
  notes: '',
  qty,
  stack: { stackable: true, maxStack: 20 },
})

/** `count` packed general items with ids `{prefix}1` to `{prefix}{count}`. */
const packed = (count: number, prefix = 'p') =>
  Array.from({ length: count }, (_, index) => general(`${prefix}${index + 1}`))

const ids = (count: number, prefix = 'p') => packed(count, prefix).map((item) => item.id)

const withStr = (str: string) => ({ abilityScores: { STR: str } })

export const capacityCases: CapacityCase[] = [
  { name: 'no details gives the 13 movement slots only', details: undefined, packedSlots: 13 },
  { name: 'no ability scores gives 13', details: {}, packedSlots: 13 },
  { name: 'a blank STR gives 13', details: withStr(''), packedSlots: 13 },
  { name: 'an unreadable STR gives 13', details: withStr('strong'), packedSlots: 13 },
  { name: 'STR 3, below every threshold, gives 13', details: withStr('3'), packedSlots: 13 },
  { name: 'STR 4 meets the first threshold', details: withStr('4'), packedSlots: 14 },
  { name: 'STR 5 is still one threshold', details: withStr('5'), packedSlots: 14 },
  { name: 'STR 6 meets the second threshold', details: withStr('6'), packedSlots: 15 },
  { name: 'STR 8 is still two thresholds', details: withStr('8'), packedSlots: 15 },
  { name: 'STR 9 meets the third threshold', details: withStr('9'), packedSlots: 16 },
  { name: 'STR 12 is still three thresholds', details: withStr('12'), packedSlots: 16 },
  { name: 'STR 13 meets the fourth threshold', details: withStr('13'), packedSlots: 17 },
  { name: 'STR 15 is still four thresholds', details: withStr('15'), packedSlots: 17 },
  { name: 'STR 16 meets the fifth threshold', details: withStr('16'), packedSlots: 18 },
  { name: 'STR 17 is still five thresholds', details: withStr('17'), packedSlots: 18 },
  { name: 'STR 18 meets every threshold', details: withStr('18'), packedSlots: 19 },
]

export const transferCases: TransferCase[] = [
  {
    name: 'an item fills the last free packed slot and arrives unequipped',
    receiverStr: '3',
    senderInventory: [equipped('lantern'), general('rope')],
    receiverInventory: packed(12),
    transfer: { itemId: 'lantern', itemSnapshot: equipped('lantern') },
    expected: {
      ok: true,
      senderInventory: [general('rope')],
      receiverInventory: [...packed(12), general('lantern')],
    },
  },
  {
    name: 'one item over capacity is refused with packed_slots and nothing spills',
    receiverStr: '3',
    senderInventory: [general('rope')],
    receiverInventory: packed(13),
    transfer: { itemId: 'rope', itemSnapshot: general('rope') },
    expected: { ok: false, reason: 'packed_slots' },
  },
  {
    name: 'equipped items on the receiver do not count against packed slots',
    receiverStr: '3',
    senderInventory: [general('rope')],
    receiverInventory: [equipped('e1'), equipped('e2'), equipped('e3'), ...packed(12)],
    transfer: { itemId: 'rope', itemSnapshot: general('rope') },
    expected: {
      ok: true,
      senderInventory: [],
      receiverInventory: [equipped('e1'), equipped('e2'), equipped('e3'), ...packed(12), general('rope')],
    },
  },
  {
    name: 'gold rows on the receiver take packed slots and are not merged to make room',
    receiverStr: '3',
    senderInventory: [general('rope')],
    receiverInventory: [...packed(10), gold('g1', 10), gold('g2', 10), gold('g3', 10)],
    transfer: { itemId: 'rope', itemSnapshot: general('rope') },
    expected: { ok: false, reason: 'packed_slots' },
  },
  {
    name: 'STR 18 makes room for a nineteenth packed item',
    receiverStr: '18',
    senderInventory: [general('rope')],
    receiverInventory: packed(18),
    transfer: { itemId: 'rope', itemSnapshot: general('rope') },
    expected: {
      ok: true,
      senderInventory: [],
      receiverInventory: [...packed(18), general('rope')],
    },
  },
  {
    name: 'STR 17 refuses a nineteenth packed item',
    receiverStr: '17',
    senderInventory: [general('rope')],
    receiverInventory: packed(18),
    transfer: { itemId: 'rope', itemSnapshot: general('rope') },
    expected: { ok: false, reason: 'packed_slots' },
  },
  {
    name: 'part of a stack moves into the last free slot and the sender keeps the rest',
    receiverStr: '9',
    senderInventory: [arrows('arrows', 10)],
    receiverInventory: packed(15),
    transfer: { itemId: 'arrows', itemSnapshot: arrows('offer-arrows', 4) },
    expected: {
      ok: true,
      senderInventory: [arrows('arrows', 6)],
      receiverInventory: [...packed(15), arrows('offer-arrows', 4)],
    },
  },
]

export const spillCases: SpillCase[] = [
  {
    name: 'an inventory that fits is kept exactly, gold rows and order included',
    operation: 'add',
    str: '3',
    candidateInventory: [...packed(5), equipped('e1'), ...packed(6, 'q'), gold('g1', 30), gold('g2', 40)],
    expected: {
      keptInventory: [...ids(5), 'e1', ...ids(6, 'q'), 'gold:30', 'gold:40'],
      droppedItemNames: [],
      droppedGoldAmount: 0,
      feedbackMessage: null,
    },
  },
  {
    name: 'the newest non-gold items leave first and equipped items stay, listed first',
    operation: 'add',
    str: '3',
    candidateInventory: [...packed(13), equipped('e1'), general('late1'), general('late2')],
    expected: {
      keptInventory: ['e1', ...ids(13)],
      droppedItemNames: ['Item late1', 'Item late2'],
      droppedGoldAmount: 0,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    },
  },
  {
    name: 'an older gold row drops while newer non-gold items stay',
    operation: 'add',
    str: '3',
    candidateInventory: [gold('g1', 100), ...packed(13)],
    expected: {
      keptInventory: ids(13),
      droppedItemNames: [],
      droppedGoldAmount: 100,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    },
  },
  {
    name: 'gold and non-gold both overflow: non-gold by age, then all the gold',
    operation: 'add',
    str: '3',
    candidateInventory: [gold('g1', 70), ...packed(14)],
    expected: {
      keptInventory: ids(13),
      droppedItemNames: ['Item p14'],
      droppedGoldAmount: 70,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    },
  },
  {
    name: 'partial gold room keeps what fits in 100s and drops the rest',
    operation: 'add',
    str: '3',
    candidateInventory: [...packed(11), gold('g1', 100), gold('g2', 100), gold('g3', 150)],
    expected: {
      keptInventory: [...ids(11), 'gold:100', 'gold:100'],
      droppedItemNames: [],
      droppedGoldAmount: 150,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    },
  },
  {
    name: 'gold is rechunked by 100 into fewer rows, and nothing drops',
    operation: 'add',
    str: '3',
    candidateInventory: [...packed(10), gold('g1', 30), gold('g2', 40), gold('g3', 50), gold('g4', 60)],
    expected: {
      keptInventory: [...ids(10), 'gold:100', 'gold:80'],
      droppedItemNames: [],
      droppedGoldAmount: 0,
      feedbackMessage: null,
    },
  },
  {
    name: 'granted gold to a character with every packed slot full drops it all',
    operation: 'grant',
    str: '9',
    candidateInventory: [...packed(16), gold('g1', 100), gold('g2', 100), gold('g3', 50)],
    expected: {
      keptInventory: ids(16),
      droppedItemNames: [],
      droppedGoldAmount: 250,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    },
  },
  {
    name: 'granted items take the last free slots, so all the granted gold drops',
    operation: 'grant',
    str: '4',
    candidateInventory: [...packed(12), general('granted1'), general('granted2'), gold('g1', 100), gold('g2', 20)],
    expected: {
      keptInventory: [...ids(12), 'granted1', 'granted2'],
      droppedItemNames: [],
      droppedGoldAmount: 120,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    },
  },
]

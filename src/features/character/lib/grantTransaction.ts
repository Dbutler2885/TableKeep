import {
  doc,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore'
import type {
  CampaignItem,
  CharacterGoldItem,
  CharacterInventoryItem,
  CharacterRecord,
  CharacterSheetDetails,
} from '../../../types/app'
import { campaignItemToInventoryItem } from '../../items/itemConversion'
import { toFirestoreItem } from '../../items/useItems'
import { computeGrantedXp, projectCharacterProgress } from '../xpProgression'
import {
  computeAvailablePackedSlots,
  computeOverflow,
  goldChunksForAmount,
  makeDroppedGoldCampaignItem,
  makeGoldItem,
} from '../inventoryOverflow'
import { emptyAbilityScores, type AbilityScores } from '../characterRules'
import { makeInventoryItemFromTemplateEntry } from './grantPlanning'
import type { GrantTemplateEntry } from './characterTabTypes'

export type ResolvedGrantCampaignEntry = {
  entry: { itemId: string; name: string; qty: number }
  item: CampaignItem
}

export type ApplyGrantToCharacterParams = {
  target: CharacterRecord
  xpAmount: number
  goldAmount: number
  campaignEntries: ResolvedGrantCampaignEntry[]
  templateEntries: GrantTemplateEntry[]
  overflowGoldDocId: string
}

export type GrantTransactionResult = {
  xp: number
  inventory: CharacterInventoryItem[]
  overflowFeedback: string | null
}

export async function applyGrantToCharacter(
  tx: Transaction,
  charRef: DocumentReference<DocumentData>,
  params: ApplyGrantToCharacterParams,
): Promise<GrantTransactionResult> {
  const snap = await tx.get(charRef)
  if (!snap.exists()) throw new Error(`Target not found: ${params.target.name}`)

  const data = snap.data() as CharacterRecord
  const existingDetails = data.details && typeof data.details === 'object'
    ? data.details as CharacterSheetDetails
    : null
  const currentInventory = existingDetails?.inventory ?? []
  const abilityScores = (existingDetails?.abilityScores as AbilityScores | undefined) ?? emptyAbilityScores()

  let campaignGoldGrant = 0
  const itemsToAdd: CharacterInventoryItem[] = []
  for (const row of params.campaignEntries) {
    for (let index = 0; index < row.entry.qty; index += 1) {
      if (row.item.type === 'gold') {
        campaignGoldGrant += typeof row.item.goldAmount === 'number'
          ? row.item.goldAmount
          : (Number.parseInt(row.item.gpValue, 10) || 0)
      } else {
        itemsToAdd.push(campaignItemToInventoryItem(row.item))
      }
    }
  }
  for (const entry of params.templateEntries) {
    for (let index = 0; index < entry.qty; index += 1) {
      itemsToAdd.push(makeInventoryItemFromTemplateEntry(entry))
    }
  }

  const existingGold = currentInventory
    .filter((item): item is CharacterGoldItem => item.kind === 'gold')
    .reduce((sum, item) => sum + (item.qty ?? 0), 0)
  const goldGrantTotal = params.goldAmount + campaignGoldGrant
  const nonGoldCurrent = currentInventory.filter((item) => item.kind !== 'gold')
  const nonGoldIncoming = itemsToAdd.filter((item) => item.kind !== 'gold')
  const nextGoldItems = goldChunksForAmount(Math.max(0, existingGold + goldGrantTotal)).map(makeGoldItem)
  const candidateInventory = [...nonGoldCurrent, ...nonGoldIncoming, ...nextGoldItems]

  const strScore = Number.parseInt(abilityScores.STR ?? '', 10)
  const availableSlots = computeAvailablePackedSlots(strScore)
  const overflow = computeOverflow(
    candidateInventory,
    availableSlots,
    params.target.id,
    params.target.name,
  )
  const campaignRef = charRef.parent.parent
  if (!campaignRef) throw new Error('Character reference must be nested below a campaign document.')

  for (const droppedItem of overflow.droppedItems) {
    const droppedRef = doc(campaignRef, 'items', droppedItem.id)
    tx.set(droppedRef, {
      ...toFirestoreItem(droppedItem),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  if (overflow.droppedGoldAmount > 0) {
    const overflowGoldRef = doc(campaignRef, 'items', params.overflowGoldDocId)
    tx.set(overflowGoldRef, {
      ...toFirestoreItem(makeDroppedGoldCampaignItem(
        overflow.droppedGoldAmount,
        params.target.id,
        params.target.name,
        overflowGoldRef.id,
      )),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const bonusPercent = projectCharacterProgress(params.target, abilityScores, params.xpAmount).bonusPercent
  const grantedXp = computeGrantedXp(params.xpAmount, bonusPercent)
  const nextXp = Math.max(0, (data.xp ?? params.target.xp ?? 0) + grantedXp.awardedXp)
  tx.set(charRef, {
    xp: nextXp,
    details: {
      ...(existingDetails ?? {}),
      inventory: overflow.keptInventory,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return {
    xp: nextXp,
    inventory: overflow.keptInventory,
    overflowFeedback: overflow.feedbackMessage,
  }
}

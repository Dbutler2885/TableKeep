import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { runTransaction } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { CampaignItem, CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { OSE_STORE_ITEMS } from '../storeCatalog'
import { emptyAbilityScores, type AbilityScores } from '../characterRules'
import { projectCharacterProgress } from '../xpProgression'
import { amountForTarget } from '../lib/grantPlanning'
import { applyGrantToCharacter } from '../lib/grantTransaction'
import type { GrantTemplateEntry } from '../lib/characterTabTypes'

type Params = {
  campaignId: string
  groupId: string
  grantMode: boolean
  setGrantMode: Dispatch<SetStateAction<boolean>>
  setActivePage: (page: 'core' | 'encumbrance') => void
  setPaneView: (view: 'list' | 'detail') => void
  isSinglePane: boolean
  canGrant: boolean
  sortedCharacters: CharacterRecord[]
  campaignItems: CampaignItem[]
  abilityScoresByCharacterId: Record<string, AbilityScores>
  setInventoryByCharacterId: Dispatch<SetStateAction<Record<string, CharacterInventoryItem[]>>>
  syncCharacterLocal: (characterId: string, updates: Partial<CharacterRecord>) => void
}

export function useGrantTools({
  campaignId,
  groupId,
  grantMode,
  setGrantMode,
  setActivePage,
  setPaneView,
  isSinglePane,
  canGrant,
  sortedCharacters,
  campaignItems,
  abilityScoresByCharacterId,
  setInventoryByCharacterId,
  syncCharacterLocal,
}: Params) {
  const [grantTargetIds, setGrantTargetIds] = useState<Record<string, boolean>>({})
  const [grantXpBase, setGrantXpBase] = useState('')
  const [grantXpSplitBetweenTargets, setGrantXpSplitBetweenTargets] = useState(false)
  const [grantGoldGp, setGrantGoldGp] = useState('')
  const [grantGoldSplitBetweenTargets, setGrantGoldSplitBetweenTargets] = useState(false)
  const [grantNote, setGrantNote] = useState('')
  const [grantCampaignItemId, setGrantCampaignItemId] = useState('')
  const [grantCampaignEntries, setGrantCampaignEntries] = useState<Array<{ itemId: string; name: string; qty: number }>>([])
  const [grantTemplateItemId, setGrantTemplateItemId] = useState('')
  const [grantTemplateEntries, setGrantTemplateEntries] = useState<GrantTemplateEntry[]>([])
  const [grantBusy, setGrantBusy] = useState(false)
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null)

  const authoredCampaignItems = useMemo(
    () => campaignItems.filter((item) => item.status === 'authored'),
    [campaignItems],
  )
  const grantTemplateSelectable = useMemo(
    () => OSE_STORE_ITEMS.filter((item) =>
      item.kind === 'general'
      || item.kind === 'weapon'
      || item.kind === 'armour'
      || item.kind === 'ammunition'
      || item.kind === 'consumable'),
    [],
  )
  const selectedGrantTargetIds = useMemo(
    () => sortedCharacters.filter((character) => grantTargetIds[character.id]).map((character) => character.id),
    [grantTargetIds, sortedCharacters],
  )
  const parsedGrantBaseXp = Math.max(0, Number.parseInt(grantXpBase, 10) || 0)
  const parsedGrantGoldGp = Math.max(0, Number.parseInt(grantGoldGp, 10) || 0)
  const grantPreviewByCharacterId = useMemo(() => {
    const preview = new Map<string, ReturnType<typeof projectCharacterProgress>>()
    const targets = sortedCharacters.filter((character) => grantTargetIds[character.id])
    for (let index = 0; index < targets.length; index += 1) {
      const character = targets[index]
      const scores = abilityScoresByCharacterId[character.id] ?? emptyAbilityScores()
      const xpForTarget = amountForTarget(
        parsedGrantBaseXp,
        grantXpSplitBetweenTargets,
        targets.length,
        index,
      )
      preview.set(character.id, projectCharacterProgress(character, scores, xpForTarget))
    }
    return preview
  }, [abilityScoresByCharacterId, grantTargetIds, grantXpSplitBetweenTargets, parsedGrantBaseXp, sortedCharacters])

  const enterGrantMode = () => {
    setGrantMode(true)
    setActivePage('core')
    if (isSinglePane) setPaneView('detail')
  }
  const exitGrantMode = () => {
    setGrantMode(false)
    setGrantTargetIds({})
  }
  const exitGrantModeForCharacterSelection = () => {
    if (grantMode) setGrantMode(false)
  }
  const toggleGrantTarget = (characterId: string, checked: boolean) => {
    setGrantTargetIds((current) => ({ ...current, [characterId]: checked }))
  }
  const clearGrantDraft = () => {
    setGrantXpBase('')
    setGrantXpSplitBetweenTargets(false)
    setGrantGoldGp('')
    setGrantGoldSplitBetweenTargets(false)
    setGrantNote('')
    setGrantCampaignEntries([])
    setGrantTemplateEntries([])
    setGrantCampaignItemId('')
    setGrantTemplateItemId('')
  }
  const clearGrantDraftAndTargets = () => {
    clearGrantDraft()
    setGrantTargetIds({})
  }
  const selectAllGrantTargets = () => {
    setGrantTargetIds(Object.fromEntries(sortedCharacters.map((character) => [character.id, true])))
  }
  const clearGrantTargets = () => setGrantTargetIds({})
  const upsertGrantCampaignEntry = (item: CampaignItem) => {
    setGrantCampaignEntries((current) => {
      const index = current.findIndex((entry) => entry.itemId === item.id)
      if (index < 0) return [...current, { itemId: item.id, name: item.typeName || item.name, qty: 1 }]
      const next = [...current]
      next[index] = { ...next[index], qty: next[index].qty + 1 }
      return next
    })
  }
  const upsertGrantTemplateEntry = (itemId: string) => {
    const source = OSE_STORE_ITEMS.find((item) => item.id === itemId)
    if (!source) return
    const kind = source.kind
    if (kind !== 'general' && kind !== 'weapon' && kind !== 'armour' && kind !== 'ammunition' && kind !== 'consumable') return
    setGrantTemplateEntries((current) => {
      const index = current.findIndex((entry) => entry.key === source.id)
      if (index < 0) {
        return [...current, {
          key: source.id,
          name: source.name,
          costGp: source.costGp,
          qty: 1,
          kind,
          weaponId: source.weaponId,
          armourId: source.armourId,
          packedLabel: source.name,
        }]
      }
      const next = [...current]
      next[index] = { ...next[index], qty: next[index].qty + 1 }
      return next
    })
  }

  const applyGrantToSelectedTargets = async () => {
    if (!canGrant || grantBusy) return
    const targetIds = selectedGrantTargetIds
    if (targetIds.length === 0) {
      setGrantFeedback('Select at least one target.')
      return
    }
    if (parsedGrantBaseXp <= 0 && parsedGrantGoldGp <= 0 && grantCampaignEntries.length === 0 && grantTemplateEntries.length === 0) {
      setGrantFeedback('Add XP, gp, or items before granting.')
      return
    }

    const campaignEntriesResolved = grantCampaignEntries
      .map((entry) => ({ entry, item: authoredCampaignItems.find((item) => item.id === entry.itemId) ?? null }))
      .filter((row): row is { entry: { itemId: string; name: string; qty: number }; item: CampaignItem } => row.item !== null)

    setGrantBusy(true)
    setGrantFeedback(null)
    try {
      const overflowMessages: string[] = []
      for (let targetIndex = 0; targetIndex < targetIds.length; targetIndex += 1) {
        const targetId = targetIds[targetIndex]
        const target = sortedCharacters.find((character) => character.id === targetId)
        if (!target) continue
        const charRef = campaignDocRef(db, { campaignId, groupId }, 'characters', targetId)
        const result = await runTransaction(db, (tx) => applyGrantToCharacter(tx, charRef, {
          target,
          xpAmount: amountForTarget(parsedGrantBaseXp, grantXpSplitBetweenTargets, targetIds.length, targetIndex),
          goldAmount: amountForTarget(parsedGrantGoldGp, grantGoldSplitBetweenTargets, targetIds.length, targetIndex),
          campaignEntries: campaignEntriesResolved,
          templateEntries: grantTemplateEntries,
          overflowGoldDocId: crypto.randomUUID(),
        }))
        if (result.overflowFeedback) overflowMessages.push(`${target.name}: ${result.overflowFeedback}`)
        setInventoryByCharacterId((current) => ({ ...current, [targetId]: result.inventory }))
        syncCharacterLocal(targetId, { xp: result.xp })
      }

      const parts = [`Granted to ${targetIds.length} character${targetIds.length === 1 ? '' : 's'}`]
      if (parsedGrantBaseXp > 0) parts.push(`${parsedGrantBaseXp} base XP`)
      if (parsedGrantGoldGp > 0) parts.push(`${parsedGrantGoldGp} gp`)
      if (grantXpSplitBetweenTargets && parsedGrantBaseXp > 0) parts.push('XP split')
      if (grantGoldSplitBetweenTargets && parsedGrantGoldGp > 0) parts.push('gp split')
      if (grantCampaignEntries.length > 0 || grantTemplateEntries.length > 0) parts.push('items')
      const overflowSummary = overflowMessages.length > 0 ? ` | Overflow: ${overflowMessages.join(' / ')}` : ''
      setGrantFeedback(`${parts.join(' • ')}${overflowSummary}`)
      clearGrantDraft()
      setGrantTargetIds({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setGrantFeedback(`Grant failed: ${message}`)
    } finally {
      setGrantBusy(false)
    }
  }

  return {
    grantTargetIds,
    setGrantTargetIds,
    grantXpBase,
    setGrantXpBase,
    grantXpSplitBetweenTargets,
    setGrantXpSplitBetweenTargets,
    grantGoldGp,
    setGrantGoldGp,
    grantGoldSplitBetweenTargets,
    setGrantGoldSplitBetweenTargets,
    grantNote,
    setGrantNote,
    grantCampaignItemId,
    setGrantCampaignItemId,
    grantCampaignEntries,
    setGrantCampaignEntries,
    grantTemplateItemId,
    setGrantTemplateItemId,
    grantTemplateEntries,
    setGrantTemplateEntries,
    grantBusy,
    grantFeedback,
    authoredCampaignItems,
    grantTemplateSelectable,
    selectedGrantTargetIds,
    parsedGrantBaseXp,
    parsedGrantGoldGp,
    grantPreviewByCharacterId,
    enterGrantMode,
    exitGrantMode,
    exitGrantModeForCharacterSelection,
    toggleGrantTarget,
    clearGrantDraftAndTargets,
    selectAllGrantTargets,
    clearGrantTargets,
    upsertGrantCampaignEntry,
    upsertGrantTemplateEntry,
    applyGrantToSelectedTargets,
  }
}

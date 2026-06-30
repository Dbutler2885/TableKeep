import { useState } from 'react'
import { Coins, Plus, Trash2, UserRound } from 'lucide-react'
import type { Role } from '../../types/app'
import { ConfirmModal } from '../common/ConfirmModal'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { uploadEntityImage } from '../common/mediaStorage'
import { makeId } from './characterFactories'
import { DotRating } from './DotRating'
import { useVtmCharacters } from './useVtmCharacters'
import { useVtmRoller, type VtmRoller } from './useVtmRoller'
import { VtmRollBar } from './VtmRollBar'
import {
  VTM_ABILITIES,
  VTM_ATTRIBUTES,
  VTM_BACKGROUNDS,
  VTM_CLANS,
  VTM_DISCIPLINES,
  VTM_GENERATIONS,
  VTM_VIRTUES,
  vtmClanWeakness,
  vtmDisciplineClanCostNote,
  vtmDisciplineContextSummary,
  vtmDisciplinePickerOptions,
  vtmSuggestedDisciplines,
} from './vtmRuleset'
import type { VtmAbilityCategory, VtmAttributeCategory, VtmClanId } from './vtmRuleset'
import type { VtmCharacterRecord, VtmCharacterSheet, VtmCreationPriority, VtmFreebieDots, VtmRatedRow } from './vtmTypes'
import {
  abilityPoolStatus,
  ABILITY_POOL_BY_PRIORITY,
  attributePoolStatus,
  ATTRIBUTE_POOL_BY_PRIORITY,
  backgroundPoolStatus,
  deriveBloodPoolMax,
  deriveHumanity,
  deriveWillpower,
  disciplinePoolStatus,
  dotMaxForPhase,
  emptyFreebieDots,
  freebiePointsFromDots,
  freebieStatus,
  FREEBIE_COSTS,
  sheetCreationErrors,
  virtuePoolStatus,
} from './vtmCreation'
import { applyVtmXpSpend, xpCostForNewTrait, xpCostToRaise, xpRuleLabel } from './vtmXp'

export type VtmCharacterTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
  currentUserId: string
  currentUsername: string
  gmUserId: string | null
  setError: (message: string) => void
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const healthLevels = [
  ['Bruised', '0'],
  ['Hurt', '-1'],
  ['Injured', '-1'],
  ['Wounded', '-2'],
  ['Mauled', '-2'],
  ['Crippled', '-5'],
  ['Incapacitated', ''],
] as const

function rowsWithFallback(rows: VtmRatedRow[], options: readonly string[]): VtmRatedRow[] {
  if (rows.length > 0) return rows
  return options.slice(0, 3).map((name) => ({ id: makeId(), name, rating: 0 }))
}

const PRIORITY_ORDER: VtmCreationPriority[] = ['primary', 'secondary', 'tertiary']

function CappedTracker({
  value,
  cap,
  max,
  label,
  disabled = false,
  onCurrentChange,
  onCapChange,
}: {
  value: number
  cap: number
  max: number
  label: string
  disabled?: boolean
  onCurrentChange: (next: number) => void
  onCapChange?: (next: number) => void
}) {
  const normalizedMax = Math.max(1, Math.floor(max || 1))
  const normalizedCap = Math.max(1, Math.min(normalizedMax, Math.floor(cap || 1)))
  const normalized = Math.max(0, Math.min(normalizedCap, Math.floor(value || 0)))

  return (
    <div className="vtm-capped-tracker" role="group" aria-label={`${label}: current ${normalized}, cap ${normalizedCap}`}>
      {Array.from({ length: normalizedMax }, (_, index) => {
        const dotValue = index + 1
        const current = dotValue <= normalized
        const withinCap = dotValue <= normalizedCap
        const isCap = dotValue === normalizedCap
        return (
          <button
            key={dotValue}
            type="button"
            className={[
              'vtm-capped-dot',
              current ? 'current' : '',
              withinCap ? 'within-cap' : 'beyond-cap',
              isCap ? 'cap' : '',
            ].filter(Boolean).join(' ')}
            aria-label={`${label}: set ${dotValue}${isCap ? ' permanent cap' : ''}`}
            aria-pressed={current}
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              if (dotValue > normalizedCap) {
                if (onCapChange) onCapChange(dotValue)
                return
              }
              onCurrentChange(current ? dotValue - 1 : dotValue)
            }}
          />
        )
      })}
    </div>
  )
}

// Segmented Primary/Secondary/Tertiary picker. Shows each tier's dot budget;
// picking a tier swaps it away from whichever column currently holds it, so the
// three categories always stay a valid 7/5/3 (or 13/9/5) permutation.
function PrioritySegmented({
  value,
  budgets,
  disabled,
  onPick,
}: {
  value: VtmCreationPriority
  budgets: Record<VtmCreationPriority, number>
  disabled: boolean
  onPick: (next: VtmCreationPriority) => void
}) {
  return (
    <div className="vtm-priority" role="group" aria-label="Priority">
      {PRIORITY_ORDER.map((priority) => (
        <button
          key={priority}
          type="button"
          className={value === priority ? 'active' : ''}
          disabled={disabled}
          title={`${priority.charAt(0).toUpperCase() + priority.slice(1)} — ${budgets[priority]} dots`}
          aria-pressed={value === priority}
          onClick={() => onPick(priority)}
        >
          {budgets[priority]}
        </button>
      ))}
    </div>
  )
}

export function VtmCharacterTab({
  campaignId,
  groupId,
  role,
  currentUserId,
  currentUsername,
  gmUserId,
  setError,
}: VtmCharacterTabProps) {
  const {
    characters,
    charactersLoading,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    addCharacter,
    updateCharacter,
    deleteCharacter,
  } = useVtmCharacters(campaignId, groupId, currentUserId, currentUsername, role, gmUserId, setError)
  const roller = useVtmRoller(selectedCharacterId)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [freebieMode, setFreebieMode] = useState(false)
  const [spendXpMode, setSpendXpMode] = useState(false)
  const [xpGrantAmount, setXpGrantAmount] = useState('')
  const [xpGrantNote, setXpGrantNote] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [grantMode, setGrantMode] = useState(false)
  const [grantSplit, setGrantSplit] = useState(false)
  const [grantTargetIds, setGrantTargetIds] = useState<Record<string, boolean>>({})
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null)
  const [freebieGateOpen, setFreebieGateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // Players may own multiple characters and switch between them via the list.
  const canCreate = role === 'gm' || role === 'player'
  const canEdit = !!selectedCharacter && (role === 'gm' || selectedCharacter.ownerUserId === currentUserId)
  const sheet = selectedCharacter?.vtm ?? null
  const isDraft = selectedCharacter?.creationStatus === 'draft' || selectedCharacter?.creationStatus === 'established_draft'
  const isGuidedDraft = selectedCharacter?.creationMode === 'new' && isDraft
  const isActive = selectedCharacter?.creationStatus === 'active'
  const xpMode = isActive && spendXpMode
  const xpBalance = selectedCharacter?.xp ?? 0
  const bloodPoolMax = sheet ? deriveBloodPoolMax(sheet.generation) : null
  // Scaling Traits cap at 5 during creation and at the generation Trait Max in play.
  const traitDotMax = dotMaxForPhase(sheet?.generation, isActive)

  // Starting pools must be fully assigned before freebies open.
  const incompletePools = sheet
    ? [
        ...Object.keys(VTM_ATTRIBUTES).map((category) => ({ label: `${titleCase(category)} Attributes`, status: attributePoolStatus(sheet, category as VtmAttributeCategory) })),
        ...Object.keys(VTM_ABILITIES).map((category) => ({ label: titleCase(category), status: abilityPoolStatus(sheet, category as VtmAbilityCategory) })),
        { label: 'Disciplines', status: disciplinePoolStatus(sheet) },
        { label: 'Backgrounds', status: backgroundPoolStatus(sheet) },
        { label: 'Virtues', status: virtuePoolStatus(sheet) },
      ].filter((pool) => pool.status.remaining !== 0)
    : []
  const baseAssignmentComplete = incompletePools.length === 0

  const updateSelected = (updates: Partial<VtmCharacterRecord>) => {
    if (!selectedCharacter || !canEdit) return
    updateCharacter(selectedCharacter.id, updates)
  }

  const updateSheet = (updater: (current: VtmCharacterSheet) => VtmCharacterSheet) => {
    if (!selectedCharacter || !canEdit) return
    updateCharacter(selectedCharacter.id, { vtm: updater(selectedCharacter.vtm) })
  }

  const uploadCharacterTokenImage = async (file: File) => {
    if (!selectedCharacter || !canEdit) throw new Error('No editable character selected.')
    const { path, url, name } = await uploadEntityImage({
      campaignId,
      groupId,
      collectionName: 'characters',
      entityId: selectedCharacter.id,
      mediaKind: 'token-icons',
      file,
      maxWidth: 1024,
      maxHeight: 1024,
    })
    return { customImagePath: path, customImageUrl: url, customImageName: name }
  }

  const uploadCharacterPortraitImage = async (file: File) => {
    if (!selectedCharacter || !canEdit) throw new Error('No editable character selected.')
    const { path, url } = await uploadEntityImage({
      campaignId,
      groupId,
      collectionName: 'characters',
      entityId: selectedCharacter.id,
      mediaKind: 'portraits',
      file,
      maxWidth: 600,
      maxHeight: 800,
    })
    return { portraitPath: path, portraitUrl: url }
  }

  const prepareXpSpend = (
    category: Parameters<typeof xpCostToRaise>[0],
    currentRating: number,
    note: string,
    discipline?: string,
  ) => {
    if (!selectedCharacter || !sheet) return null
    const cost = currentRating === 0 && category === 'ability'
      ? xpCostForNewTrait('ability')
      : currentRating === 0 && category === 'discipline'
        ? xpCostForNewTrait('discipline')
        : xpCostToRaise(category, currentRating, { clan: sheet.clan, discipline })
    const spend = applyVtmXpSpend({ balance: xpBalance, cost, note, nowMs: Date.now() })
    if (!spend.ok) {
      setFeedback(`Not enough XP. Need ${cost}.`)
      return null
    }
    setFeedback(`Spent ${cost} XP.`)
    return spend
  }

  const canApplyDotChange = (
    currentRating: number,
    nextRating: number,
    freebieCost: number,
    xpCategory: Parameters<typeof xpCostToRaise>[0] | null,
    note: string,
    freebiePool: keyof VtmFreebieDots,
    discipline?: string,
  ): { ok: true; freebiePointsSpent: number; freebieDots: VtmFreebieDots; xpBalance: number; xpLedger: VtmCharacterSheet['xpLedger'] } | { ok: false } => {
    if (!selectedCharacter || !sheet) return { ok: false }
    const freebieDots = sheet.freebieDots ?? emptyFreebieDots()
    if (isActive) {
      if (!spendXpMode || nextRating <= currentRating || !xpCategory) {
        if (!xpCategory && nextRating > currentRating) setFeedback('Backgrounds are story-driven and cannot be raised with XP here.')
        return { ok: false }
      }
      const spend = prepareXpSpend(xpCategory, currentRating, note, discipline)
      if (!spend) return { ok: false }
      return {
        ok: true,
        freebiePointsSpent: sheet.freebiePointsSpent,
        freebieDots,
        xpBalance: spend.balance,
        xpLedger: [spend.entry, ...sheet.xpLedger],
      }
    }
    if (!isGuidedDraft || !freebieMode) {
      return { ok: true, freebiePointsSpent: sheet.freebiePointsSpent, freebieDots, xpBalance, xpLedger: sheet.xpLedger }
    }
    // Freebie phase: record the freebie-funded dots for this pool so the creation
    // pool validators count them against the 15-point freebie budget, not the
    // starting pool budget. freebiePointsSpent is derived from those dots.
    const nextPoolDots = Math.max(0, (freebieDots[freebiePool] ?? 0) + (nextRating - currentRating))
    const nextFreebieDots: VtmFreebieDots = { ...freebieDots, [freebiePool]: nextPoolDots }
    const nextFreebiePointsSpent = freebiePointsFromDots(nextFreebieDots)
    const status = freebieStatus({ freebiePointsSpent: nextFreebiePointsSpent })
    if (status.over) {
      setFeedback(`Not enough freebie points. Need ${Math.max(0, (nextRating - currentRating) * freebieCost)}.`)
      return { ok: false }
    }
    return { ok: true, freebiePointsSpent: nextFreebiePointsSpent, freebieDots: nextFreebieDots, xpBalance, xpLedger: sheet.xpLedger }
  }

  const setAttributeDot = (category: VtmAttributeCategory, name: string, nextRating: number) => {
    if (!sheet) return
    const currentRating = sheet.attributes[category][name] ?? 1
    const dotChange = canApplyDotChange(currentRating, nextRating, FREEBIE_COSTS.attribute, 'attribute', `Raise ${name}`, category)
    if (!dotChange.ok) return
    const nextSheet: VtmCharacterSheet = {
      ...sheet,
      freebiePointsSpent: dotChange.freebiePointsSpent,
      freebieDots: dotChange.freebieDots,
      xpLedger: dotChange.xpLedger,
      attributes: {
        ...sheet.attributes,
        [category]: { ...sheet.attributes[category], [name]: nextRating },
      },
    }
    if (isGuidedDraft && !freebieMode && attributePoolStatus(nextSheet, category).over) {
      setFeedback(`${titleCase(category)} Attributes are out of points.`)
      return
    }
    updateSelected({ xp: dotChange.xpBalance, vtm: nextSheet })
  }

  const setAbilityDot = (category: VtmAbilityCategory, name: string, nextRating: number) => {
    if (!sheet) return
    const currentRating = sheet.abilities[category][name] ?? 0
    const dotChange = canApplyDotChange(currentRating, nextRating, FREEBIE_COSTS.ability, 'ability', `Raise ${name}`, category)
    if (!dotChange.ok) return
    const nextSheet: VtmCharacterSheet = {
      ...sheet,
      freebiePointsSpent: dotChange.freebiePointsSpent,
      freebieDots: dotChange.freebieDots,
      xpLedger: dotChange.xpLedger,
      abilities: {
        ...sheet.abilities,
        [category]: { ...sheet.abilities[category], [name]: nextRating },
      },
    }
    if (isGuidedDraft && !freebieMode && abilityPoolStatus(nextSheet, category).over) {
      setFeedback(`${titleCase(category)} are out of points.`)
      return
    }
    updateSelected({ xp: dotChange.xpBalance, vtm: nextSheet })
  }

  const setVirtueDot = (name: string, nextRating: number) => {
    if (!sheet) return
    const currentRating = sheet.virtues[name] ?? 1
    const dotChange = canApplyDotChange(currentRating, nextRating, FREEBIE_COSTS.virtue, 'virtue', `Raise ${name}`, 'virtues')
    if (!dotChange.ok) return
    const nextVirtues = { ...sheet.virtues, [name]: nextRating }
    const nextSheet: VtmCharacterSheet = {
      ...sheet,
      freebiePointsSpent: dotChange.freebiePointsSpent,
      freebieDots: dotChange.freebieDots,
      xpLedger: dotChange.xpLedger,
      virtues: nextVirtues,
      // Re-derive Humanity/Willpower from the Virtues, but keep any dots already
      // bought with freebies so a later Virtue edit does not silently refund them.
      ...(isDraft
        ? {
            humanity: Math.min(10, deriveHumanity(nextVirtues) + (dotChange.freebieDots.humanity ?? 0)),
            willpowerPermanent: Math.min(10, deriveWillpower(nextVirtues) + (dotChange.freebieDots.willpower ?? 0)),
          }
        : {}),
    }
    if (isGuidedDraft && !freebieMode && virtuePoolStatus(nextSheet).over) {
      setFeedback('Virtues are out of points.')
      return
    }
    updateSelected({ xp: dotChange.xpBalance, vtm: nextSheet })
  }

  const setWillpowerCap = (nextRating: number) => {
    if (!sheet) return
    if (isGuidedDraft && !freebieMode) {
      setFeedback('Starting Willpower is set by Courage until the freebie step.')
      return
    }
    const currentRating = sheet.willpowerPermanent
    const dotChange = canApplyDotChange(currentRating, nextRating, FREEBIE_COSTS.willpower, 'willpower', 'Raise Willpower', 'willpower')
    if (!dotChange.ok) return
    updateSelected({
      xp: dotChange.xpBalance,
      vtm: {
        ...sheet,
        freebiePointsSpent: dotChange.freebiePointsSpent,
        freebieDots: dotChange.freebieDots,
        xpLedger: dotChange.xpLedger,
        willpowerPermanent: nextRating,
        willpowerTemporary: Math.min(sheet.willpowerTemporary, nextRating),
      },
    })
  }

  const setHumanityDot = (nextRating: number) => {
    if (!sheet) return
    if (!isGuidedDraft) {
      // Active play / established drafts keep their existing behavior: raises cost
      // XP when Spend XP is on, everything else (degeneration, etc.) is a free set.
      if (nextRating > sheet.humanity && spendXpMode) {
        applyTrackerRaise('humanity', sheet.humanity, 'Raise Humanity', (current) => ({ ...current, humanity: nextRating }))
        return
      }
      updateSheet((current) => ({ ...current, humanity: nextRating }))
      return
    }
    if (!freebieMode) {
      setFeedback('Starting Humanity comes from Conscience + Self-Control until the freebie step.')
      return
    }
    const dotChange = canApplyDotChange(sheet.humanity, nextRating, FREEBIE_COSTS.humanity, 'humanity', 'Raise Humanity', 'humanity')
    if (!dotChange.ok) return
    updateSelected({
      xp: dotChange.xpBalance,
      vtm: {
        ...sheet,
        freebiePointsSpent: dotChange.freebiePointsSpent,
        freebieDots: dotChange.freebieDots,
        xpLedger: dotChange.xpLedger,
        humanity: Math.min(10, nextRating),
      },
    })
  }

  const updateRatedRows = (
    key: 'disciplines' | 'backgrounds' | 'otherTraits',
    rows: VtmRatedRow[],
    rowId: string,
    updates: Partial<VtmRatedRow>,
  ) => {
    if (!sheet) return
    updateSheet((current) => ({
      ...current,
      [key]: rows.map((row) => row.id === rowId ? { ...row, ...updates } : row),
    }))
  }

  const setRatedRowDot = (
    key: 'disciplines' | 'backgrounds' | 'otherTraits',
    rows: VtmRatedRow[],
    rowId: string,
    nextRating: number,
  ) => {
    if (!sheet) return
    const row = rows.find((entry) => entry.id === rowId)
    if (!row) return
    const isDiscipline = key === 'disciplines'
    const isBackground = key === 'backgrounds'
    const freebieCost = isDiscipline ? FREEBIE_COSTS.discipline : isBackground ? FREEBIE_COSTS.background : FREEBIE_COSTS.ability
    const xpCategory = isDiscipline ? 'discipline' : isBackground ? null : 'ability'
    // Only disciplines and backgrounds carry a creation pool; otherTraits never
    // reaches this path (it has its own free editor), so the pool key is moot there.
    const freebiePool: keyof VtmFreebieDots = isDiscipline ? 'disciplines' : 'backgrounds'
    const dotChange = canApplyDotChange(row.rating, nextRating, freebieCost, xpCategory, `Raise ${row.name}`, freebiePool, row.name)
    if (!dotChange.ok) return
    const nextRows = rows.map((entry) => entry.id === rowId ? { ...entry, rating: nextRating } : entry)
    const nextSheet: VtmCharacterSheet = {
      ...sheet,
      freebiePointsSpent: dotChange.freebiePointsSpent,
      freebieDots: dotChange.freebieDots,
      xpLedger: dotChange.xpLedger,
      [key]: nextRows,
    }
    if (isGuidedDraft && !freebieMode) {
      const status = isDiscipline ? disciplinePoolStatus(nextSheet) : isBackground ? backgroundPoolStatus(nextSheet) : null
      if (status?.over) {
        setFeedback(`${isDiscipline ? 'Disciplines' : 'Backgrounds'} are out of points.`)
        return
      }
    }
    updateSelected({ xp: dotChange.xpBalance, vtm: nextSheet })
  }

  const applyTrackerRaise = (
    category: Parameters<typeof xpCostToRaise>[0],
    currentRating: number,
    note: string,
    buildNextSheet: (base: VtmCharacterSheet) => VtmCharacterSheet,
  ) => {
    if (!sheet) return
    if (!spendXpMode) {
      updateSelected({ vtm: buildNextSheet(sheet) })
      return
    }
    const spend = prepareXpSpend(category, currentRating, note)
    if (!spend) return
    updateSelected({
      xp: spend.balance,
      vtm: buildNextSheet({ ...sheet, xpLedger: [spend.entry, ...sheet.xpLedger] }),
    })
  }

  const finalizeCharacter = () => {
    if (!selectedCharacter || !sheet) return
    const errors = selectedCharacter.creationMode === 'new' ? sheetCreationErrors(sheet) : []
    if (errors.length > 0) {
      setFeedback('Resolve overspent creation pools before finalizing.')
      return
    }
    if (selectedCharacter.creationMode === 'new' && sheet.bloodPoolCurrent <= 0) {
      setFeedback('Roll starting Blood Pool before finalizing.')
      return
    }
    updateSelected({ creationStatus: 'active' })
    setFreebieMode(false)
    setFeedback('Character finalized.')
  }

  const selectedGrantTargetIds = characters.filter((character) => grantTargetIds[character.id]).map((character) => character.id)
  const parsedGrantBaseXp = Math.max(0, Math.floor(Number.parseInt(xpGrantAmount, 10) || 0))

  const toggleGrantTarget = (characterId: string, checked: boolean) => {
    setGrantTargetIds((current) => ({ ...current, [characterId]: checked }))
  }

  const amountForTarget = (total: number, split: boolean, targetCount: number, targetIndex: number): number => {
    if (!split || targetCount <= 0) return total
    const base = Math.floor(total / targetCount)
    const remainder = total % targetCount
    return base + (targetIndex < remainder ? 1 : 0)
  }

  const applyXpGrant = () => {
    if (role !== 'gm') return
    const targets = selectedGrantTargetIds
    if (parsedGrantBaseXp <= 0 || targets.length === 0) {
      setGrantFeedback('Enter an XP amount and choose at least one character.')
      return
    }
    const note = xpGrantNote.trim()
    const nowMs = Date.now()
    targets.forEach((characterId, index) => {
      const target = characters.find((character) => character.id === characterId)
      if (!target) return
      const amount = amountForTarget(parsedGrantBaseXp, grantSplit, targets.length, index)
      if (amount <= 0) return
      const entry = { id: `${makeId()}-${index}`, type: 'award' as const, amount, note, createdAtMs: nowMs }
      updateCharacter(characterId, {
        xp: target.xp + amount,
        vtm: { ...target.vtm, xpLedger: [entry, ...target.vtm.xpLedger] },
      })
    })
    setGrantFeedback(`Granted ${grantSplit ? `${parsedGrantBaseXp} XP split across` : `${parsedGrantBaseXp} XP to each of`} ${targets.length} character${targets.length === 1 ? '' : 's'}.`)
    setXpGrantAmount('')
    setXpGrantNote('')
  }

  const disciplineOptions = vtmDisciplinePickerOptions()
  const suggestedDisciplines = sheet ? vtmSuggestedDisciplines(sheet.clan) : [...VTM_DISCIPLINES]
  const disciplineRows = sheet ? rowsWithFallback(sheet.disciplines, suggestedDisciplines) : []
  const backgroundRows = sheet ? rowsWithFallback(sheet.backgrounds, VTM_BACKGROUNDS) : []

  return (
    <div className="maps-layout monsters-layout characters-layout vtm-character-tab">
      <aside className="maps-sidebar monsters-sidebar characters-sidebar">
        <div className="maps-sidebar-header">
          <h2>Characters</h2>
          {canCreate ? (
            <button type="button" className="monster-add-btn" onClick={() => setCreateModalOpen(true)} aria-label="Add character">
              <Plus size={16} />
            </button>
          ) : null}
        </div>

        {charactersLoading ? <p>Loading characters...</p> : null}
        {characters.length === 0 ? <p>No characters available.</p> : null}

        <div className="monster-list-grid character-list-grid">
          {role === 'gm' ? (
            <button
              type="button"
              className={grantMode ? 'monster-list-item active' : 'monster-list-item'}
              onClick={() => { setGrantMode((current) => !current); setGrantFeedback(null) }}
            >
              <div className="monster-card-portrait"><div className="monster-portrait-empty small"><Coins size={14} /></div></div>
              <div className="monster-card-main">
                <div className="character-card-title-row"><h4>Grant</h4></div>
                <p className="monster-card-statline">Award XP to the coterie</p>
                <p>{grantMode ? 'Grant mode active' : 'Open grant mode'}</p>
              </div>
            </button>
          ) : null}
          {characters.map((character) => {
            const clanName = character.vtm.clan ? VTM_CLANS.find((clan) => clan.id === character.vtm.clan)?.name : 'Unclanned'
            const canDeleteThis = role === 'gm' || character.ownerUserId === currentUserId
            return (
              <div key={character.id} className="character-list-item-wrap">
                <button
                  type="button"
                  className={character.id === selectedCharacterId ? 'monster-list-item active' : 'monster-list-item'}
                  onClick={() => setSelectedCharacterId(character.id)}
                >
                  <div className="monster-card-portrait">
                    {character.portraitUrl ? (
                      <img src={character.portraitUrl} alt={`${character.name} portrait`} className="monster-portrait" style={{ objectPosition: `${character.portraitFocusX}% ${character.portraitFocusY}%` }} />
                    ) : (
                      <div className="monster-portrait-empty small"><UserRound size={14} /></div>
                    )}
                  </div>
                  <div className="monster-card-main">
                    <div className="character-card-title-row"><h4>{character.name || 'Unnamed Character'}</h4></div>
                    <p className="monster-card-statline">{clanName}{character.vtm.generation ? ` • ${character.vtm.generation}` : ''}</p>
                    <p>XP {character.xp}</p>
                    <p className="character-card-owner">{character.ownerUsername || 'Unassigned'}</p>
                  </div>
                </button>
                {grantMode && role === 'gm' ? (
                  <label className="character-card-grant-target" onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={!!grantTargetIds[character.id]} onChange={(event) => toggleGrantTarget(character.id, event.target.checked)} aria-label={`Select ${character.name || 'character'} as grant target`} />
                  </label>
                ) : null}
                {canDeleteThis && !grantMode ? (
                  <button type="button" className="map-delete-btn character-card-delete-btn" onClick={() => setDeleteTarget({ id: character.id, name: character.name || 'this character' })} aria-label={`Delete ${character.name || 'character'}`}>
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </aside>

      <div className="monsters-detail characters-detail">
        <div className="monsters-detail-inner characters-detail-inner">
          <div className="character-sheet vtm-sheet">
        {grantMode && role === 'gm' ? (
          <section className="character-placeholder-block vtm-block vtm-grant-builder">
            <h3 className="vtm-rule-title">Grant Experience</h3>
            <p className="settings-help">Award XP to one or more characters at once.</p>
            <div className="vtm-grant-controls">
              <label className="vtm-grant-field">
                <span>XP amount</span>
                <input type="number" min={0} value={xpGrantAmount} onChange={(event) => setXpGrantAmount(event.target.value)} />
              </label>
              <label className="vtm-grant-field vtm-grant-note">
                <span>Note</span>
                <input value={xpGrantNote} placeholder="e.g. Session 4" onChange={(event) => setXpGrantNote(event.target.value)} />
              </label>
              <label className="vtm-toggle">
                <input type="checkbox" checked={grantSplit} onChange={(event) => setGrantSplit(event.target.checked)} /> Split between targets
              </label>
            </div>
            <p className="settings-help">Tick the characters in the sidebar to choose who receives this award.</p>
            {grantFeedback ? <p className="settings-help vtm-feedback">{grantFeedback}</p> : null}
            <div className="vtm-grant-actions">
              <span className="vtm-pool-chip wide">{selectedGrantTargetIds.length} selected</span>
              <button type="button" className="vtm-finalize" onClick={applyXpGrant} disabled={parsedGrantBaseXp <= 0 || selectedGrantTargetIds.length === 0}>
                <Coins size={14} /> Grant XP
              </button>
            </div>
          </section>
        ) : !selectedCharacter || !sheet ? (
          <div className="character-placeholder-block">
            <h2>No VtM character selected</h2>
            <p>Create or select a character to start filling the sheet.</p>
          </div>
        ) : (
          <>
            <div className="character-sheet-header">
              <div>
                <h2>{selectedCharacter.name}</h2>
                <p className="settings-help">
                  {selectedCharacter.creationStatus === 'active' ? 'Active' : selectedCharacter.creationMode === 'new' ? 'Guided creation' : 'Established draft'}
                  {' · '}
                  XP {xpBalance}
                </p>
              </div>
              {canEdit ? (
                <button type="button" className="confirm-danger" onClick={() => setDeleteTarget({ id: selectedCharacter.id, name: selectedCharacter.name || 'this character' })}>
                  <Trash2 size={14} /> Delete
                </button>
              ) : null}
            </div>

            <section className="character-summary-grid vtm-identity">
              <EntityMediaEditor
                entityName={selectedCharacter.name}
                portraitUrl={selectedCharacter.portraitUrl}
                portraitFocusX={selectedCharacter.portraitFocusX}
                portraitFocusY={selectedCharacter.portraitFocusY}
                tokenIcon={selectedCharacter.tokenIcon}
                portraitAltLabel={`${selectedCharacter.name} portrait`}
                disabled={!canEdit}
                onUploadTokenImage={uploadCharacterTokenImage}
                onUploadPortraitImage={uploadCharacterPortraitImage}
                onChange={(updates) => updateSelected(updates)}
              />
              <div className="vtm-identity-fields">
              <label>Name<input value={selectedCharacter.name} disabled={!canEdit} onChange={(event) => updateSelected({ name: event.target.value })} /></label>
              {(['chronicle', 'concept', 'sire', 'nature', 'demeanor'] as const).map((field) => (
                <label key={field}>
                  {titleCase(field)}
                  <input value={sheet[field]} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, [field]: event.target.value }))} />
                </label>
              ))}
              <label>
                Clan
                <select
                  value={sheet.clan}
                  disabled={!canEdit}
                  onChange={(event) => {
                    const clan = event.target.value as VtmClanId | ''
                    updateSheet((current) => ({ ...current, clan, weakness: clan ? vtmClanWeakness(clan) : '' }))
                  }}
                >
                  <option value="">Choose clan</option>
                  {VTM_CLANS.map((clan) => <option key={clan.id} value={clan.id}>{clan.name}</option>)}
                </select>
              </label>
              <label>
                Generation
                <select value={sheet.generation} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, generation: event.target.value }))}>
                  {VTM_GENERATIONS.map((generation) => <option key={generation.value} value={generation.value}>{generation.label}</option>)}
                </select>
              </label>
              </div>
            </section>

            {sheet.clan || sheet.weakness ? (
              <label className="vtm-weakness">
                <span>Clan Weakness</span>
                <textarea value={sheet.weakness} disabled={!canEdit} rows={2} placeholder="Auto-filled from clan" onChange={(event) => updateSheet((current) => ({ ...current, weakness: event.target.value }))} />
              </label>
            ) : null}

            <section className={`character-placeholder-block vtm-block vtm-creation${isActive ? ' is-active-state' : ''}`}>
              <h3 className="vtm-rule-title">{isActive ? 'Chronicle' : 'Creation'}</h3>
              <div className="vtm-creation-bar">
                {isGuidedDraft ? (
                  <>
                    <label className="vtm-toggle">
                      <input
                        type="checkbox"
                        checked={freebieMode}
                        onChange={(event) => {
                          if (event.target.checked && !baseAssignmentComplete) {
                            setFreebieGateOpen(true)
                            return
                          }
                          setFreebieMode(event.target.checked)
                        }}
                      /> Spend freebies
                    </label>
                    <span className={`vtm-pool-chip wide${freebieStatus(sheet).over ? ' over' : ''}`}>{freebieStatus(sheet).remaining} / 15 freebies</span>
                    {freebieMode ? <span className="vtm-freebie-hint">Costs per dot shown on each section</span> : null}
                  </>
                ) : null}
                {isActive ? (
                  <>
                    <label className="vtm-toggle vtm-toggle-xp"><input type="checkbox" checked={spendXpMode} onChange={(event) => setSpendXpMode(event.target.checked)} /> Spend XP{spendXpMode ? ' — dots unlocked' : ''}</label>
                    <span className="vtm-pool-chip wide">{xpBalance} XP available</span>
                    {xpMode ? <span className="vtm-freebie-hint">Cost rule per dot shown on each section</span> : null}
                  </>
                ) : null}
                {isDraft && canEdit ? <button type="button" className="vtm-finalize" onClick={finalizeCharacter}>Finalize</button> : null}
              </div>
              {feedback ? <p className="settings-help vtm-feedback">{feedback}</p> : null}
            </section>

            <section className="character-placeholder-block vtm-block vtm-roller-block">
              <VtmRollBar roller={roller} sheet={sheet} />
            </section>

            <DotSections
              sheet={sheet}
              canEdit={canEdit}
              dotsLocked={isActive && !spendXpMode}
              dotMax={traitDotMax}
              setAttributeDot={setAttributeDot}
              setAbilityDot={setAbilityDot}
              updateSheet={updateSheet}
              isGuidedDraft={isGuidedDraft}
              freebieMode={freebieMode}
              xpMode={xpMode}
              roller={roller}
            />

            <section className="character-placeholder-block vtm-block">
              <h3 className="vtm-rule-title">Advantages</h3>
              <div className="vtm-advantage-cols">
                <RatedRows
                  title="Disciplines"
                  rows={disciplineRows}
                  options={disciplineOptions}
                  dotMax={traitDotMax}
                  disabled={!canEdit || (isActive && !spendXpMode)}
                  status={isGuidedDraft ? disciplinePoolStatus({ disciplines: disciplineRows, freebieDots: sheet.freebieDots }) : null}
                  freebieCost={freebieMode ? FREEBIE_COSTS.discipline : null}
                  xpRule={xpMode ? xpRuleLabel('discipline', { clan: sheet.clan }) : null}
                  help={vtmDisciplineContextSummary(sheet.clan)}
                  optionLabel={(option) => vtmDisciplineClanCostNote(sheet.clan, option)}
                  onPersist={(rows) => updateSheet((current) => ({ ...current, disciplines: rows }))}
                  onDot={(rowId, rating) => setRatedRowDot('disciplines', disciplineRows, rowId, rating)}
                  onChange={(rowId, updates) => updateRatedRows('disciplines', disciplineRows, rowId, updates)}
                  stageRoller={roller}
                />
                <RatedRows
                  title="Backgrounds"
                  rows={backgroundRows}
                  options={VTM_BACKGROUNDS}
                  disabled={!canEdit || (isActive && !spendXpMode)}
                  status={isGuidedDraft ? backgroundPoolStatus({ backgrounds: backgroundRows, freebieDots: sheet.freebieDots }) : null}
                  freebieCost={freebieMode ? FREEBIE_COSTS.background : null}
                  xpRule={xpMode ? 'Raised through play, not XP' : null}
                  onPersist={(rows) => updateSheet((current) => ({ ...current, backgrounds: rows }))}
                  onDot={(rowId, rating) => setRatedRowDot('backgrounds', backgroundRows, rowId, rating)}
                  onChange={(rowId, updates) => updateRatedRows('backgrounds', backgroundRows, rowId, updates)}
                />
              </div>
              <div className="character-ability-grid vtm-virtues">
                {VTM_VIRTUES.map((virtue) => {
                  const virtueRating = sheet.virtues[virtue] ?? 1
                  return (
                    <div key={virtue} className="character-ability-row vtm-trait-row with-pill">
                      <span className="vtm-trait-name">{virtue}</span>
                      {roller.rollMode ? (
                        <button type="button" className="vtm-roll-pill vtm-roll-pill-inline" onClick={() => roller.rollSingle(virtue, virtueRating)}>Roll</button>
                      ) : null}
                      <DotRating value={virtueRating} label={virtue} disabled={!canEdit || (isActive && !spendXpMode)} onChange={(rating) => setVirtueDot(virtue, rating)} min={1} />
                    </div>
                  )
                })}
                {isGuidedDraft ? <span className={`vtm-pool-chip${virtuePoolStatus(sheet).over ? ' over' : ''}`}>{virtuePoolStatus(sheet).remaining}</span> : null}
                {freebieMode ? <span className="vtm-cost-chip">{FREEBIE_COSTS.virtue}/dot</span> : null}
                {xpMode ? <span className="vtm-cost-chip">{xpRuleLabel('virtue')}</span> : null}
              </div>
              <div className="vtm-derived">
                <span><em>Humanity</em> {deriveHumanity(sheet.virtues)}</span>
                <span><em>Willpower</em> {deriveWillpower(sheet.virtues)}</span>
                <span><em>Blood Pool Max</em> {bloodPoolMax ?? '—'}</span>
              </div>
            </section>

            <Trackers
              sheet={sheet}
              canEdit={canEdit}
              bloodPoolMax={bloodPoolMax}
              updateSheet={updateSheet}
              xpMode={xpMode}
              isGuidedDraft={isGuidedDraft}
              freebieCost={isGuidedDraft && freebieMode ? FREEBIE_COSTS.willpower : null}
              humanityFreebieCost={isGuidedDraft && freebieMode ? FREEBIE_COSTS.humanity : null}
              onWillpowerCapChange={setWillpowerCap}
              onHumanityChange={setHumanityDot}
              roller={roller}
            />
            <TextAndCombat sheet={sheet} canEdit={canEdit} updateSheet={updateSheet} />

            <section className="character-placeholder-block vtm-block">
              <h3 className="vtm-rule-title">Experience</h3>
              <div className="vtm-xp-summary">
                <span className="vtm-xp-balance">{xpBalance}</span>
                <span className="vtm-xp-balance-label">XP available</span>
                {role === 'gm' ? (
                  <button type="button" className="vtm-grant-toggle" onClick={() => { setGrantMode(true); setGrantFeedback(null) }}>
                    <Coins size={14} /> Grant XP
                  </button>
                ) : null}
              </div>
              <div className="vtm-ledger">
                {sheet.xpLedger.length === 0 ? <p className="settings-help">No experience recorded yet.</p> : null}
                {sheet.xpLedger.map((entry) => (
                  <div key={entry.id} className={`vtm-ledger-row ${entry.type}`}>
                    <span className="vtm-ledger-amount">{entry.type === 'award' ? '+' : '−'}{entry.amount}</span>
                    <span className="vtm-ledger-note">{entry.note || (entry.type === 'award' ? 'Award' : 'Spend')}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
          </div>
        </div>
      </div>

      {freebieGateOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal vtm-gate-modal">
            <h3>Finish assigning your starting points</h3>
            <p>Spend all of your starting pools before opening freebies. Still open:</p>
            <ul className="vtm-gate-list">
              {incompletePools.map((pool) => (
                <li key={pool.label}>
                  {pool.label} — {pool.status.remaining > 0 ? `${pool.status.remaining} to assign` : `${Math.abs(pool.status.remaining)} over`}
                </li>
              ))}
            </ul>
            <div className="confirm-actions">
              <button type="button" className="confirm-danger" onClick={() => setFreebieGateOpen(false)}>Got it</button>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal vtm-create-modal">
            <h3>Create character</h3>
            <p>Is this a brand new character to build, or an established one you're transcribing?</p>
            <div className="vtm-create-modal-actions">
              <button type="button" className="vtm-finalize" onClick={() => { void addCharacter('new'); setCreateModalOpen(false) }}>
                New — guided
              </button>
              <button type="button" onClick={() => { void addCharacter('established'); setCreateModalOpen(false) }}>
                Established — direct entry
              </button>
            </div>
            <div className="confirm-actions">
              <button type="button" onClick={() => setCreateModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete character"
        message={`Permanently delete ${deleteTarget?.name ?? 'this character'}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteCharacter(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function DotSections({
  sheet,
  canEdit,
  dotsLocked,
  dotMax,
  setAttributeDot,
  setAbilityDot,
  updateSheet,
  isGuidedDraft,
  freebieMode,
  xpMode,
  roller,
}: {
  sheet: VtmCharacterSheet
  canEdit: boolean
  dotsLocked: boolean
  dotMax: number
  setAttributeDot: (category: VtmAttributeCategory, name: string, nextRating: number) => void
  setAbilityDot: (category: VtmAbilityCategory, name: string, nextRating: number) => void
  updateSheet: (updater: (current: VtmCharacterSheet) => VtmCharacterSheet) => void
  isGuidedDraft: boolean
  freebieMode: boolean
  xpMode: boolean
  roller: VtmRoller
}) {
  const setPriority = (key: 'attributePriority' | 'abilityPriority', category: string, next: VtmCreationPriority) => {
    updateSheet((current) => {
      const map: Record<string, VtmCreationPriority> = { ...current[key] }
      const prev = map[category]
      if (prev === next) return current
      const holder = Object.keys(map).find((other) => map[other] === next)
      if (holder) map[holder] = prev
      map[category] = next
      return { ...current, [key]: map }
    })
  }
  return (
    <section className="character-placeholder-block vtm-block">
      <h3 className="vtm-rule-title">Attributes</h3>
      <div className="vtm-trait-columns">
        {Object.entries(VTM_ATTRIBUTES).map(([category, names]) => {
          const typedCategory = category as VtmAttributeCategory
          const status = isGuidedDraft ? attributePoolStatus(sheet, typedCategory) : null
          return (
            <div key={category} className="character-sheet-section vtm-trait-col">
              <div className="character-create-row vtm-trait-col-head">
                <h4>{titleCase(category)}</h4>
                {isGuidedDraft ? (
                  <PrioritySegmented value={sheet.attributePriority[typedCategory]} budgets={ATTRIBUTE_POOL_BY_PRIORITY} disabled={!canEdit} onPick={(next) => setPriority('attributePriority', typedCategory, next)} />
                ) : null}
                {status ? <span className={`vtm-pool-chip${status.over ? ' over' : ''}`}>{status.remaining}</span> : null}
                {freebieMode ? <span className="vtm-cost-chip">{FREEBIE_COSTS.attribute}/dot</span> : null}
                {xpMode ? <span className="vtm-cost-chip">{xpRuleLabel('attribute')}</span> : null}
              </div>
              <div className="character-ability-grid">
                {names.map((name) => {
                  const rating = sheet.attributes[typedCategory][name] ?? 1
                  return (
                    <div
                      key={name}
                      className={['character-ability-row', 'vtm-trait-row', roller.rollMode ? 'stageable' : '', roller.isStaged('attr', name) ? 'staged' : ''].filter(Boolean).join(' ')}
                      role={roller.rollMode ? 'button' : undefined}
                      onClick={roller.rollMode ? () => roller.stageAttr(name, rating) : undefined}
                    >
                      <span className="vtm-trait-name">{name}</span>
                      {roller.rollMode ? <span className="vtm-stage-flag">Staged</span> : null}
                      <DotRating value={rating} min={1} max={dotMax} label={name} disabled={!canEdit || dotsLocked} onChange={(next) => setAttributeDot(typedCategory, name, next)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <h3 className="vtm-rule-title">Abilities</h3>
      <div className="vtm-trait-columns">
        {Object.entries(VTM_ABILITIES).map(([category, names]) => {
          const typedCategory = category as VtmAbilityCategory
          const status = isGuidedDraft ? abilityPoolStatus(sheet, typedCategory) : null
          return (
            <div key={category} className="character-sheet-section vtm-trait-col">
              <div className="character-create-row vtm-trait-col-head">
                <h4>{titleCase(category)}</h4>
                {isGuidedDraft ? (
                  <PrioritySegmented value={sheet.abilityPriority[typedCategory]} budgets={ABILITY_POOL_BY_PRIORITY} disabled={!canEdit} onPick={(next) => setPriority('abilityPriority', typedCategory, next)} />
                ) : null}
                {status ? <span className={`vtm-pool-chip${status.over ? ' over' : ''}`}>{status.remaining}</span> : null}
                {freebieMode ? <span className="vtm-cost-chip">{FREEBIE_COSTS.ability}/dot</span> : null}
                {xpMode ? <span className="vtm-cost-chip">{xpRuleLabel('ability')}</span> : null}
              </div>
              <div className="character-ability-grid">
                {names.map((name) => {
                  const rating = sheet.abilities[typedCategory][name] ?? 0
                  return (
                    <div
                      key={name}
                      className={['character-ability-row', 'vtm-trait-row', roller.rollMode ? 'stageable' : '', roller.isStaged('second', name) ? 'staged' : ''].filter(Boolean).join(' ')}
                      role={roller.rollMode ? 'button' : undefined}
                      onClick={roller.rollMode ? () => roller.stageSecond('Ability', name, rating) : undefined}
                    >
                      <span className="vtm-trait-name">{name}</span>
                      {roller.rollMode ? <span className="vtm-stage-flag">Staged</span> : null}
                      <DotRating value={rating} max={dotMax} label={name} disabled={!canEdit || dotsLocked} onChange={(next) => setAbilityDot(typedCategory, name, next)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RatedRows({
  title,
  rows,
  options,
  dotMax = 5,
  disabled,
  status,
  freebieCost = null,
  xpRule = null,
  help = null,
  optionLabel = (option) => option,
  onPersist,
  onDot,
  onChange,
  stageRoller,
}: {
  title: string
  rows: VtmRatedRow[]
  options: readonly string[]
  dotMax?: number
  disabled: boolean
  status: { remaining: number } | null
  freebieCost?: number | null
  xpRule?: string | null
  help?: string | null
  optionLabel?: (option: string) => string
  onPersist: (rows: VtmRatedRow[]) => void
  onDot: (rowId: string, rating: number) => void
  onChange: (rowId: string, updates: Partial<VtmRatedRow>) => void
  // When supplied (Disciplines only), whole-row click stages the row into the
  // roller's second slot while Roll mode is on. CSS neutralises the inner edit
  // controls during staging so the click reaches the row.
  stageRoller?: VtmRoller
}) {
  const hasOptions = options.length > 0
  return (
    <div className="character-sheet-section vtm-rated">
      <div className="vtm-rated-head">
        <h4>{title}</h4>
        {status ? <span className={`vtm-pool-chip${status.remaining < 0 ? ' over' : ''}`}>{status.remaining}</span> : null}
        {freebieCost != null ? <span className="vtm-cost-chip">{freebieCost}/dot</span> : null}
        {xpRule != null ? <span className="vtm-cost-chip">{xpRule}</span> : null}
        <button type="button" className="vtm-rated-add" disabled={disabled} onClick={() => onPersist([...rows, { id: makeId(), name: '', rating: 0 }])}><Plus size={14} /> Add</button>
      </div>
      {help ? <p className="settings-help vtm-rated-help">{help}</p> : null}
      {rows.map((row) => {
        const isKnown = hasOptions && options.includes(row.name)
        const stageable = !!stageRoller?.rollMode && row.name.trim() !== ''
        const staged = stageable && !!stageRoller?.isStaged('second', row.name)
        return (
          <div
            key={row.id}
            className={['vtm-rated-row', stageable ? 'stageable' : '', staged ? 'staged' : ''].filter(Boolean).join(' ')}
            role={stageable ? 'button' : undefined}
            onClick={stageable ? () => stageRoller?.stageSecond('Discipline', row.name, row.rating) : undefined}
          >
            {stageRoller?.rollMode ? <span className="vtm-stage-flag">Staged</span> : null}
            {hasOptions ? (
              <select value={isKnown ? row.name : ''} disabled={disabled} onChange={(event) => onChange(row.id, { name: event.target.value })}>
                <option value="">Custom…</option>
                {options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
              </select>
            ) : null}
            {!isKnown ? (
              <input value={row.name} disabled={disabled} placeholder="Name" onChange={(event) => onChange(row.id, { name: event.target.value })} />
            ) : null}
            <DotRating value={row.rating} max={dotMax} label={row.name || title} disabled={disabled} onChange={(rating) => onDot(row.id, rating)} />
            <button type="button" className="vtm-rated-delete" disabled={disabled} onClick={() => onPersist(rows.filter((entry) => entry.id !== row.id))} aria-label="Remove row"><Trash2 size={13} /></button>
          </div>
        )
      })}
    </div>
  )
}

function Trackers({
  sheet,
  canEdit,
  bloodPoolMax,
  updateSheet,
  xpMode,
  isGuidedDraft,
  freebieCost,
  humanityFreebieCost,
  onWillpowerCapChange,
  onHumanityChange,
  roller,
}: {
  sheet: VtmCharacterSheet
  canEdit: boolean
  bloodPoolMax: number | null
  updateSheet: (updater: (current: VtmCharacterSheet) => VtmCharacterSheet) => void
  xpMode: boolean
  isGuidedDraft: boolean
  freebieCost: number | null
  humanityFreebieCost: number | null
  onWillpowerCapChange: (nextRating: number) => void
  onHumanityChange: (nextRating: number) => void
  roller: VtmRoller
}) {
  const hasRolledStartingBlood = sheet.bloodPoolCurrent > 0
  const bloodRollLocked = isGuidedDraft && hasRolledStartingBlood
  const bloodPoolMaxValue = bloodPoolMax ?? 10

  return (
    <section className="character-placeholder-block vtm-block">
      <h3 className="vtm-rule-title">Trackers</h3>
      <div className="character-summary-grid vtm-trackers">
        <div className="vtm-health">
          <h4>Health</h4>
          {healthLevels.map(([level, penalty]) => (
            <label key={level} className="character-create-row vtm-health-row">
              <input type="checkbox" checked={sheet.health[level] === true} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, health: { ...current.health, [level]: event.target.checked } }))} />
              <span className="vtm-health-level">{level}</span>
              <span className="vtm-health-penalty">{penalty}</span>
            </label>
          ))}
        </div>
        <div>
          <div className="vtm-tracker-head">
            <h4>Willpower</h4>
            {roller.rollMode ? (
              <button type="button" className="vtm-roll-pill vtm-roll-pill-inline" onClick={() => roller.rollSingle('Willpower', sheet.willpowerPermanent)}>Roll</button>
            ) : null}
          </div>
          <div className="vtm-tracker-row stacked">
            <span>Current / Permanent {freebieCost != null ? <em>{freebieCost}/dot</em> : null}{xpMode ? <em>{xpRuleLabel('willpower')}</em> : null}</span>
            <CappedTracker
              value={sheet.willpowerTemporary}
              cap={sheet.willpowerPermanent}
              max={10}
              label="Willpower"
              disabled={!canEdit}
              onCurrentChange={(rating) => updateSheet((current) => ({ ...current, willpowerTemporary: rating }))}
              onCapChange={onWillpowerCapChange}
            />
          </div>
        </div>
        <div>
          <div className="vtm-tracker-head">
            <h4>Blood Pool</h4>
            <button
              type="button"
              className="vtm-roll-pill"
              disabled={!canEdit || bloodRollLocked}
              onClick={() => {
                if (isGuidedDraft && hasRolledStartingBlood) return
                const max = bloodPoolMaxValue
                const roll = Math.floor(Math.random() * 10) + 1
                updateSheet((current) => ({ ...current, bloodPoolCurrent: Math.min(roll, max) }))
              }}
            >
              {bloodRollLocked ? 'Rolled' : 'Roll'}
            </button>
          </div>
          <DotRating value={sheet.bloodPoolCurrent} max={bloodPoolMaxValue} label="Blood Pool" disabled={!canEdit || isGuidedDraft} onChange={(rating) => updateSheet((current) => ({ ...current, bloodPoolCurrent: rating }))} />
          <p className="settings-help">Max {bloodPoolMax ?? 'unknown'}</p>
        </div>
        <div>
          <div className="vtm-tracker-head">
            <h4>Humanity {humanityFreebieCost != null ? <em>{humanityFreebieCost}/dot</em> : null}{xpMode ? <em>{xpRuleLabel('humanity')}</em> : null}</h4>
            {roller.rollMode ? (
              <button type="button" className="vtm-roll-pill vtm-roll-pill-inline" onClick={() => roller.rollSingle('Humanity', sheet.humanity)}>Roll</button>
            ) : null}
          </div>
          <DotRating
            value={sheet.humanity}
            max={10}
            label="Humanity"
            disabled={!canEdit}
            onChange={onHumanityChange}
          />
        </div>
      </div>
    </section>
  )
}

function TextAndCombat({
  sheet,
  canEdit,
  updateSheet,
}: {
  sheet: VtmCharacterSheet
  canEdit: boolean
  updateSheet: (updater: (current: VtmCharacterSheet) => VtmCharacterSheet) => void
}) {
  return (
    <section className="character-placeholder-block">
      <h3>Notes and Tables</h3>
      <RatedRows
        title="Other Traits"
        rows={sheet.otherTraits}
        options={[]}
        disabled={!canEdit}
        status={null}
        onPersist={(rows) => updateSheet((current) => ({ ...current, otherTraits: rows }))}
        onDot={(rowId, rating) => updateSheet((current) => ({ ...current, otherTraits: current.otherTraits.map((row) => row.id === rowId ? { ...row, rating } : row) }))}
        onChange={(rowId, updates) => updateSheet((current) => ({ ...current, otherTraits: current.otherTraits.map((row) => row.id === rowId ? { ...row, ...updates } : row) }))}
      />
      <label>Derangements<textarea value={sheet.derangements} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, derangements: event.target.value }))} /></label>
      <div className="character-summary-grid">
        {Object.keys(sheet.expandedBackground).map((key) => (
          <label key={key}>{key}<textarea value={sheet.expandedBackground[key]} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, expandedBackground: { ...current.expandedBackground, [key]: event.target.value } }))} /></label>
        ))}
        {Object.keys(sheet.possessions).map((key) => (
          <label key={key}>{key}<textarea value={sheet.possessions[key]} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, possessions: { ...current.possessions, [key]: event.target.value } }))} /></label>
        ))}
        {Object.keys(sheet.appearance).map((key) => (
          <label key={key}>{key}<input value={sheet.appearance[key]} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, appearance: { ...current.appearance, [key]: event.target.value } }))} /></label>
        ))}
      </div>
      <RepeatableText title="Rituals" rows={sheet.rituals.map((row) => ({ id: row.id, a: row.name, b: row.level, c: row.notes }))} labels={['Name', 'Level', 'Notes']} disabled={!canEdit} onRows={(rows) => updateSheet((current) => ({ ...current, rituals: rows.map((row) => ({ id: row.id, name: row.a, level: row.b, notes: row.c })) }))} />
      <RepeatableText title="Blood Bonds / Vinculi" rows={sheet.bloodBonds.map((row) => ({ id: row.id, a: row.boundTo, b: String(row.rating), c: row.notes }))} labels={['Bound to', 'Rating', 'Notes']} disabled={!canEdit} onRows={(rows) => updateSheet((current) => ({ ...current, bloodBonds: rows.map((row) => ({ id: row.id, boundTo: row.a, rating: Number.parseInt(row.b, 10) || 0, notes: row.c })) }))} />
      <RepeatableText title="Havens" rows={sheet.havens.map((row) => ({ id: row.id, a: row.location, b: row.description, c: '' }))} labels={['Location', 'Description', '']} disabled={!canEdit} onRows={(rows) => updateSheet((current) => ({ ...current, havens: rows.map((row) => ({ id: row.id, location: row.a, description: row.b })) }))} />
      <label>History / Prelude<textarea value={sheet.history} disabled={!canEdit} onChange={(event) => updateSheet((current) => ({ ...current, history: event.target.value }))} /></label>
      <RepeatableText title="Combat Weapons" rows={sheet.combatWeapons.map((row) => ({ id: row.id, a: row.weapon, b: row.damage, c: [row.range, row.rate, row.clip, row.conceal].join(' / ') }))} labels={['Weapon', 'Damage', 'Range / Rate / Clip / Conceal']} disabled={!canEdit} onRows={(rows) => updateSheet((current) => ({ ...current, combatWeapons: rows.map((row) => ({ id: row.id, weapon: row.a, damage: row.b, range: row.c, rate: '', clip: '', conceal: '' })) }))} />
      <RepeatableText title="Armor" rows={sheet.armor.map((row) => ({ id: row.id, a: row.armor, b: row.rating, c: `${row.penalty} ${row.notes}`.trim() }))} labels={['Armor', 'Rating', 'Penalty / Notes']} disabled={!canEdit} onRows={(rows) => updateSheet((current) => ({ ...current, armor: rows.map((row) => ({ id: row.id, armor: row.a, rating: row.b, penalty: row.c, notes: '' })) }))} />
    </section>
  )
}

type RepeatableRow = { id: string; a: string; b: string; c: string }

function RepeatableText({
  title,
  rows,
  labels,
  disabled,
  onRows,
}: {
  title: string
  rows: RepeatableRow[]
  labels: [string, string, string]
  disabled: boolean
  onRows: (rows: RepeatableRow[]) => void
}) {
  return (
    <div className="character-sheet-section">
      <div className="character-create-row">
        <h4>{title}</h4>
        <button type="button" disabled={disabled} onClick={() => onRows([...rows, { id: makeId(), a: '', b: '', c: '' }])}><Plus size={14} /> Add</button>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="character-ability-row">
          <input placeholder={labels[0]} value={row.a} disabled={disabled} onChange={(event) => onRows(rows.map((entry) => entry.id === row.id ? { ...entry, a: event.target.value } : entry))} />
          {labels[1] ? <input placeholder={labels[1]} value={row.b} disabled={disabled} onChange={(event) => onRows(rows.map((entry) => entry.id === row.id ? { ...entry, b: event.target.value } : entry))} /> : null}
          {labels[2] ? <input placeholder={labels[2]} value={row.c} disabled={disabled} onChange={(event) => onRows(rows.map((entry) => entry.id === row.id ? { ...entry, c: event.target.value } : entry))} /> : null}
          <button type="button" disabled={disabled} onClick={() => onRows(rows.filter((entry) => entry.id !== row.id))}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  )
}

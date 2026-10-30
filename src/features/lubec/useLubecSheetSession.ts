import { useMemo } from 'react'
import { db } from '../../firebase'
import type { Role } from '../../types/app'
import { canEditCharacterStoreCharacter } from '../character/characterStore/characterStoreActions'
import { useCharacterStore } from '../character/characterStore/useCharacterStore'
import { useCharacterMedia } from '../character/hooks/useCharacterMedia'
import { lubecCharacterStore } from '../ruleSets/lubec/characterParser'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { CharacterStoreCollection } from '../character/characterStore/characterStoreWrites'
import type { LubecSheetEditing } from './LubecNameBandEditor'
import type { LubecGearRecords } from './gear/lubecGearDrop'
import { useLubecGive } from './gear/useLubecGive'
import { lubecNpcSheetRecord, type LubecNpcIdentity } from './lubecNpcSheetRecord'
import { lubecSheetWiring, type LubecViewer } from './lubecSheetWiring'
import { lubecLibraryStock } from './items/gmItemsList'
import { useLubecGmItems } from './items/useLubecGmItems'
import type { CampaignScope } from '../campaign/firestorePaths'
import type { LubecGmItem } from '../ruleSets/lubec/gear/gmItem'
import type { LubecSheetViewProps } from './LubecSheetView'

/** Where the sheets come from: the campaign's characters, all of them, or one NPC's sheet. */
export type LubecSheetSource =
  | { kind: 'characters' }
  | { kind: 'npc'; npc: LubecNpcIdentity }

type StoreScope = { collection: CharacterStoreCollection; onlyId?: string }

// The collection a source's sheets are stored in, narrowed to the one document of an NPC's sheet.
const storeScopeOf = (source: LubecSheetSource): StoreScope =>
  (source.kind === 'npc' ? { collection: 'npcSheets', onlyId: source.npc.id } : { collection: 'characters' })

// Where the open sheet's records are, for a move that leaves its own: an NPC's sheet is the NPC's record.
const gearRecordsOf = (source: LubecSheetSource, character: LubecCharacterRecord | null, scope: { campaignId: string; groupId: string }): LubecGearRecords | null => {
  if (!character) return null
  return { db, scope, sheet: source.kind === 'npc' ? { kind: 'npc', npcId: source.npc.id } : { kind: 'character', characterId: character.id } }
}

// The open sheet as shown: a character as stored, an NPC's sheet under the NPC's own name, portrait and token.
function useOpenRecord(npc: LubecNpcIdentity | null, stored: LubecCharacterRecord | null) {
  return useMemo(() => (npc && stored ? lubecNpcSheetRecord(npc, stored) : stored), [npc, stored])
}

const NO_ITEMS: readonly LubecGmItem[] = []

// The campaign items, for the stock picker's "This campaign" (spec 8.4); every member may read them.
function useLubecCampaignStock(scope: CampaignScope, setError: (message: string) => void) {
  const library = useLubecGmItems(scope, 'library', setError) ?? NO_ITEMS
  return useMemo(() => lubecLibraryStock(library), [library])
}

/** The shared character store over Lubec characters: the roster, the selected id, add, update and delete. */
export type LubecStore = ReturnType<typeof useCharacterStore<LubecCharacterRecord>>

/** Everything `LubecSheetView` takes except delete and assign, which only the player tab offers. */
export type LubecSheetProps = Omit<LubecSheetViewProps, 'onDelete' | 'onAssign'>

export type LubecSheetSession = {
  store: LubecStore
  /** The open character, or null while none is open. */
  character: LubecCharacterRecord | null
  viewer: LubecViewer
  /** The open sheet's props, or null while none is open. */
  sheetProps: LubecSheetProps | null
}

export type LubecSheetSessionOptions = {
  source: LubecSheetSource
  campaignId: string
  groupId: string
  role: Role | null
  currentUserId: string
  gmUserId: string | null
  setError: (message: string) => void
}

type EditingOptions = Pick<LubecSheetSessionOptions, 'campaignId' | 'groupId' | 'role' | 'currentUserId'> & {
  character: LubecCharacterRecord | null
  updateCharacter: (characterId: string, updates: Partial<LubecCharacterRecord>) => void
}

// The open sheet's edits for its owner and the GM, saved through the shared
// store, with art uploaded under the uploader's authority; null for anyone else.
function useLubecSheetEditing({ character, updateCharacter, role, currentUserId, ...campaign }: EditingOptions): LubecSheetEditing | null {
  const canEdit = character !== null && canEditCharacterStoreCharacter(character, role, currentUserId)
  const media = useCharacterMedia({ ...campaign, currentUserId, effectiveSelected: character, canEditSelected: canEdit })
  if (!character || !canEdit) return null
  return {
    update: (updates) => updateCharacter(character.id, updates),
    uploadPortrait: media.uploadCharacterPortraitImage,
    uploadToken: media.uploadCharacterTokenImage,
  }
}

/**
 * One Lubec sheet's load, save and edit wiring: the shared character store
 * over the source's sheets, the open one, and the props its sheet takes for
 * this viewer. Every tab that shows a Lubec sheet starts from here.
 */
export function useLubecSheetSession({ source, campaignId, groupId, role, currentUserId, gmUserId, setError }: LubecSheetSessionOptions): LubecSheetSession {
  const store = useCharacterStore({
    ruleSet: lubecCharacterStore, ...storeScopeOf(source), campaignId, groupId, userId: currentUserId, role, gmUserId, setError, enabled: true,
  })
  const character = useOpenRecord(source.kind === 'npc' ? source.npc : null, store.selectedCharacter)
  const editing = useLubecSheetEditing({ character, updateCharacter: store.updateCharacter, campaignId, groupId, role, currentUserId })
  const viewer = { role, userId: currentUserId }
  const records = gearRecordsOf(source, character, { campaignId, groupId })
  const campaignStock = useLubecCampaignStock({ campaignId, groupId }, setError)
  const gearGive = useLubecGive({ onCharacters: source.kind === 'characters', character, characters: store.characters, store, campaignId, groupId, role, userId: currentUserId })
  const sheetProps = character ? { character, editing, campaignStock, gearGive, ...lubecSheetWiring(character, viewer, store, records) } : null
  return { store, character, viewer, sheetProps }
}

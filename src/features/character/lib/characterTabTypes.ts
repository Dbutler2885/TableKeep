import type { CharacterRecord, Role } from '../../../types/app'

export type CharacterTabProps = {
  campaignId: string
  groupId: string
  gmUserId: string | null
  currentUserId: string
  currentUsername: string
  role: Role | null
  characters: CharacterRecord[]
  charactersLoading: boolean
  currentCharacterId: string | null
  setCurrentCharacter: (characterId: string) => Promise<void>
  selectedCharacterId: string
  setSelectedCharacterId: (id: string) => void
  selectedCharacter: CharacterRecord | null
  updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) => void
  syncCharacterLocal: (characterId: string, updates: Partial<CharacterRecord>) => void
  deleteCharacter: (characterId: string) => void
  hasPendingWrite: (id: string) => boolean
  embeddedMode?: boolean
}

export type AdventureEditableCode = 'FG' | 'FT' | 'HT' | 'LD' | 'SD'
export type ThiefSkillCode = 'CS' | 'TR' | 'HN' | 'HS' | 'MS' | 'OL' | 'PP' | 'RL'
export type GrantTemplateEntry = {
  key: string
  name: string
  costGp: number
  qty: number
  kind: 'general' | 'weapon' | 'ammunition' | 'armour' | 'consumable'
  weaponId?: string
  armourId?: string
  packedLabel?: string
}
export type TransferTargetCharacter = Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId' | 'ownerUsername' | 'details'>
export type CampaignPlayerOption = {
  userId: string
  username: string | null
}
export type ClassFeature = {
  id: string
  name: string
  unlockedAt: number
  summary: string
  summaryLinks?: Array<{ word: string; url: string }>
}

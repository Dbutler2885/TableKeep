export type Role = 'gm' | 'player'

export type AppTab = 'character' | 'maps' | 'monsters' | 'items' | 'npcs' | 'notes' | 'rules'

export type Campaign = {
  id: string
  name: string
  status: string
}

export type TokenIconConfig = {
  icon: 'pawn' | 'custom'
  color: string
  size: number
  customImageUrl?: string
  customImageName?: string
}

export type CharacterAbilityScores = {
  STR: string
  INT: string
  WIS: string
  DEX: string
  CON: string
  CHA: string
}

export type CharacterSaveScores = {
  D: string
  W: string
  P: string
  B: string
  S: string
}

export type CharacterAdventureScores = {
  FG: string
  FT: string
  HT: string
  LD: string
  SD: string
}

export type CharacterThiefSkills = {
  CS: string
  TR: string
  HN: string
  HS: string
  MS: string
  OL: string
  PP: string
  RL: string
}

export type CharacterWeaponRow = {
  id: string
  name: string
  damage: string
  bonus: string
  range: string
  notes: string
}

export type CharacterRecord = {
  id: string
  name: string
  title?: string
  ownerUserId: string
  className: string
  alignment?: string
  level: number
  hpCurrent: number
  hpMax: number
  hpBaseRoll?: number
  ac: number
  acManualOverride?: boolean
  xp: number
  xpNext?: string
  xpPrimeModifier?: string
  thaco?: string
  abilityScores?: CharacterAbilityScores
  rolledAbilityScores?: CharacterAbilityScores
  abilityScoresRolled?: boolean
  saveScores?: CharacterSaveScores
  adventureScores?: CharacterAdventureScores
  adventureSeedClass?: string
  thiefSkills?: CharacterThiefSkills
  aswNotes?: string
  languages?: string
  unencumberingItems?: string
  equippedItems?: string[]
  packedItems?: string[]
  otherNotes?: string
  weapons?: CharacterWeaponRow[]
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
}

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

export type CharacterRecord = {
  id: string
  name: string
  ownerUserId: string
  className: string
  level: number
  hpCurrent: number
  hpMax: number
  ac: number
  xp: number
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
}

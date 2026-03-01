export type Role = 'gm' | 'player'

export type AppTab = 'character' | 'maps' | 'monsters' | 'items' | 'npcs' | 'notes' | 'rules'

export type Campaign = {
  id: string
  name: string
  status: string
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
}

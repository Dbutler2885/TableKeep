import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'

export const lubecCharacterName = (character: LubecCharacterRecord) => character.name || 'Unnamed kid'

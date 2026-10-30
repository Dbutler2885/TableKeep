import type { CharacterRecord } from '../../types/app'
import { oseCarrying } from '../ruleSets/ose/carrying'

/** The receiver's packed slots in use and available, read from the local roster; an absent receiver reads as empty. */
export function receiverPackedSlots(characters: CharacterRecord[], toCharacterId: string) {
  const details = characters.find((character) => character.id === toCharacterId)?.details ?? null
  const inventory = Array.isArray(details?.inventory) ? details.inventory : []
  return {
    used: inventory.filter((item) => !item.equipped).length,
    available: oseCarrying.packedSlots(details),
  }
}

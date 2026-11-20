import { db } from '../../../../firebase'
import type { CampaignScope } from '../../../campaign/firestorePaths'
import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'
import { lubecEffectRecovery } from '../../effectRecovery'
import type { LubecStore } from '../../useLubecSheetSession'
import type { CombatSheetWriter, CombatSheetWriters } from './fighterEffectsModel'

type StoreWrites = Pick<LubecStore, 'updateCharacter' | 'updateCharacterNow' | 'hasPendingWrite' | 'settleSaves'>

/**
 * A store's writes as the combat tab uses them, with the waking and reached-step Saves resolved against the
 * sheet's canonical record exactly as the sheet resolves them. The only part of the tab that needs the Firestore handle.
 */
export function combatSheetWriter(store: StoreWrites, collection: keyof CombatSheetWriters, scope: CampaignScope): CombatSheetWriter {
  const recovery = (record: LubecCharacterRecord) => {
    const sheet = collection === 'npcSheets' ? { kind: 'npc' as const, npcId: record.id } : { kind: 'character' as const, characterId: record.id }
    return lubecEffectRecovery({ db, scope, sheet }, { settleSaves: store.settleSaves }, record.id)
  }
  return { updateCharacter: store.updateCharacter, updateCharacterNow: store.updateCharacterNow, hasPendingWrite: store.hasPendingWrite, recovery }
}

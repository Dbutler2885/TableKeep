import { useMemo, useState } from 'react'
import { db } from '../../../firebase'
import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecGearDrop } from '../gear/lubecGearDrop'
import { lubecSheetWiring, type LubecSheetWiringStore, type LubecViewer } from '../lubecSheetWiring'
import type { LubecStore } from '../useLubecSheetSession'
import { lubecCharacterCombatants } from './lubecFightCombatants'
import { LubecFightModal } from './LubecFightModal'
import { lubecCombatantKey, lubecCombatantRecord, lubecLiveRequest, lubecSummaryNpcId, lubecWithSummary, type LubecCombatant, type LubecFightHost, type LubecFightRequest } from './lubecFightRequest'
import { useLubecNpcCombatants } from './useLubecNpcCombatants'
import { useLubecNpcFightSummary } from './useLubecNpcFightSummary'

type DropStores = { characters: LubecSheetWiringStore; npcs: LubecSheetWiringStore }

// The attacker's drop, on their own record: the same drop the sheet's own buttons use, so it asks the same of the viewer.
function combatantDrop(c: LubecCombatant, viewer: LubecViewer, scope: CampaignScope, stores: DropStores): LubecGearDrop {
  const sheet = c.kind === 'character' ? { kind: 'character' as const, characterId: c.character.id } : { kind: 'npc' as const, npcId: c.npc.id }
  const store = c.kind === 'character' ? stores.characters : stores.npcs
  return lubecSheetWiring(lubecCombatantRecord(c), viewer, store, { db, scope, sheet }).onGearDrop
}

type RoomOptions = {
  scope: CampaignScope
  viewer: LubecViewer
  gmUserId: string | null
  store: LubecStore
  setError: (message: string) => void
}

/**
 * What both fight hosts share (spec 10.2): everyone who can fight, the one
 * open request, and the modal over it. The hosts differ only in where their
 * store comes from and how they build a request.
 */
export function useLubecFightRoom({ scope, viewer, gmUserId, store, setError }: RoomOptions) {
  const [request, setRequest] = useState<LubecFightRequest | null>(null)
  const npcs = useLubecNpcCombatants({ ...scope, role: viewer.role, userId: viewer.userId, gmUserId, setError, open: request !== null })
  const combatants = useMemo(() => [...lubecCharacterCombatants(store.characters), ...npcs.combatants], [store.characters, npcs.combatants])
  const summary = useLubecNpcFightSummary(scope, lubecSummaryNpcId(request, viewer.role === 'gm'))
  const host: LubecFightHost = { open: setRequest, close: () => setRequest(null) }
  const live = request && lubecLiveRequest(lubecWithSummary(request, summary), combatants)
  const modal = live ? (
    <LubecFightModal
      key={lubecCombatantKey(live.attacker)}
      request={live}
      targets={combatants}
      onDrop={combatantDrop(live.attacker, viewer, scope, { characters: store, npcs: npcs.store })}
      onClose={host.close}
    />
  ) : null
  return { combatants, host, modal }
}

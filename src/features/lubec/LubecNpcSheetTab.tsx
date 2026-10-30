import type { Role } from '../../types/app'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { LUBEC_NPC_CARRIER_KINDS } from '../ruleSets/lubec/gear/carriers'
import { makeLubecDirectEntryCharacter, makeLubecGuidedCharacter, type LubecOwner } from '../ruleSets/lubec/directEntry'
import { makeLubecImportedCharacter, type LubecImportedCharacter } from '../ruleSets/lubec/importFile'
import { useKeepLubecNpcFightSummary } from './fight/useLubecNpcFightSummary'
import { LubecNewCharacter, type LubecDoors } from './LubecNewCharacter'
import type { LubecNpcIdentity } from './lubecNpcSheetRecord'
import { LubecSheetView } from './LubecSheetView'
import { useLubecSheetSession } from './useLubecSheetSession'

export type LubecNpcSheetTabProps = {
  npc: LubecNpcIdentity
  campaignId: string
  groupId: string
  role: Role | null
  currentUserId: string
  currentUsername: string
  gmUserId: string | null
  setError: (message: string) => void
}

/** Why an imported file's portrait is left out of an NPC's sheet, for the Finalize dialog. */
export const LUBEC_NPC_PORTRAIT_NOTE = "The file's portrait was not used: an NPC's portrait is set on its Story tab."

// An imported sheet for the NPC; the NPC keeps its own portrait, so the file's is noted and left out.
function importedNpcSheet(npcId: string, owner: LubecOwner, imported: LubecImportedCharacter): LubecCharacterRecord {
  const importNotes = imported.portrait ? [...imported.importNotes, LUBEC_NPC_PORTRAIT_NOTE] : imported.importNotes
  return makeLubecImportedCharacter(npcId, owner, { ...imported, importNotes })
}

// The ways the GM starts an NPC's sheet: each makes a draft under the NPC's own id, owned by the GM.
function lubecNpcDoorsFor(npcId: string, owner: LubecOwner, addCharacter: (character: LubecCharacterRecord) => Promise<void>): LubecDoors {
  const create = (make: (id: string, owner: LubecOwner) => LubecCharacterRecord) => () => void addCharacter(make(npcId, owner))
  return {
    onDirectEntry: create(makeLubecDirectEntryCharacter),
    onGuided: create(makeLubecGuidedCharacter),
    onImport: (imported) => void addCharacter(importedNpcSheet(npcId, owner, imported)),
  }
}

function LubecNpcSheetStart({ npcName, doors }: { npcName: string; doors: LubecDoors }) {
  return (
    <section className="lubec-npc-sheet-start" aria-label="No character sheet yet">
      <p><strong>{npcName || 'This NPC'}</strong> has no character sheet yet.</p>
      <LubecNewCharacter {...doors} label="Make a character sheet" />
    </section>
  )
}

/**
 * One NPC's Lubec character sheet, for the GM: the same sheet a player's
 * character has, stored in `npcSheets`, under the NPC's own name, portrait and
 * token, which are edited on its Story tab. An NPC with no sheet offers the
 * ways a new character comes in.
 */
export function LubecNpcSheetTab({ npc, currentUsername, ...options }: LubecNpcSheetTabProps) {
  const { store, character, sheetProps } = useLubecSheetSession({ source: { kind: 'npc', npc }, ...options })
  const scope = { campaignId: options.campaignId, groupId: options.groupId }
  useKeepLubecNpcFightSummary({ scope, npcId: npc.id, sheet: character?.lubec ?? null, loading: store.charactersLoading, setError: options.setError })
  if (sheetProps) {
    return <LubecSheetView key={sheetProps.character.id} {...sheetProps} identityEditable={false} carrierKinds={LUBEC_NPC_CARRIER_KINDS} onDelete={null} onAssign={null} />
  }
  if (store.charactersLoading) return <p className="lubec-sheet-none">Opening the sheet…</p>
  const owner = { userId: options.currentUserId, username: currentUsername }
  return <LubecNpcSheetStart npcName={npc.name} doors={lubecNpcDoorsFor(npc.id, owner, store.addCharacter)} />
}

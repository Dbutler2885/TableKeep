import type { NpcRecord } from '../../types/app'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'

/** What an NPC's sheet takes from the NPC itself: its id, name, portrait and token. */
export type LubecNpcIdentity = Pick<NpcRecord, 'id' | 'name' | 'portraitPath' | 'portraitUrl' | 'portraitFocusX' | 'portraitFocusY' | 'tokenIcon'>

/**
 * An NPC's stored sheet as the sheet shows it: the name, portrait and token
 * are the NPC's own, edited on its Story tab, laid over whatever the sheet
 * document holds.
 */
export function lubecNpcSheetRecord(npc: LubecNpcIdentity, stored: LubecCharacterRecord): LubecCharacterRecord {
  return {
    ...stored,
    name: npc.name,
    portraitPath: npc.portraitPath ?? '',
    portraitUrl: npc.portraitUrl,
    portraitFocusX: npc.portraitFocusX,
    portraitFocusY: npc.portraitFocusY,
    tokenIcon: npc.tokenIcon,
  }
}

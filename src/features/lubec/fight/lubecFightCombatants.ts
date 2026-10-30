// The combatants a host works with: the people in its stores, the player's own
// current character, and who a selected map token stands for (spec 10.2, 10.3).

import type { NpcRecord } from '../../../types/app'
import { canEditCharacterStoreCharacter } from '../../character/characterStore/characterStoreActions'
import type { TokenRecord } from '../../maps/lib/types'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import type { LubecViewer } from '../lubecSheetWiring'
import type { LubecNpcIdentity } from '../lubecNpcSheetRecord'
import { lubecCombatantKey, type LubecCombatant, type LubecFightRequest } from './lubecFightRequest'

const inPlay = (c: LubecCharacterRecord) => c.creationStatus === 'active'

/** The roster's characters in play. */
export const lubecCharacterCombatants = (characters: readonly LubecCharacterRecord[]): LubecCombatant[] =>
  characters.filter(inPlay).map((character) => ({ kind: 'character', character }))

/** The campaign's NPCs, each with its sheet where it has one. */
export const lubecNpcCombatants = (npcs: readonly NpcRecord[], sheets: readonly LubecCharacterRecord[]): LubecCombatant[] =>
  npcs.map((npc) => ({ kind: 'npc', npc, sheet: sheets.find((s) => s.id === npc.id) ?? null }))

/** The viewer's own current character in play: the one they chose, or else the first of theirs. */
export function lubecOwnCharacter(characters: readonly LubecCharacterRecord[], currentCharacterId: string | null, userId: string): LubecCharacterRecord | null {
  const own = characters.filter((c) => inPlay(c) && c.ownerUserId === userId)
  return own.find((c) => c.id === currentCharacterId) ?? own[0] ?? null
}

/** Who may start a fight from the open sheet: the owner and the GM, for a character in play. */
export const lubecCanFightFrom = (character: LubecCharacterRecord | null, viewer: LubecViewer): character is LubecCharacterRecord =>
  character !== null && inPlay(character) && canEditCharacterStoreCharacter(character, viewer.role, viewer.userId)

// A token's NPC as a player may know it: the token itself, named only once the GM reveals the name.
function tokenNpc(token: TokenRecord, npcId: string): LubecNpcIdentity {
  const custom = Boolean(token.tokenImageUrl)
  return {
    id: npcId,
    name: token.revealName ? token.name : 'Someone unknown',
    portraitUrl: null,
    portraitFocusX: 50,
    portraitFocusY: 50,
    tokenIcon: { icon: custom ? 'custom' : 'pawn', color: token.color, size: token.size, customImageUrl: custom ? token.tokenImageUrl : undefined },
  }
}

/** Who a token stands for: `characterId` is a player's character and `npcId` an NPC; null for anything else, or a character out of play. */
export function lubecTokenCombatant(token: TokenRecord, combatants: readonly LubecCombatant[]): LubecCombatant | null {
  const known = (key: string) => combatants.find((c) => lubecCombatantKey(c) === key) ?? null
  if (token.characterId) return known(`character:${token.characterId}`)
  if (!token.npcId) return null
  return known(`npc:${token.npcId}`) ?? { kind: 'npc', npc: tokenNpc(token, token.npcId), sheet: null }
}

type MapFightContext = { viewer: LubecViewer; own: LubecCharacterRecord | null; combatants: readonly LubecCombatant[] }

// A player always attacks as their own current character, and the token is who they attack, unless it is their own.
function playerRequest(tokens: readonly TokenRecord[], { own, combatants }: MapFightContext): LubecFightRequest | null {
  if (!own) return null
  const attacker: LubecCombatant = { kind: 'character', character: own }
  const target = tokens[0] ? lubecTokenCombatant(tokens[0], combatants) : null
  return { attacker, target: target && lubecCombatantKey(target) === lubecCombatantKey(attacker) ? null : target }
}

// The GM picks both sides from the tokens: the first selected attacks the second, or picks a target in the modal.
// NPCs load once the modal opens, so until then a token stands in, and the GM knows every name.
function gmRequest(tokens: readonly TokenRecord[], { combatants }: MapFightContext): LubecFightRequest | null {
  const [attacker, target] = tokens.map((token) => lubecTokenCombatant({ ...token, revealName: true }, combatants))
  return attacker ? { attacker, target: target ?? null } : null
}

/** The request a map's Fight action opens with these selected tokens; null when there is nobody to attack as. */
export const lubecMapFightRequest = (tokens: readonly TokenRecord[], context: MapFightContext): LubecFightRequest | null =>
  (context.viewer.role === 'gm' ? gmRequest : playerRequest)(tokens, context)

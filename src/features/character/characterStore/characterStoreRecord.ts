// What the shared character store takes from a rule set, and how it reads a
// stored character. Nothing here touches Firebase, so a parser test can read
// through the store without the SDK singleton.
import type { TokenIconConfig } from '../../../types/app'
import { isRenderableImageUrl } from '../../common/mediaFields'
import { readCharacterIdentity } from '../../ruleSets/characterIdentity'
import type { CharacterVersioning } from '../../ruleSets/characterMigrations'
import type { CharacterParser } from '../../ruleSets/characterParser'
import type { StoredCharacter } from '../../ruleSets/storedCharacter'

// The fields of a rule set's record the store reads: the identity it lists,
// selects and checks permissions by, and the media whose URLs it resolves
// from their stored paths. Everything else belongs to the rule set.
export type CharacterStoreRecord = {
  id: string
  ownerUserId: string
  portraitPath?: string
  portraitUrl: string | null
  tokenIcon: TokenIconConfig
}

export type CharacterStoreRuleSet<Character extends CharacterStoreRecord> = {
  // The id its characters store in `system`; the store leaves out the rest.
  system: string
  // Its name in the message shown when its characters cannot be loaded.
  label: string
  versioning: CharacterVersioning
  parser: CharacterParser<Character>
}

/** The portrait URL already resolved locally for the same storage path, if any. */
const localPortraitUrl = (portraitPath: string | undefined, local: CharacterStoreRecord | undefined) =>
  local && local.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null

/** The token image URL already resolved locally for the same storage path, if any. */
const localTokenImageUrl = (tokenIcon: TokenIconConfig, local: CharacterStoreRecord | undefined) =>
  tokenIcon.customImagePath
  && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
  && isRenderableImageUrl(local.tokenIcon.customImageUrl)
    ? local.tokenIcon.customImageUrl
    : undefined

/** The token icon, carrying over the locally resolved image URL for the same storage path. */
function withLocalTokenImage(tokenIcon: TokenIconConfig, local: CharacterStoreRecord | undefined): TokenIconConfig {
  const customImageUrl = tokenIcon.customImageUrl ?? localTokenImageUrl(tokenIcon, local)
  return customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon
}

/**
 * The record with any media URL it lacks taken from the local copy, so a
 * snapshot does not blank an image it did not change. A stored URL wins.
 */
const withLocalMedia = <Character extends CharacterStoreRecord>(character: Character, local: Character | undefined): Character => ({
  ...character,
  portraitUrl: character.portraitUrl ?? localPortraitUrl(character.portraitPath, local),
  tokenIcon: withLocalTokenImage(character.tokenIcon, local),
})

/**
 * A stored character document, at the current version, as the rule set's
 * record, or null when it belongs to another system.
 */
export function readCharacterStoreDoc<Character extends CharacterStoreRecord>(
  ruleSet: CharacterStoreRuleSet<Character>,
  id: string,
  data: StoredCharacter,
  local: Character | undefined,
): Character | null {
  if (readCharacterIdentity(id, data).system !== ruleSet.system) return null
  return withLocalMedia(ruleSet.parser.parse(id, data), local)
}

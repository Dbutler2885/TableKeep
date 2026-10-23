import { isRenderableImageUrl } from '../../common/mediaStorage'
import { readCharacterIdentity } from '../../ruleSets/characterIdentity'
import { resolveRuleSet } from '../../ruleSets/registry'
import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import type { TokenIconConfig } from '../../tokens/TokenIconEditor'
import type { CharacterTokenSummary } from './types'

// The URL the local summary already resolved for the same Storage path, so a
// snapshot without one does not blank the token while it is fetched again.
const carriedCustomImageUrl = (tokenIcon: TokenIconConfig, local?: CharacterTokenSummary) =>
  tokenIcon.customImagePath
  && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
  && isRenderableImageUrl(local.tokenIcon.customImageUrl)
    ? local.tokenIcon.customImageUrl
    : undefined

const mapTokenIcon = (tokenIcon: TokenIconConfig, local?: CharacterTokenSummary): TokenIconConfig => {
  const customImageUrl = tokenIcon.customImageUrl ?? carriedCustomImageUrl(tokenIcon, local)
  return customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon
}

// A stored character as the map shows it. Its own `system` picks the rule set
// that says whether it is in play and what pawn colour it gets without art.
// The map reads the stored values with its own defaults, not the sheet's
// tidied ones.
export function mapCharacterSummaryFromData(
  id: string,
  data: StoredCharacter,
  local?: CharacterTokenSummary,
): CharacterTokenSummary {
  const identity = readCharacterIdentity(id, data)
  const ruleSet = resolveRuleSet(identity.system)
  const tokenIcon = identity.tokenIcon ?? { icon: 'pawn', color: ruleSet.skin.tokenColor, size: 34 }
  return {
    id,
    name: identity.name,
    ownerUserId: identity.ownerUserId,
    ...ruleSet.characters.summary(data),
    hidden: identity.hidden,
    deleted: identity.deleted,
    tokenIcon: mapTokenIcon(tokenIcon, local),
  }
}

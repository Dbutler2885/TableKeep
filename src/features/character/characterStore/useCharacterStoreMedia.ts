import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { isRenderableImageUrl, resolveStoragePathUrl } from '../../common/mediaStorage'
import type { CharacterStoreRecord } from './characterStoreRecord'

type ResolvedMedia = { portraitUrl: string | null; customImageUrl: string | null }

/** A character with a stored portrait or token image whose URL has not been resolved. */
export const needsCharacterStoreMediaUrls = (character: CharacterStoreRecord) =>
  Boolean(
    (character.portraitPath && !isRenderableImageUrl(character.portraitUrl))
    || (character.tokenIcon.customImagePath && !isRenderableImageUrl(character.tokenIcon.customImageUrl)),
  )

const resolveOptionalPath = (path: string | undefined) =>
  path ? resolveStoragePathUrl(path) : Promise.resolve<string | null>(null)

const settledUrl = (result: PromiseSettledResult<string | null>) => (result.status === 'fulfilled' ? result.value : null)

const foundAny = ({ portraitUrl, customImageUrl }: ResolvedMedia) => Boolean(portraitUrl || customImageUrl)

/**
 * The portrait's and the token image's URLs, each null when it has none or its
 * lookup failed, so one failure never hides the other. Null when a lookup
 * failed and nothing was found: writing that back would only start the same
 * failing lookup again.
 */
export async function resolveCharacterStoreMediaUrls(character: CharacterStoreRecord): Promise<ResolvedMedia | null> {
  const results = await Promise.allSettled([
    resolveOptionalPath(character.portraitPath),
    resolveOptionalPath(character.tokenIcon.customImagePath),
  ])
  const [portrait, customImage] = results
  const media = { portraitUrl: settledUrl(portrait), customImageUrl: settledUrl(customImage) }
  return results.some((result) => result.status === 'rejected') && !foundAny(media) ? null : media
}

export function withResolvedCharacterStoreMedia<Character extends CharacterStoreRecord>(
  character: Character,
  media: ResolvedMedia,
): Character {
  const { portraitUrl, customImageUrl } = media
  return {
    ...character,
    ...(portraitUrl ? { portraitUrl } : {}),
    ...(customImageUrl ? { tokenIcon: { ...character.tokenIcon, customImageUrl } } : {}),
  }
}

/**
 * Resolves the download URL of every stored portrait and token image that has
 * none, since documents keep only storage paths.
 */
export function useCharacterStoreMedia<Character extends CharacterStoreRecord>(
  characters: Character[],
  setCharacters: Dispatch<SetStateAction<Character[]>>,
) {
  useEffect(() => {
    const charactersNeedingMedia = characters.filter(needsCharacterStoreMediaUrls)
    if (charactersNeedingMedia.length === 0) return
    void Promise.allSettled(charactersNeedingMedia.map(async (character) => {
      const media = await resolveCharacterStoreMediaUrls(character)
      if (!media) return
      setCharacters((current) => current.map((entry) =>
        entry.id === character.id ? withResolvedCharacterStoreMedia(entry, media) : entry))
    }))
  }, [characters, setCharacters])
}

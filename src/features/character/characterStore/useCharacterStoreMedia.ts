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

async function resolveCharacterStoreMediaUrls(character: CharacterStoreRecord): Promise<ResolvedMedia> {
  const [portraitUrl, customImageUrl] = await Promise.all([
    resolveOptionalPath(character.portraitPath),
    resolveOptionalPath(character.tokenIcon.customImagePath),
  ])
  return { portraitUrl, customImageUrl }
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
      setCharacters((current) => current.map((entry) =>
        entry.id === character.id ? withResolvedCharacterStoreMedia(entry, media) : entry))
    }))
  }, [characters, setCharacters])
}

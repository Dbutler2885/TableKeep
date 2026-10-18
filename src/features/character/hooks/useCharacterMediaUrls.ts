import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { CharacterRecord } from '../../../types/app'
import { isRenderableImageUrl, resolveStoragePathUrl } from '../../common/mediaStorage'

type ResolvedMedia = { portraitUrl: string | null; customImageUrl: string | null }

/** A character with a stored portrait or token image whose URL has not been resolved. */
export const needsMediaUrls = (character: CharacterRecord) =>
  Boolean(
    (character.portraitPath && !isRenderableImageUrl(character.portraitUrl))
    || (character.tokenIcon.customImagePath && !isRenderableImageUrl(character.tokenIcon.customImageUrl)),
  )

const resolveOptionalPath = (path: string | undefined) =>
  path ? resolveStoragePathUrl(path) : Promise.resolve<string | null>(null)

async function resolveMediaUrls(character: CharacterRecord): Promise<ResolvedMedia> {
  const [portraitUrl, customImageUrl] = await Promise.all([
    resolveOptionalPath(character.portraitPath),
    resolveOptionalPath(character.tokenIcon.customImagePath),
  ])
  return { portraitUrl, customImageUrl }
}

/** The character with every URL that was found; one that was not found is left as it is. */
export function withResolvedMedia(character: CharacterRecord, media: ResolvedMedia): CharacterRecord {
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
export function useCharacterMediaUrls(
  characters: CharacterRecord[],
  setCharacters: Dispatch<SetStateAction<CharacterRecord[]>>,
) {
  useEffect(() => {
    const charactersNeedingMedia = characters.filter(needsMediaUrls)
    if (charactersNeedingMedia.length === 0) return
    void Promise.allSettled(charactersNeedingMedia.map(async (character) => {
      const media = await resolveMediaUrls(character)
      setCharacters((current) => current.map((entry) =>
        entry.id === character.id ? withResolvedMedia(entry, media) : entry))
    }))
  }, [characters, setCharacters])
}

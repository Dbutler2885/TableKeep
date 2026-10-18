import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { isRenderableImageUrl, resolveStoragePathUrl } from '../common/mediaStorage'
import type { VtmCharacterRecord } from './vtmTypes'

type ResolvedMedia = { portraitUrl: string | null; customImageUrl: string | null }

/** A character with a stored portrait or token image whose URL has not been resolved. */
export const needsVtmMediaUrls = (character: VtmCharacterRecord) =>
  Boolean(
    (character.portraitPath && !isRenderableImageUrl(character.portraitUrl))
    || (character.tokenIcon.customImagePath && !isRenderableImageUrl(character.tokenIcon.customImageUrl)),
  )

const resolveOptionalPath = (path: string | undefined) =>
  path ? resolveStoragePathUrl(path) : Promise.resolve<string | null>(null)

async function resolveVtmMediaUrls(character: VtmCharacterRecord): Promise<ResolvedMedia> {
  const [portraitUrl, customImageUrl] = await Promise.all([
    resolveOptionalPath(character.portraitPath),
    resolveOptionalPath(character.tokenIcon.customImagePath),
  ])
  return { portraitUrl, customImageUrl }
}

export function withResolvedVtmMedia(character: VtmCharacterRecord, media: ResolvedMedia): VtmCharacterRecord {
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
export function useVtmCharacterMedia(
  characters: VtmCharacterRecord[],
  setCharacters: Dispatch<SetStateAction<VtmCharacterRecord[]>>,
) {
  useEffect(() => {
    const charactersNeedingMedia = characters.filter(needsVtmMediaUrls)
    if (charactersNeedingMedia.length === 0) return
    void Promise.allSettled(charactersNeedingMedia.map(async (character) => {
      const media = await resolveVtmMediaUrls(character)
      setCharacters((current) => current.map((entry) =>
        entry.id === character.id ? withResolvedVtmMedia(entry, media) : entry))
    }))
  }, [characters, setCharacters])
}

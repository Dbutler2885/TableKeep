import { uploadEntityImage } from '../../common/mediaStorage'
import type { CharacterRecord } from '../../../types/app'

type Params = { campaignId: string; groupId: string; effectiveSelected: CharacterRecord | null; canEditSelected: boolean }

export function useCharacterMedia({ campaignId, groupId, effectiveSelected, canEditSelected }: Params) {
  const upload = async (file: File, mediaKind: 'token-icons' | 'portraits', maxWidth: number, maxHeight: number) => {
    if (!effectiveSelected || !canEditSelected) throw new Error('No editable character selected.')
    return uploadEntityImage({ campaignId, groupId, collectionName: 'characters', entityId: effectiveSelected.id, mediaKind, file, maxWidth, maxHeight })
  }
  const uploadCharacterTokenImage = async (file: File) => {
    const { path, url, name } = await upload(file, 'token-icons', 1024, 1024)
    return { customImagePath: path, customImageUrl: url, customImageName: name }
  }
  const uploadCharacterPortraitImage = async (file: File) => {
    const { path, url } = await upload(file, 'portraits', 600, 800)
    return { portraitPath: path, portraitUrl: url }
  }
  return { uploadCharacterTokenImage, uploadCharacterPortraitImage }
}

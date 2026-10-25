import { makeId } from '../character/characterFactories'
import { normalizeImageForUpload } from '../common/imageNormalization'
import { uploadEntityImage } from '../common/mediaStorage'
import { errorMessage } from '../groups/busyAction'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecOwner } from '../ruleSets/lubec/directEntry'
import {
  LUBEC_UNREADABLE_PORTRAIT_NOTE,
  makeLubecImportedCharacter,
  type LubecImportedCharacter,
} from '../ruleSets/lubec/importFile'

// Creates an imported character through the shared store, then uploads its
// portrait as the character's owner and stores only the portrait's path. The
// character document has to exist first, because the Storage rules check the
// owner upload against it.

export type LubecImportContext = {
  campaignId: string
  groupId: string
  owner: LubecOwner
  addCharacter: (character: LubecCharacterRecord) => Promise<void>
  updateCharacter: (characterId: string, updates: Partial<LubecCharacterRecord>) => void
  setError: (message: string) => void
}

const PORTRAIT_SIZE = { maxWidth: 600, maxHeight: 800 }

// The portrait decoded as an image, ready to upload; null when it cannot be.
async function readablePortrait(file: File | null): Promise<File | null> {
  if (!file) return null
  try {
    return (await normalizeImageForUpload(file, { ...PORTRAIT_SIZE, preferType: 'image/webp', quality: 0.9 })).file
  } catch {
    return null
  }
}

async function uploadPortrait(context: LubecImportContext, characterId: string, file: File) {
  try {
    const { path, url } = await uploadEntityImage({
      campaignId: context.campaignId,
      groupId: context.groupId,
      collectionName: 'characters',
      entityId: characterId,
      mediaKind: 'portraits',
      file,
      ...PORTRAIT_SIZE,
      uploadAuthority: 'owner',
    })
    context.updateCharacter(characterId, { portraitPath: path, portraitUrl: url })
  } catch (error) {
    context.setError(errorMessage(error, 'The imported portrait could not be uploaded.'))
  }
}

/** Creates the imported character, owned by the importer, then gives it the file's portrait. */
export async function importLubecCharacter(context: LubecImportContext, imported: LubecImportedCharacter) {
  const portrait = await readablePortrait(imported.portrait)
  const importNotes = imported.portrait && !portrait ? [...imported.importNotes, LUBEC_UNREADABLE_PORTRAIT_NOTE] : imported.importNotes
  const character = makeLubecImportedCharacter(makeId(), context.owner, { ...imported, importNotes })
  await context.addCharacter(character)
  if (portrait) await uploadPortrait(context, character.id, portrait)
}

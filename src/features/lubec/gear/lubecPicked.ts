// The file a player picks for an item's picture, as the form takes it (B's
// `pic-file` handler). What uploads it is `lubecItemArt.ts`; this stays apart
// so the Gear page does not load the Firebase app to know what a picture is.

import { LUBEC_SHAPES } from './gearArt'
import type { LubecFormPicture } from './itemForm'

/** Uploads a file and gives the form's picture: its Storage path, and the shape its proportions pick. */
export type LubecPictureUpload = (file: File) => Promise<LubecFormPicture>

export type LubecPicked = { ok: true; picture: LubecFormPicture; toast: string } | { ok: false; msg: string }

/** The file the player picked, uploaded, or the form's refusal in B's words. */
export async function lubecPickedPicture(upload: LubecPictureUpload, file: File): Promise<LubecPicked> {
  if (!file.type.startsWith('image/')) return { ok: false, msg: "That file isn't a picture." }
  try {
    const picture = await upload(file)
    return { ok: true, picture, toast: `Picture added. Shape: ${LUBEC_SHAPES[picture.shape]}, from its proportions.` }
  } catch {
    return { ok: false, msg: "That picture didn't load." }
  }
}

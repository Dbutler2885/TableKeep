import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { LubecFormSheet } from './itemSheet'
import { lubecPickedPicture, type LubecPictureUpload } from './lubecPicked'

/** The form's file picker, which the card's "Add a picture" opens too. */
export const LUBEC_PIC_FILE = 'lubec-pic-file'

/** How the form uploads a picture, and the toast that says it did. */
export type LubecFormPictures = { upload: LubecPictureUpload; toast: (text: string) => void }

/** The form's upload: whether one is on its way, and what to do with a picked file. */
export type LubecPicking = { busy: boolean; onFile: (file: File) => void }

/**
 * Opens a form and its file picker, as B's `act-add-pic` does. A browser opens
 * a file picker only inside the tap, so the form has to be on the page first.
 */
export function lubecOpenWithPicker(openForm: () => void) {
  flushSync(openForm)
  document.getElementById(LUBEC_PIC_FILE)?.click()
}

/**
 * Uploads the file the form's picture box picks. It lands on the form as it is
 * when the upload ends, so what the player typed meanwhile stays, and it is
 * dropped if the form has closed.
 */
export function useLubecPictureUpload(form: LubecFormSheet, onForm: (form: LubecFormSheet) => void, pictures: LubecFormPictures | null): LubecPicking | null {
  const [busy, setBusy] = useState(false)
  const now = useRef<{ form: LubecFormSheet; onForm: typeof onForm } | null>(null)
  useEffect(() => {
    now.current = { form, onForm }
  })
  useEffect(() => () => { now.current = null }, [])
  if (!pictures) return null
  const onFile = async (file: File) => {
    setBusy(true)
    const picked = await lubecPickedPicture(pictures.upload, file)
    setBusy(false)
    if (!now.current) return
    const { form: latest, onForm: apply } = now.current
    if (!picked.ok) return apply({ ...latest, error: picked.msg })
    apply({ ...latest, error: null, fields: { ...latest.fields, picture: picked.picture } })
    pictures.toast(picked.toast)
  }
  return { busy, onFile: (file) => void onFile(file) }
}

import { useEffect, type RefObject } from 'react'

function trapDialogTab(event: KeyboardEvent, dialog: HTMLElement) {
  const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')]
  const first = controls[0]
  const last = controls.at(-1)
  const wrapBack = event.shiftKey && document.activeElement === first
  const wrapForward = !event.shiftKey && document.activeElement === last
  if (wrapBack || wrapForward || !dialog.contains(document.activeElement)) {
    event.preventDefault()
    ;(wrapBack ? last : first)?.focus()
  }
}

function suspendDialogSiblings(dialog: HTMLElement): () => void {
  const overlay = dialog.parentElement
  const siblings = [...(overlay?.parentElement?.children ?? [])].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
  const states = siblings.map((element) => ({ element, inert: element.inert }))
  states.forEach(({ element }) => { element.inert = true })
  return () => states.forEach(({ element, inert }) => { element.inert = inert })
}

export function useHandoutDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    const restoreSiblings = suspendDialogSiblings(dialog)
    dialog.querySelector<HTMLElement>('[data-handout-close]')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') trapDialogTab(event, dialog)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreSiblings()
      if (previous?.isConnected) previous.focus()
    }
  }, [onClose, ref])
}

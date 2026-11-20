import { useEffect } from 'react'
import type { RefObject } from 'react'

/** The width the Core and Gear pages are laid out for at full size, beside the roster on a desktop. */
export const LUBEC_SHEET_FULL_WIDTH = 1080

/**
 * How far a sheet given `available` pixels of width is scaled to show all of
 * its Core or Gear page: full size when there is room, otherwise smaller, in
 * steps of 5% so the type keeps to a few sizes rather than every width's own.
 */
export function lubecFitWidth(available: number): number {
  if (!(available > 0)) return 1
  return Math.min(1, Math.floor((available / LUBEC_SHEET_FULL_WIDTH) * 20) / 20)
}

/**
 * Keeps the sheet's `--lubec-fit-width` in step with the width its pane gives
 * it. The pane is narrower than the window by the campaign sidebar beside it
 * and the roster, so the step is measured, not read off the window's width.
 * The stylesheet applies it only on a desktop, where the sheet is zoomed to fit.
 */
export function useLubecFitWidth(sheetRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const sheet = sheetRef.current
    const pane = sheet?.parentElement
    if (!sheet || !pane || typeof ResizeObserver === 'undefined') return
    const fit = () => sheet.style.setProperty('--lubec-fit-width', String(lubecFitWidth(pane.clientWidth)))
    const observer = new ResizeObserver(fit)
    observer.observe(pane)
    fit()
    return () => observer.disconnect()
  }, [sheetRef])
}

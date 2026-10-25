// A roll circle's number sits on the circle's centre by its ink, not its
// advance. The display face's figures are tabular, so a "1" is a narrow glyph
// in a full-width cell and "17" or "31" would sit visibly off centre; the CSS
// already evens out the letter-spacing, and this evens out the side bearings.

/** The parts of a canvas text measurement the shift is worked out from. */
export type LubecInkMetrics = Pick<TextMetrics, 'width' | 'actualBoundingBoxLeft' | 'actualBoundingBoxRight'>

/** How far right, in em, to move a run of text so its ink is centred where its advance was. */
export const lubecInkShift = (metrics: LubecInkMetrics, fontSize: number): number =>
  (metrics.width + metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2 / fontSize

let measuring: OffscreenCanvasRenderingContext2D | null | undefined

// Null where there is no canvas to measure with, as under jsdom.
function measuringContext(): OffscreenCanvasRenderingContext2D | null {
  if (measuring === undefined) measuring = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d')
  return measuring
}

/** Moves a positioned element sideways by its text's own side bearings, in the font it is drawn in. */
export function centreLubecInk(element: HTMLElement): void {
  const context = measuringContext()
  if (!context) return
  const style = getComputedStyle(element)
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const text = style.textTransform === 'uppercase' ? element.textContent.toUpperCase() : element.textContent
  element.style.left = `${lubecInkShift(context.measureText(text), parseFloat(style.fontSize))}em`
}

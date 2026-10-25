import { useLubecInkCentre } from './useLubecInkCentre'

/** A roll circle's number or word, centred by its ink. */
export function LubecInk({ text }: { text: string }) {
  const ref = useLubecInkCentre<HTMLSpanElement>(text)
  return <span ref={ref} className="lubec-ink">{text}</span>
}

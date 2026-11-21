import { useEffect, useRef, type ReactNode } from 'react'

type OverPopProps = { className: string; summary: ReactNode; label?: string; children: ReactNode }

/**
 * A count that opens the rest of a list over the page instead of growing its box, so a fixed layout keeps its
 * shape. It closes again on a click anywhere outside it or on Escape, which hands focus back to the count.
 */
export function OverPop({ className, summary, label, children }: OverPopProps) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const details = ref.current
      if (details?.open && !details.contains(event.target as Node)) details.open = false
    }
    const escape = (event: KeyboardEvent) => {
      const details = ref.current
      if (event.key !== 'Escape' || !details?.open) return
      details.open = false
      details.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return (
    <details ref={ref} className={className}>
      <summary aria-label={label}>{summary}</summary>
      {children}
    </details>
  )
}

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useDismissOnOutside, type Dismissal } from '../../common/useDismissOnOutside'

type OverPopProps = { className: string; summary: ReactNode; label?: string; children: ReactNode }

/**
 * A count that opens the rest of a list over the page instead of growing its box, so a fixed layout keeps its
 * shape. It closes again on a click anywhere outside it or on Escape, which hands focus back to the count.
 */
export function OverPop({ className, summary, label, children }: OverPopProps) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback((how: Dismissal) => {
    const details = ref.current!
    details.open = false
    if (how === 'escape') details.querySelector('summary')?.focus()
  }, [])
  useDismissOnOutside(ref, open, close)
  return (
    <details ref={ref} className={className} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary aria-label={label}>{summary}</summary>
      {children}
    </details>
  )
}

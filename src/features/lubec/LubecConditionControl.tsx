import { Activity } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { LubecCondition } from '../ruleSets/lubec/condition'

export type LubecConditionChange = ((condition: LubecCondition | undefined) => void) | null

/** The GM's condition picker floats from the existing name-band action row. */
export function LubecConditionControl({ condition, onChange }: { condition?: LubecCondition; onChange: LubecConditionChange }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  if (!onChange) return null
  return <span className="lubec-condition-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus() } }}>
    <button ref={button} type="button" className="lubec-band-edit" aria-label="Set condition" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><Activity size={12} aria-hidden="true" /> Condition</button>
    {open ? <span id={id} className="lubec-condition-popover" role="dialog" aria-label="Set condition">
      <label>Condition <select autoFocus aria-label="Condition" value={condition ?? ''} onChange={(event) => { onChange(event.target.value ? event.target.value as LubecCondition : undefined); setOpen(false); button.current?.focus() }}><option value="">None</option><option value="comatose">Comatose</option><option value="dead">Dead</option></select></label>
    </span> : null}
  </span>
}

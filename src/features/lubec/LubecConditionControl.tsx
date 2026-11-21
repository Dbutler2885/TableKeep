import { Activity } from 'lucide-react'
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import type { LubecCondition } from '../ruleSets/lubec/condition'

export type LubecConditionChange = ((condition: LubecCondition | undefined) => void) | null

function useConditionPopover() {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); button.current?.focus() }
  const onBlur = (event: FocusEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => { if (event.key === 'Escape') close() }
  return { open, setOpen, button, close, onBlur, onKeyDown }
}

function ConditionOptions({ id, condition, onChange, close }: { id: string; condition?: LubecCondition; onChange: Exclude<LubecConditionChange, null>; close: () => void }) {
  return <span id={id} className="lubec-condition-popover" role="dialog" aria-label="Set condition">
    <label>Condition <select autoFocus aria-label="Condition" value={condition ?? ''} onChange={(event) => { onChange(event.target.value ? event.target.value as LubecCondition : undefined); close() }}><option value="">None</option><option value="comatose">Comatose</option><option value="dead">Dead</option></select></label>
  </span>
}

/** The GM's condition picker floats from the existing name-band action row. */
export function LubecConditionControl({ condition, onChange }: { condition?: LubecCondition; onChange: LubecConditionChange }) {
  const { open, setOpen, button, close, onBlur, onKeyDown } = useConditionPopover()
  const id = useId()
  if (!onChange) return null
  return <span className="lubec-condition-control" onBlur={onBlur} onKeyDown={onKeyDown}>
    <button ref={button} type="button" className="lubec-band-edit" aria-label="Set condition" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><Activity size={12} aria-hidden="true" /> Condition</button>
    {open ? <ConditionOptions id={id} condition={condition} onChange={onChange} close={close} /> : null}
  </span>
}

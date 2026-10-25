import { useState } from 'react'
import { parseLubecBaseEntry } from '../ruleSets/lubec/directEntry'

type BaseInputProps = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}

const textOf = (value: number | null) => (value === null ? '' : String(value))

/**
 * A base value typed in. The field keeps what was typed while it still reads as
 * the stored value, so "4" on the way to "42" or a stray letter is not wiped,
 * and shows the stored value once something else changes it.
 */
export function LubecBaseInput({ label, value, onChange }: BaseInputProps) {
  const [text, setText] = useState(() => textOf(value))
  const shown = parseLubecBaseEntry(text) === value ? text : textOf(value)
  return (
    <input
      className="lubec-base-input"
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={shown}
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseLubecBaseEntry(event.target.value))
      }}
    />
  )
}

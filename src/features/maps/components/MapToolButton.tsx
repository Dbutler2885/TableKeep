import type { ReactNode } from 'react'
import { activeClassName } from '../lib/activeClassName'

type MapToolButtonProps = {
  className: string
  active: boolean
  onClick: () => void
  disabled?: boolean
  label: string
  tooltip: string
  children: ReactNode
}

// One icon button in the GM tool panel, marked active while its tool is on.
export function MapToolButton({ className, active, onClick, disabled, label, tooltip, children }: MapToolButtonProps) {
  return (
    <button
      type="button"
      className={activeClassName(className, active)}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tooltip={tooltip}
    >
      {children}
    </button>
  )
}

import type { ReactNode } from 'react'

type IconValueSliderProps = {
  icon: ReactNode
  tooltip: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  ariaLabel: string
  className?: string
  onChange: (value: number) => void
}

export function IconValueSlider({
  icon,
  tooltip,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  ariaLabel,
  className = '',
  onChange,
}: IconValueSliderProps) {
  return (
    <div className={['icon-value-slider', className].filter(Boolean).join(' ')}>
      <span className="icon-value-slider-icon fast-tooltip" data-tooltip={tooltip} aria-hidden>
        {icon}
      </span>
      <input
        className="icon-value-slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="icon-value-slider-value">{value}</span>
    </div>
  )
}

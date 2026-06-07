type DotRatingProps = {
  value: number
  onChange: (next: number) => void
  max?: number
  min?: number
  disabled?: boolean
  label: string
}

export function DotRating({ value, onChange, max = 5, min = 0, disabled = false, label }: DotRatingProps) {
  const normalized = Math.max(min, Math.min(max, Math.floor(value || 0)))
  return (
    <div className="dot-rating" role="group" aria-label={label}>
      {Array.from({ length: max }, (_, index) => {
        const dotValue = index + 1
        const active = dotValue <= normalized
        return (
          <button
            key={dotValue}
            type="button"
            className={active ? 'dot-rating-dot active' : 'dot-rating-dot'}
            aria-label={`${label}: set ${dotValue}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              // Click an empty dot to fill up to it; click a filled dot to clear it
              // and everything stacked above it (they depend on it), i.e. down to N-1.
              const next = active ? dotValue - 1 : dotValue
              onChange(Math.max(min, next))
            }}
          />
        )
      })}
    </div>
  )
}

import { Check } from 'lucide-react'

export function ModeConfirmAction({
  saved,
  label,
  onApply,
  ariaLabel,
  disabled = false,
}: {
  saved: boolean
  label: string
  onApply: () => void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <div className="map-grid-calibration-actions">
      {saved ? (
        <span className="map-grid-calibration-saved" aria-live="polite">
          Success!
        </span>
      ) : (
        <>
          <span className="map-grid-calibration-apply-label">{label}</span>
          <button
            type="button"
            className="map-grid-calibration-action-btn"
            disabled={disabled}
            onClick={onApply}
            aria-label={ariaLabel}
          >
            <Check size={14} />
          </button>
        </>
      )}
    </div>
  )
}

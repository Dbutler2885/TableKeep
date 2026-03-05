import { Crosshair } from 'lucide-react'

export function PlayerMapControls({
  cameraLock,
  onToggleCameraLock,
  dark = false,
}: {
  cameraLock: boolean
  onToggleCameraLock: () => void
  dark?: boolean
}) {
  return (
    <div className={dark ? 'map-controls-body dark' : 'map-controls-body'}>
      <div className="map-icon-grid">
        <button
          type="button"
          className={cameraLock ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={onToggleCameraLock}
          data-tooltip="Camera lock"
          aria-label="Toggle camera lock"
        >
          <Crosshair size={16} />
        </button>
      </div>
    </div>
  )
}

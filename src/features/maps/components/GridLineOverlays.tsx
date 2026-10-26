import type { MouseEvent } from 'react'
import type { GridLine } from '../lib/mapGridView'

type HandleMouseDown = (event: MouseEvent<HTMLButtonElement>, handle: 'start' | 'end') => void

function GridLineSvg({ line }: { line: GridLine }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <line
        x1={line.start.x * 100}
        y1={line.start.y * 100}
        x2={line.end.x * 100}
        y2={line.end.y * 100}
      />
    </svg>
  )
}

type GridLineHandleProps = { point: { x: number; y: number }; label: string; onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void }

function GridLineHandle({ point, label, onMouseDown }: GridLineHandleProps) {
  return (
    <button
      type="button"
      className="map-grid-calibration-handle"
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      onMouseDown={onMouseDown}
      aria-label={label}
    />
  )
}

type CalibrationOverlayProps = { line: GridLine | null; pulse: boolean; onHandleMouseDown: HandleMouseDown }

// The line the GM draws across one grid square to calibrate the grid, with draggable ends.
export function CalibrationOverlay({ line, pulse, onHandleMouseDown }: CalibrationOverlayProps) {
  if (!line) return null
  return (
    <div className={pulse ? 'map-grid-calibration-overlay pulse' : 'map-grid-calibration-overlay'} aria-hidden>
      <GridLineSvg line={line} />
      <GridLineHandle point={line.start} label="Move calibration start point" onMouseDown={(event) => onHandleMouseDown(event, 'start')} />
      <GridLineHandle point={line.end} label="Move calibration end point" onMouseDown={(event) => onHandleMouseDown(event, 'end')} />
    </div>
  )
}

type MeasurementOverlayProps = { line: GridLine | null; label: string; onHandleMouseDown: HandleMouseDown }

// The line the GM measures along, with draggable ends and the distance at its middle.
export function MeasurementOverlay({ line, label, onHandleMouseDown }: MeasurementOverlayProps) {
  if (!line) return null
  return (
    <div className="map-grid-calibration-overlay map-grid-measurement-overlay" aria-hidden>
      <GridLineSvg line={line} />
      <GridLineHandle point={line.start} label="Move measurement start" onMouseDown={(event) => onHandleMouseDown(event, 'start')} />
      <GridLineHandle point={line.end} label="Move measurement end" onMouseDown={(event) => onHandleMouseDown(event, 'end')} />
      <div
        className="map-grid-measurement-label"
        style={{
          left: `${((line.start.x + line.end.x) / 2) * 100}%`,
          top: `${((line.start.y + line.end.y) / 2) * 100}%`,
        }}
      >
        {label}
      </div>
    </div>
  )
}

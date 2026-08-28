export type MeasurementLine = {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export const measurementDistanceFeet = ({
  line,
  effectiveGridCellScale,
  activeMapDimension,
  activeMapWidth,
  activeMapHeight,
}: {
  line: MeasurementLine | null
  effectiveGridCellScale: number
  activeMapDimension: number
  activeMapWidth: number
  activeMapHeight: number
}) => {
  if (!line) return null
  const cellPx = Math.max(1, effectiveGridCellScale * Math.max(1, activeMapDimension))
  const dxPx = (line.end.x - line.start.x) * Math.max(1, activeMapWidth)
  const dyPx = (line.end.y - line.start.y) * Math.max(1, activeMapHeight)
  const distanceFeet = (Math.hypot(dxPx, dyPx) / cellPx) * 10
  return Number.isFinite(distanceFeet) ? distanceFeet : null
}

export const measurementDistanceLabel = (distanceFeet: number | null) => {
  if (distanceFeet === null) return '--'
  const rounded = Math.round(distanceFeet * 10) / 10
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}'` : `${rounded.toFixed(1)}'`
}

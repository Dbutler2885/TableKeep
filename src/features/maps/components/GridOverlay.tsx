import { useMemo } from 'react'
import { hexPointySpacing, hexFlatSpacing, hexPointyPath, hexFlatPath } from '../lib/hexGridMath'

// Hex grid rendered as an SVG path — shared by pointy-top and flat-top orientations.
function HexGridOverlay({
  orientation,
  mapWidth,
  mapHeight,
  cellPx,
  offsetX,
  offsetY,
  pending,
}: {
  orientation: 'hex-pointy' | 'hex-flat'
  mapWidth: number
  mapHeight: number
  cellPx: number
  offsetX: number
  offsetY: number
  pending?: boolean
}) {
  const pathData = useMemo(() => {
    const width = Math.max(1, mapWidth)
    const height = Math.max(1, mapHeight)
    const r = Math.max(4, cellPx / 2)
    const parts: string[] = []

    if (orientation === 'hex-pointy') {
      // Pointy-top: odd-r row-offset (rows stagger horizontally).
      const { hexWidth, hexHeight, xStep, yStep, rowOffsetX } = hexPointySpacing(r)
      const rowMin = Math.floor((-offsetY - hexHeight) / yStep) - 2
      const rowMax = Math.ceil((height - offsetY + hexHeight) / yStep) + 2
      for (let row = rowMin; row <= rowMax; row += 1) {
        const parity = ((row % 2) + 2) % 2
        const xShift = parity ? rowOffsetX : 0
        const cy = offsetY + row * yStep
        const colMin = Math.floor((-offsetX - xShift - hexWidth) / xStep) - 2
        const colMax = Math.ceil((width - offsetX - xShift + hexWidth) / xStep) + 2
        for (let col = colMin; col <= colMax; col += 1) {
          const cx = offsetX + xShift + col * xStep
          if (cx < -hexWidth || cx > width + hexWidth || cy < -hexHeight || cy > height + hexHeight) continue
          parts.push(hexPointyPath(cx, cy, r))
        }
      }
    } else {
      // Flat-top: odd-q column-offset (columns stagger vertically).
      const { hexWidth, hexHeight, xStep, yStep, colOffsetY } = hexFlatSpacing(r)
      const colMin = Math.floor((-offsetX - hexWidth) / xStep) - 2
      const colMax = Math.ceil((width - offsetX + hexWidth) / xStep) + 2
      for (let col = colMin; col <= colMax; col += 1) {
        const parity = ((col % 2) + 2) % 2
        const yShift = parity ? colOffsetY : 0
        const cx = offsetX + col * xStep
        const rowMin = Math.floor((-offsetY - yShift - hexHeight) / yStep) - 2
        const rowMax = Math.ceil((height - offsetY - yShift + hexHeight) / yStep) + 2
        for (let row = rowMin; row <= rowMax; row += 1) {
          const cy = offsetY + yShift + row * yStep
          if (cx < -hexWidth || cx > width + hexWidth || cy < -hexHeight || cy > height + hexHeight) continue
          parts.push(hexFlatPath(cx, cy, r))
        }
      }
    }

    return parts.join(' ')
  }, [cellPx, mapHeight, mapWidth, offsetX, offsetY, orientation])

  return (
    <svg
      className={pending ? 'map-grid-overlay map-grid-overlay-hex pending' : 'map-grid-overlay map-grid-overlay-hex'}
      viewBox={`0 0 ${Math.max(1, mapWidth)} ${Math.max(1, mapHeight)}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path className="map-grid-overlay-path" d={pathData} />
    </svg>
  )
}

// Renders the grid overlay (square div or hex SVG) for a given map view.
// Pass the effective grid values and the pixel dimensions of the map layer.
export function GridOverlay({
  enabled,
  visible,
  type,
  pending,
  cellScale,
  offsetX,
  offsetY,
  mapWidth,
  mapHeight,
}: {
  enabled: boolean
  visible: boolean
  type: 'square' | 'hex-pointy' | 'hex-flat'
  pending?: boolean
  cellScale: number
  offsetX: number
  offsetY: number
  mapWidth: number
  mapHeight: number
}) {
  if (!enabled || !visible) return null
  const mapDimension = Math.max(1, Math.min(mapWidth, mapHeight))
  const cellPx = Math.max(8, Math.min(520, Math.round(cellScale * mapDimension)))
  const offsetXpx = offsetX * mapWidth
  const offsetYpx = offsetY * mapHeight

  if (type === 'square') {
    return (
      <div
        className="map-grid-overlay"
        style={{
          backgroundSize: `${cellPx}px ${cellPx}px`,
          backgroundPosition: `${offsetXpx}px ${offsetYpx}px`,
        }}
      />
    )
  }

  return (
    <HexGridOverlay
      orientation={type}
      mapWidth={mapWidth}
      mapHeight={mapHeight}
      cellPx={cellPx}
      offsetX={offsetXpx}
      offsetY={offsetYpx}
      pending={pending}
    />
  )
}

import type { MapRecord } from './types'

type Point = { x: number; y: number }

// The calibration or measurement line while its mode is on: from the start point
// to the placed end, or to the pointer before the end is placed.
export function activeGridLine(mode: boolean, start: Point | null, end: Point | null, preview: Point | null) {
  if (!mode || !start) return null
  const lineEnd = end ?? preview
  return lineEnd ? { start, end: lineEnd } : null
}

export type GridLine = NonNullable<ReturnType<typeof activeGridLine>>

export function isMeasurementToolEnabled(gridEnabled: boolean, gridAdjustMode: boolean, map: MapRecord | null) {
  return gridEnabled || gridAdjustMode || Boolean(map?.gridCalibrated)
}

export function gridCellPixels(cellScale: number, mapDimension: number) {
  return Math.max(8, Math.min(520, Math.round(cellScale * mapDimension)))
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

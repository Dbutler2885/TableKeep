import type { CSSProperties } from 'react'
import type { TokenRecord } from './types'

export type Point = { x: number; y: number }
export type SelectionBox = { start: Point; end: Point }

function normalizedBox(start: Point, end: Point) {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  }
}

type Box = ReturnType<typeof normalizedBox>

function isTinyBox(box: Box) {
  return box.maxX - box.minX < 0.005 && box.maxY - box.minY < 0.005
}

function isInBox(token: TokenRecord, box: Box) {
  return token.x >= box.minX && token.x <= box.maxX && token.y >= box.minY && token.y <= box.maxY
}

// The tokens a finished drag box selects. A box too small to be a drag selects none.
export function boxSelectionIds(tokens: TokenRecord[], start: Point, end: Point) {
  const box = normalizedBox(start, end)
  if (isTinyBox(box)) return []
  return tokens.filter((token) => isInBox(token, box)).map((token) => token.id)
}

export function extendSelectionBox(current: SelectionBox | null, end: Point) {
  return current ? { ...current, end } : current
}

export function selectionRectStyle(selection: SelectionBox | null): CSSProperties | null {
  if (!selection) return null
  const box = normalizedBox(selection.start, selection.end)
  return {
    left: `${box.minX * 100}%`,
    top: `${box.minY * 100}%`,
    width: `${(box.maxX - box.minX) * 100}%`,
    height: `${(box.maxY - box.minY) * 100}%`,
  }
}

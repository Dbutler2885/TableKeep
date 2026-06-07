import type { Waypoint } from './types'

// Interpolates position along a path at animation progress `animT` (0–1).
// When waypoints carry timestamps, interpolation follows the recorded pace exactly.
// Falls back to uniform distance-based interpolation when timestamps are absent.
export function interpolateAlongPath(path: Waypoint[], animT: number): { x: number; y: number } {
  if (path.length === 0) return { x: 0.5, y: 0.5 }
  if (path.length === 1 || animT <= 0) return { x: path[0].x, y: path[0].y }
  if (animT >= 1) return { x: path[path.length - 1].x, y: path[path.length - 1].y }

  const firstT = path[0].t
  const lastT = path[path.length - 1].t
  if (firstT !== undefined && lastT !== undefined && lastT > firstT) {
    // Time-based: replay at recorded pace
    const targetTime = firstT + animT * (lastT - firstT)
    for (let i = 1; i < path.length; i++) {
      const pt = path[i].t ?? lastT
      if (pt >= targetTime) {
        const prev = path[i - 1]
        const prevT = prev.t ?? firstT
        const segDur = pt - prevT
        const segFrac = segDur === 0 ? 0 : (targetTime - prevT) / segDur
        return {
          x: prev.x + (path[i].x - prev.x) * segFrac,
          y: prev.y + (path[i].y - prev.y) * segFrac,
        }
      }
    }
    return { x: path[path.length - 1].x, y: path[path.length - 1].y }
  }

  // Distance-based fallback
  let totalLen = 0
  const segLengths: number[] = []
  for (let i = 1; i < path.length; i++) {
    const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    segLengths.push(len)
    totalLen += len
  }
  if (totalLen === 0) return { x: path[0].x, y: path[0].y }
  const target = animT * totalLen
  let dist = 0
  for (let i = 0; i < segLengths.length; i++) {
    if (dist + segLengths[i] >= target) {
      const segFrac = segLengths[i] === 0 ? 0 : (target - dist) / segLengths[i]
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * segFrac,
        y: path[i].y + (path[i + 1].y - path[i].y) * segFrac,
      }
    }
    dist += segLengths[i]
  }
  return { x: path[path.length - 1].x, y: path[path.length - 1].y }
}

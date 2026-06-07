// Pure hex grid math. No React, no DOM — safe to unit-test in isolation.
// Coordinate conventions:
//   - pixel coords (px, py): screen pixels within the map layer
//   - offsetX/offsetY: pixel offset of the grid origin from the top-left of the map layer
//   - hexR: circumradius (center-to-vertex distance) of one hex cell
//   - axial (q, r): standard axial/cube hex coordinates (q + r + s = 0)

const SQRT3 = Math.sqrt(3)

// ── Spacing helpers ───────────────────────────────────────────────────────────

/** Grid step sizes for a pointy-top (odd-r) hex grid. */
export function hexPointySpacing(hexR: number) {
  return {
    hexWidth: SQRT3 * hexR,
    hexHeight: 2 * hexR,
    xStep: SQRT3 * hexR,
    yStep: 1.5 * hexR,
    rowOffsetX: SQRT3 * hexR * 0.5,
  }
}

/** Grid step sizes for a flat-top (odd-q) hex grid. */
export function hexFlatSpacing(hexR: number) {
  return {
    hexWidth: 2 * hexR,
    hexHeight: SQRT3 * hexR,
    xStep: 1.5 * hexR,
    yStep: SQRT3 * hexR,
    colOffsetY: SQRT3 * hexR * 0.5,
  }
}

// ── SVG path generators ───────────────────────────────────────────────────────

/** SVG path string for a single pointy-top hex centered at (cx, cy). */
export function hexPointyPath(cx: number, cy: number, hexR: number): string {
  const xh = SQRT3 * hexR * 0.5
  return (
    `M ${cx} ${cy - hexR} L ${cx + xh} ${cy - hexR * 0.5} L ${cx + xh} ${cy + hexR * 0.5} ` +
    `L ${cx} ${cy + hexR} L ${cx - xh} ${cy + hexR * 0.5} L ${cx - xh} ${cy - hexR * 0.5} Z`
  )
}

/** SVG path string for a single flat-top hex centered at (cx, cy). */
export function hexFlatPath(cx: number, cy: number, hexR: number): string {
  const yh = SQRT3 * hexR * 0.5
  return (
    `M ${cx + hexR} ${cy} L ${cx + hexR * 0.5} ${cy + yh} L ${cx - hexR * 0.5} ${cy + yh} ` +
    `L ${cx - hexR} ${cy} L ${cx - hexR * 0.5} ${cy - yh} L ${cx + hexR * 0.5} ${cy - yh} Z`
  )
}

// ── Coordinate conversions ────────────────────────────────────────────────────

/**
 * Convert a pixel position to fractional axial (q, r) coordinates.
 * The grid origin is at pixel (offsetX, offsetY).
 */
export function pixelToAxial(
  px: number,
  py: number,
  hexR: number,
  offsetX: number,
  offsetY: number,
  orientation: 'hex-pointy' | 'hex-flat',
): { q: number; r: number } {
  const x = px - offsetX
  const y = py - offsetY
  if (orientation === 'hex-pointy') {
    return {
      q: ((SQRT3 / 3) * x - (1 / 3) * y) / hexR,
      r: ((2 / 3) * y) / hexR,
    }
  } else {
    return {
      q: ((2 / 3) * x) / hexR,
      r: (-(1 / 3) * x + (SQRT3 / 3) * y) / hexR,
    }
  }
}

/**
 * Round fractional axial (q, r) to the nearest hex using cube-coordinate rounding.
 * Returns integer axial coordinates.
 */
export function axialRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) {
    rq = -rr - rs
  } else if (dr > ds) {
    rr = -rq - rs
  } else {
    rs = -rq - rr
    void rs // s is implicit; keep linter happy
  }
  return { q: rq, r: rr }
}

/**
 * Convert integer axial (q, r) to the pixel center of that hex.
 * Returns pixel coords relative to the grid origin (before adding offsetX/offsetY).
 */
export function axialToPixel(
  q: number,
  r: number,
  hexR: number,
  orientation: 'hex-pointy' | 'hex-flat',
): { cx: number; cy: number } {
  if (orientation === 'hex-pointy') {
    return {
      cx: hexR * (SQRT3 * q + (SQRT3 / 2) * r),
      cy: hexR * ((3 / 2) * r),
    }
  } else {
    return {
      cx: hexR * ((3 / 2) * q),
      cy: hexR * ((SQRT3 / 2) * q + SQRT3 * r),
    }
  }
}

/**
 * Given an arbitrary pixel position, return the pixel center of the nearest hex cell.
 * The returned center is in the same coordinate space as the input (absolute pixels).
 */
export function nearestHexCenter(
  px: number,
  py: number,
  hexR: number,
  offsetX: number,
  offsetY: number,
  orientation: 'hex-pointy' | 'hex-flat',
): { cx: number; cy: number } {
  const frac = pixelToAxial(px, py, hexR, offsetX, offsetY, orientation)
  const { q, r } = axialRound(frac.q, frac.r)
  const local = axialToPixel(q, r, hexR, orientation)
  return {
    cx: local.cx + offsetX,
    cy: local.cy + offsetY,
  }
}

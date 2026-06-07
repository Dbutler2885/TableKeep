import { hexFlatSpacing, hexPointySpacing } from './hexGridMath'

export type HexDetectionResult = {
  gridType: 'hex-pointy' | 'hex-flat'
  gridCellScale: number
  gridOffsetX: number
  gridOffsetY: number
  confidence: number
}

export type HexDetectionDebugInfo = {
  image: { width: number; height: number }
  edge: {
    percentile: number
    threshold: number
    edgeCandidates: number
    strongEdges: number
    edgeDensity: number
  }
  orientation: {
    peaks: number[]
    separations: number[]
    sepError: number
    sepScore: number
    flatErr: number
    pointyErr: number
    orientationScore: number
    inferredType: 'hex-pointy' | 'hex-flat' | null
  }
  spacing: {
    estimates: number[]
    baseSpacing: number | null
    candidates: number[]
  }
  fit: {
    bestScore: number
    bestType: 'hex-pointy' | 'hex-flat' | null
    bestCellPx: number | null
    bestOffsetX: number | null
    bestOffsetY: number | null
  }
  confidence: {
    fitScore: number
    sepScore: number
    orientationScore: number
    edgeScore: number
    final: number
  }
  failureReason: string | null
}

export type HexDetectionDebugResult = {
  result: HexDetectionResult | null
  debug: HexDetectionDebugInfo
}

type EdgePoint = {
  x: number
  y: number
  weight: number
}

const MAX_DETECT_DIM = 480
const EDGE_PERCENTILE = 0.84
const ORIENTATION_BINS = 180
const PEAK_MIN_SEPARATION = 18
const CONFIDENCE_APPLY_THRESHOLD = 0.62
const ORIENTATION_LOCK_ERROR_GAP_DEG = 8
const FIT_SAMPLE_TARGET = 1600

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function circularDeltaDeg(a: number, b: number) {
  const d = Math.abs(a - b) % 180
  return d > 90 ? 180 - d : d
}

function smoothHistogram(values: number[]) {
  const out = values.slice()
  const n = values.length
  for (let i = 0; i < n; i += 1) {
    const a = values[(i - 1 + n) % n]
    const b = values[i]
    const c = values[(i + 1) % n]
    out[i] = a * 0.25 + b * 0.5 + c * 0.25
  }
  return out
}

function pickPeaks(hist: number[]) {
  const picked: number[] = []
  const indices = hist
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)

  for (const item of indices) {
    if (picked.length >= 3) break
    const tooClose = picked.some((existing) => circularDeltaDeg(existing, item.index) < PEAK_MIN_SEPARATION)
    if (tooClose) continue
    picked.push(item.index)
  }

  return picked.sort((a, b) => a - b)
}

function orientationTemplateError(peaks: number[], phase: number) {
  const targets = [phase, (phase + 60) % 180, (phase + 120) % 180]
  return peaks.reduce((sum, p) => {
    const best = Math.min(...targets.map((t) => circularDeltaDeg(p, t)))
    return sum + best
  }, 0) / Math.max(1, peaks.length)
}

function estimateSpacingFromProjection(points: EdgePoint[], angleDeg: number) {
  const normalRad = ((angleDeg + 90) * Math.PI) / 180
  const nx = Math.cos(normalRad)
  const ny = Math.sin(normalRad)

  let minProj = Infinity
  let maxProj = -Infinity
  for (const p of points) {
    const proj = p.x * nx + p.y * ny
    if (proj < minProj) minProj = proj
    if (proj > maxProj) maxProj = proj
  }
  if (!Number.isFinite(minProj) || !Number.isFinite(maxProj)) return null

  const size = Math.max(1, Math.ceil(maxProj - minProj + 1))
  if (size < 24) return null
  const hist = new Float32Array(size)
  for (const p of points) {
    const proj = p.x * nx + p.y * ny
    const bin = Math.round(proj - minProj)
    if (bin >= 0 && bin < size) hist[bin] += p.weight
  }

  const minLag = 6
  const maxLag = Math.min(220, Math.floor(size / 2))
  let bestLag = 0
  let bestScore = 0
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0
    let count = 0
    for (let i = 0; i + lag < size; i += 1) {
      sum += hist[i] * hist[i + lag]
      count += 1
    }
    if (!count) continue
    const score = sum / count
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  return bestLag > 0 ? bestLag : null
}

function buildDilatedEdgeMap(width: number, height: number, edges: Uint8Array) {
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x
      if (!edges[idx]) continue
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const xx = x + ox
          const yy = y + oy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          out[yy * width + xx] = 1
        }
      }
    }
  }
  return out
}

function drawHexMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridType: 'hex-pointy' | 'hex-flat',
  cellPx: number,
  offsetX: number,
  offsetY: number,
  lineWidth = 1,
) {
  const r = cellPx / 2
  if (r <= 0) return

  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = lineWidth
  ctx.beginPath()

  if (gridType === 'hex-pointy') {
    const { hexWidth, hexHeight, xStep, yStep, rowOffsetX } = hexPointySpacing(r)
    const rowMin = Math.floor((-offsetY - hexHeight) / yStep) - 2
    const rowMax = Math.ceil((height - offsetY + hexHeight) / yStep) + 2

    for (let row = rowMin; row <= rowMax; row += 1) {
      const cy = offsetY + row * yStep
      const xShift = (Math.abs(row) % 2) * rowOffsetX
      const colMin = Math.floor((-offsetX - xShift - hexWidth) / xStep) - 2
      const colMax = Math.ceil((width - offsetX - xShift + hexWidth) / xStep) + 2

      for (let col = colMin; col <= colMax; col += 1) {
        const cx = offsetX + xShift + col * xStep
        if (cx < -hexWidth || cx > width + hexWidth || cy < -hexHeight || cy > height + hexHeight) continue

        const xh = Math.sqrt(3) * r * 0.5
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + xh, cy - r * 0.5)
        ctx.lineTo(cx + xh, cy + r * 0.5)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - xh, cy + r * 0.5)
        ctx.lineTo(cx - xh, cy - r * 0.5)
        ctx.closePath()
      }
    }
  } else {
    const { hexWidth, hexHeight, xStep, yStep, colOffsetY } = hexFlatSpacing(r)
    const colMin = Math.floor((-offsetX - hexWidth) / xStep) - 2
    const colMax = Math.ceil((width - offsetX + hexWidth) / xStep) + 2

    for (let col = colMin; col <= colMax; col += 1) {
      const cx = offsetX + col * xStep
      const yShift = (Math.abs(col) % 2) * colOffsetY
      const rowMin = Math.floor((-offsetY - yShift - hexHeight) / yStep) - 2
      const rowMax = Math.ceil((height - offsetY - yShift + hexHeight) / yStep) + 2

      for (let row = rowMin; row <= rowMax; row += 1) {
        const cy = offsetY + yShift + row * yStep
        if (cx < -hexWidth || cx > width + hexWidth || cy < -hexHeight || cy > height + hexHeight) continue

        const yh = Math.sqrt(3) * r * 0.5
        ctx.moveTo(cx + r, cy)
        ctx.lineTo(cx + r * 0.5, cy + yh)
        ctx.lineTo(cx - r * 0.5, cy + yh)
        ctx.lineTo(cx - r, cy)
        ctx.lineTo(cx - r * 0.5, cy - yh)
        ctx.lineTo(cx + r * 0.5, cy - yh)
        ctx.closePath()
      }
    }
  }

  ctx.stroke()
}

function scoreHexFit(
  maskCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  edgeDilated: Uint8Array,
  gridType: 'hex-pointy' | 'hex-flat',
  cellPx: number,
  offsetX: number,
  offsetY: number,
  lineWidth = 1,
) {
  drawHexMask(maskCtx, width, height, gridType, cellPx, offsetX, offsetY, lineWidth)
  const image = maskCtx.getImageData(0, 0, width, height).data

  let hits = 0
  let samples = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = y * width + x
      const alpha = image[i * 4 + 3]
      if (alpha < 10) continue
      samples += 1
      if (edgeDilated[i]) hits += 1
    }
  }

  if (samples < 200) return { ratio: 0, adjusted: 0, samples }
  const ratio = hits / samples
  // Penalize sparse-line fits (often large-cell false positives).
  const sampleFactor = clamp01(samples / FIT_SAMPLE_TARGET)
  return {
    ratio,
    adjusted: ratio * sampleFactor,
    samples,
  }
}

function refineHexFit(
  maskCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  edgeDilated: Uint8Array,
  seed: {
    score: number
    rawScore: number
    samples: number
    gridType: 'hex-pointy' | 'hex-flat'
    cellPx: number
    offsetX: number
    offsetY: number
  },
) {
  let best = { ...seed }
  const cellMultipliers = [0.9, 0.94, 0.97, 1, 1.03, 1.06, 1.1]
  const lineWidths = [1, 2, 3]

  for (const cellFactor of cellMultipliers) {
    const cellPx = best.cellPx * cellFactor
    if (cellPx < 10 || cellPx > Math.min(width, height) * 0.8) continue
    const r = cellPx / 2
    const spacingData = best.gridType === 'hex-pointy' ? hexPointySpacing(r) : hexFlatSpacing(r)
    const periodX = Math.max(8, spacingData.xStep)
    const periodY = Math.max(8, spacingData.yStep)
    const dxStep = periodX / 36
    const dyStep = periodY / 36

    for (let ox = -6; ox <= 6; ox += 1) {
      for (let oy = -6; oy <= 6; oy += 1) {
        const offsetX = best.offsetX + ox * dxStep
        const offsetY = best.offsetY + oy * dyStep
        for (const lineWidth of lineWidths) {
          const scored = scoreHexFit(
            maskCtx,
            width,
            height,
            edgeDilated,
            best.gridType,
            cellPx,
            offsetX,
            offsetY,
            lineWidth,
          )
          if (scored.adjusted > best.score) {
            best = {
              score: scored.adjusted,
              rawScore: scored.ratio,
              samples: scored.samples,
              gridType: best.gridType,
              cellPx,
              offsetX,
              offsetY,
            }
          }
        }
      }
    }
  }

  return best
}

async function loadImageData(imageUrl: string) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Unable to load map image for hex detection. Check Firebase Storage CORS.'))
    img.src = imageUrl
  })

  const scale = Math.min(1, MAX_DETECT_DIM / Math.max(img.naturalWidth, img.naturalHeight, 1))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Unable to create detection canvas')

  ctx.drawImage(img, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data

  return { width, height, rgba }
}

export async function detectHexGridFromImageWithDebug(imageUrl: string): Promise<HexDetectionDebugResult> {
  const { width, height, rgba } = await loadImageData(imageUrl)
  const size = width * height

  const debug: HexDetectionDebugInfo = {
    image: { width, height },
    edge: {
      percentile: EDGE_PERCENTILE,
      threshold: 0,
      edgeCandidates: 0,
      strongEdges: 0,
      edgeDensity: 0,
    },
    orientation: {
      peaks: [],
      separations: [],
      sepError: 999,
      sepScore: 0,
      flatErr: 999,
      pointyErr: 999,
      orientationScore: 0,
      inferredType: null,
    },
    spacing: {
      estimates: [],
      baseSpacing: null,
      candidates: [],
    },
    fit: {
      bestScore: 0,
      bestType: null,
      bestCellPx: null,
      bestOffsetX: null,
      bestOffsetY: null,
    },
    confidence: {
      fitScore: 0,
      sepScore: 0,
      orientationScore: 0,
      edgeScore: 0,
      final: 0,
    },
    failureReason: null,
  }

  if (size < 2000) {
    debug.failureReason = 'image-too-small'
    return { result: null, debug }
  }

  const gray = new Float32Array(size)
  for (let i = 0; i < size; i += 1) {
    const r = rgba[i * 4]
    const g = rgba[i * 4 + 1]
    const b = rgba[i * 4 + 2]
    gray[i] = r * 0.299 + g * 0.587 + b * 0.114
  }

  const magnitudes: number[] = []
  const edgeCandidates: Array<{ x: number; y: number; mag: number; angle: number }> = []

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const g00 = gray[(y - 1) * width + (x - 1)]
      const g01 = gray[(y - 1) * width + x]
      const g02 = gray[(y - 1) * width + (x + 1)]
      const g10 = gray[y * width + (x - 1)]
      const g12 = gray[y * width + (x + 1)]
      const g20 = gray[(y + 1) * width + (x - 1)]
      const g21 = gray[(y + 1) * width + x]
      const g22 = gray[(y + 1) * width + (x + 1)]

      const gx = -g00 + g02 - 2 * g10 + 2 * g12 - g20 + g22
      const gy = g00 + 2 * g01 + g02 - g20 - 2 * g21 - g22
      const mag = Math.hypot(gx, gy)
      if (mag < 1) continue
      magnitudes.push(mag)

      let angle = (Math.atan2(gy, gx) * 180) / Math.PI
      if (angle < 0) angle += 180
      edgeCandidates.push({ x, y, mag, angle })
    }
  }

  debug.edge.edgeCandidates = edgeCandidates.length
  if (edgeCandidates.length < 300) {
    debug.failureReason = 'not-enough-edge-candidates'
    return { result: null, debug }
  }

  magnitudes.sort((a, b) => a - b)
  const threshold = magnitudes[Math.floor(magnitudes.length * EDGE_PERCENTILE)] ?? 0
  debug.edge.threshold = threshold

  const orientationHist = new Array(ORIENTATION_BINS).fill(0)
  const edgePoints: EdgePoint[] = []
  const edgeMap = new Uint8Array(size)

  for (const p of edgeCandidates) {
    if (p.mag < threshold) continue
    const lineAngle = (p.angle + 90) % 180
    const angleBin = Math.round(lineAngle) % ORIENTATION_BINS
    orientationHist[angleBin] += p.mag
    edgePoints.push({ x: p.x, y: p.y, weight: p.mag })
    edgeMap[p.y * width + p.x] = 1
  }

  debug.edge.strongEdges = edgePoints.length
  debug.edge.edgeDensity = edgePoints.length / size
  if (edgePoints.length < 250) {
    debug.failureReason = 'not-enough-strong-edges'
    return { result: null, debug }
  }

  const smoothed = smoothHistogram(smoothHistogram(orientationHist))
  const peaks = pickPeaks(smoothed)
  debug.orientation.peaks = peaks
  if (peaks.length < 3) {
    debug.failureReason = 'not-enough-orientation-peaks'
    return { result: null, debug }
  }

  const separations = [
    (peaks[1] - peaks[0] + 180) % 180,
    (peaks[2] - peaks[1] + 180) % 180,
    (peaks[0] + 180 - peaks[2]) % 180,
  ]
  const sepError = separations.reduce((sum, value) => sum + Math.abs(value - 60), 0) / 3
  const sepScore = clamp01(1 - sepError / 30)

  const flatErr = orientationTemplateError(peaks, 0)
  const pointyErr = orientationTemplateError(peaks, 30)
  const inferredType: 'hex-pointy' | 'hex-flat' = pointyErr < flatErr ? 'hex-pointy' : 'hex-flat'
  const orientationScore = clamp01(1 - Math.min(flatErr, pointyErr) / 25)

  debug.orientation.separations = separations
  debug.orientation.sepError = sepError
  debug.orientation.sepScore = sepScore
  debug.orientation.flatErr = flatErr
  debug.orientation.pointyErr = pointyErr
  debug.orientation.orientationScore = orientationScore
  debug.orientation.inferredType = inferredType

  const spacingEstimates = peaks
    .map((angle) => estimateSpacingFromProjection(edgePoints, angle))
    .filter((value): value is number => typeof value === 'number' && value > 2)
  debug.spacing.estimates = spacingEstimates

  if (spacingEstimates.length === 0) {
    debug.failureReason = 'no-spacing-estimate'
    return { result: null, debug }
  }

  spacingEstimates.sort((a, b) => a - b)
  const spacingMedian = spacingEstimates[Math.floor(spacingEstimates.length / 2)]
  debug.spacing.baseSpacing = spacingMedian

  // Projection spacing can land on harmonics (e.g. half/third of real step).
  // Search from multiple anchors: each estimate + median.
  const spacingAnchors = Array.from(
    new Set(
      [...spacingEstimates, spacingMedian]
        .map((v) => Math.round(v * 1000) / 1000)
        .filter((v) => v >= 8 && v <= Math.min(width, height) * 0.9),
    ),
  ).sort((a, b) => a - b)

  const candidates = spacingAnchors
    .flatMap((anchor) => [0.66, 0.75, 0.8660254, 1.0, 1.1547005, 1.3333333, 1.5, 1.7320508, 2.0, 2.3094011]
      .map((factor) => anchor * factor))
    .map((value) => Math.round(value * 1000) / 1000)
    .filter((value, index, arr) => value > 12 && value < Math.min(width, height) * 0.7 && arr.indexOf(value) === index)
    .sort((a, b) => a - b)
  debug.spacing.candidates = candidates

  if (candidates.length === 0) {
    debug.failureReason = 'no-cell-candidates'
    return { result: null, debug }
  }

  const edgeDilated = buildDilatedEdgeMap(width, height, edgeMap)
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskCtx) {
    debug.failureReason = 'mask-canvas-unavailable'
    return { result: null, debug }
  }

  let best:
    | {
        score: number
        rawScore: number
        samples: number
        gridType: 'hex-pointy' | 'hex-flat'
        cellPx: number
        offsetX: number
        offsetY: number
      }
    | null = null

  const orientationGap = Math.abs(flatErr - pointyErr)
  const orientations: Array<'hex-pointy' | 'hex-flat'> =
    orientationGap >= ORIENTATION_LOCK_ERROR_GAP_DEG
      ? [inferredType]
      : [inferredType, inferredType === 'hex-pointy' ? 'hex-flat' : 'hex-pointy']

  for (const orientation of orientations) {
    for (const cellPx of candidates) {
      const r = cellPx / 2
      const spacingData = orientation === 'hex-pointy' ? hexPointySpacing(r) : hexFlatSpacing(r)
      const periodX = Math.max(8, spacingData.xStep)
      const periodY = Math.max(8, spacingData.yStep)

      for (let oxStep = 0; oxStep < 6; oxStep += 1) {
        for (let oyStep = 0; oyStep < 6; oyStep += 1) {
          const offsetX = (oxStep / 6) * periodX
          const offsetY = (oyStep / 6) * periodY
          const scored = scoreHexFit(maskCtx, width, height, edgeDilated, orientation, cellPx, offsetX, offsetY, 1)
          if (!best || scored.adjusted > best.score) {
            best = {
              score: scored.adjusted,
              rawScore: scored.ratio,
              samples: scored.samples,
              gridType: orientation,
              cellPx,
              offsetX,
              offsetY,
            }
          }
        }
      }
    }
  }

  if (!best) {
    debug.failureReason = 'no-fit-result'
    return { result: null, debug }
  }

  best = refineHexFit(maskCtx, width, height, edgeDilated, best)

  debug.fit.bestScore = best.rawScore
  debug.fit.bestType = best.gridType
  debug.fit.bestCellPx = best.cellPx
  debug.fit.bestOffsetX = best.offsetX
  debug.fit.bestOffsetY = best.offsetY

  const edgeScore = clamp01(debug.edge.edgeDensity * 12)
  const confidence = clamp01(best.score * 0.6 + sepScore * 0.2 + orientationScore * 0.1 + edgeScore * 0.1)

  debug.confidence.fitScore = best.score
  debug.confidence.sepScore = sepScore
  debug.confidence.orientationScore = orientationScore
  debug.confidence.edgeScore = edgeScore
  debug.confidence.final = confidence
  debug.failureReason = null

  const mapDimension = Math.max(1, Math.min(width, height))
  return {
    result: {
      gridType: best.gridType,
      gridCellScale: best.cellPx / mapDimension,
      gridOffsetX: best.offsetX / width,
      gridOffsetY: best.offsetY / height,
      confidence,
    },
    debug,
  }
}

export async function detectHexGridFromImage(imageUrl: string): Promise<HexDetectionResult | null> {
  const { result } = await detectHexGridFromImageWithDebug(imageUrl)
  return result
}

export function shouldAutoApplyHex(confidence: number) {
  return confidence >= CONFIDENCE_APPLY_THRESHOLD
}

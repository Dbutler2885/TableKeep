export type BlockerKind = 'none' | 'surface' | 'full'

export const blockerKindAt = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): BlockerKind => {
  if (x < 0 || y < 0 || x >= width || y >= height) return 'none'
  const index = (y * width + x) * 4
  const r = data[index] ?? 0
  const g = data[index + 1] ?? 0
  const b = data[index + 2] ?? 0
  const a = data[index + 3] ?? 0
  if (a <= 20) return 'none'
  if (b >= r + 20 && b >= g + 10) return 'full'
  return 'surface'
}

export const isSurfaceBlocker = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) => blockerKindAt(data, width, height, x, y) === 'surface'

export const floodFillSurfaceRegion = ({
  data,
  width,
  height,
  seeds,
  onFilled,
  isSurface = (x, y) => isSurfaceBlocker(data, width, height, x, y),
}: {
  data: Uint8ClampedArray
  width: number
  height: number
  seeds: ReadonlyArray<{ x: number; y: number }>
  onFilled?: (x: number, y: number) => void
  isSurface?: (x: number, y: number) => boolean
}) => {
  const filled = new Uint8Array(Math.max(0, width * height))
  const visited = new Uint8Array(Math.max(0, width * height))
  const queue: number[] = []
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const flat = y * width + x
    if (visited[flat]) return
    // Mark before classification so every boundary pixel is tested at most once.
    visited[flat] = 1
    if (!isSurface(x, y)) return
    queue.push(flat)
  }

  for (const seed of seeds) enqueue(seed.x, seed.y)

  for (let head = 0; head < queue.length; head += 1) {
    const flat = queue[head]
    const x = flat % width
    const y = Math.floor(flat / width)
    filled[flat] = 1
    onFilled?.(x, y)

    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
    enqueue(x - 1, y - 1)
    enqueue(x + 1, y - 1)
    enqueue(x - 1, y + 1)
    enqueue(x + 1, y + 1)
  }

  return filled
}

// Procedurally generated, seamless tile textures for filling map regions
// (trees/foliage, grass, dirt, road, water, stone). Generated on a canvas so the
// app ships no binary assets and works offline. Each tile is deterministic
// (seeded) so the cached image is stable across renders and reloads.

export type MapTextureId = 'trees' | 'grass' | 'dirt' | 'road' | 'water' | 'stone'

export type MapTextureDef = {
  id: MapTextureId
  label: string
  swatch: string
}

export const MAP_TEXTURES: MapTextureDef[] = [
  { id: 'trees', label: 'Trees', swatch: '#3f6b3a' },
  { id: 'grass', label: 'Grass', swatch: '#6f9d57' },
  { id: 'dirt', label: 'Dirt', swatch: '#8a6a45' },
  { id: 'road', label: 'Road', swatch: '#9a9a93' },
  { id: 'water', label: 'Water', swatch: '#5b86b0' },
  { id: 'stone', label: 'Stone', swatch: '#9a958c' },
]

const TILE = 128

// Small deterministic PRNG (mulberry32) so each texture tile is identical every
// time it is generated.
function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Draw a primitive at (x, y) and at every wrapped offset so the tile edges line
// up seamlessly when the pattern repeats.
function wrapped(size: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      fn(x + ox * size, y + oy * size)
    }
  }
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rng: () => number, colors: string[], count: number, rMin: number, rMax: number) {
  for (let i = 0; i < count; i += 1) {
    const x = rng() * size
    const y = rng() * size
    const r = rMin + rng() * (rMax - rMin)
    const color = colors[Math.floor(rng() * colors.length)]
    wrapped(size, x, y, (wx, wy) => blob(ctx, wx, wy, r, color))
  }
}

const TILE_DRAWERS: Record<MapTextureId, (ctx: CanvasRenderingContext2D, size: number) => void> = {
  trees: (ctx, size) => {
    const rng = makeRng(101)
    ctx.fillStyle = '#39612f'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, rng, ['#2f5326', '#3f6b34'], 26, 12, 22)
    speckle(ctx, size, rng, ['#4d7d40', '#5a8a4c'], 34, 7, 15)
    speckle(ctx, size, rng, ['#669a55', '#7aac66'], 30, 3, 7)
  },
  grass: (ctx, size) => {
    const rng = makeRng(202)
    ctx.fillStyle = '#6f9d57'
    ctx.fillRect(0, 0, size, size)
    ctx.lineWidth = 2
    for (let i = 0; i < 120; i += 1) {
      const x = rng() * size
      const y = rng() * size
      const h = 4 + rng() * 7
      const color = rng() > 0.5 ? '#5e8c48' : '#83b06a'
      wrapped(size, x, y, (wx, wy) => {
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(wx, wy)
        ctx.lineTo(wx + (rng() - 0.5) * 4, wy - h)
        ctx.stroke()
      })
    }
  },
  dirt: (ctx, size) => {
    const rng = makeRng(303)
    ctx.fillStyle = '#8a6a45'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, rng, ['#74552f', '#9c7a52', '#6f5235'], 90, 2, 5)
    speckle(ctx, size, rng, ['#a98a5f'], 30, 1, 3)
  },
  road: (ctx, size) => {
    const rng = makeRng(404)
    ctx.fillStyle = '#9a9a93'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, rng, ['#8a8a83', '#b0b0a8', '#7e7e77'], 80, 2, 5)
    ctx.strokeStyle = '#6f6f68'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 5; i += 1) {
      const x = rng() * size
      const y = rng() * size
      wrapped(size, x, y, (wx, wy) => {
        ctx.beginPath()
        ctx.moveTo(wx, wy)
        ctx.lineTo(wx + (rng() - 0.5) * 30, wy + (rng() - 0.5) * 30)
        ctx.stroke()
      })
    }
  },
  water: (ctx, size) => {
    const rng = makeRng(505)
    ctx.fillStyle = '#5b86b0'
    ctx.fillRect(0, 0, size, size)
    ctx.lineWidth = 2
    for (let i = 0; i < 22; i += 1) {
      const y = rng() * size
      const color = rng() > 0.5 ? '#6f9ac4' : '#4d7299'
      ctx.strokeStyle = color
      for (let oy = -1; oy <= 1; oy += 1) {
        ctx.beginPath()
        for (let x = 0; x <= size; x += 8) {
          const yy = y + oy * size + Math.sin((x / size) * Math.PI * 4 + i) * 3
          if (x === 0) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }
    }
  },
  stone: (ctx, size) => {
    const rng = makeRng(606)
    ctx.fillStyle = '#9a958c'
    ctx.fillRect(0, 0, size, size)
    speckle(ctx, size, rng, ['#878177', '#aaa49a', '#7c766c'], 70, 2, 6)
    ctx.strokeStyle = '#6f6a61'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 7; i += 1) {
      const x = rng() * size
      const y = rng() * size
      wrapped(size, x, y, (wx, wy) => {
        ctx.beginPath()
        ctx.moveTo(wx, wy)
        ctx.lineTo(wx + (rng() - 0.5) * 40, wy + (rng() - 0.5) * 40)
        ctx.stroke()
      })
    }
  },
}

const tileCache = new Map<MapTextureId, HTMLCanvasElement>()
const imageCache = new Map<MapTextureId, HTMLImageElement>()

export function getTextureTile(id: MapTextureId): HTMLCanvasElement {
  const cached = tileCache.get(id)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const ctx = canvas.getContext('2d')
  if (ctx) TILE_DRAWERS[id](ctx, TILE)
  tileCache.set(id, canvas)
  return canvas
}

// Load all texture tiles as HTMLImageElements (Konva's fillPatternImage is most
// reliable with a loaded Image). Resolves once every tile is ready.
export function loadTextureImages(): Promise<Map<MapTextureId, HTMLImageElement>> {
  return Promise.all(
    MAP_TEXTURES.map(({ id }) => {
      const cached = imageCache.get(id)
      if (cached) return Promise.resolve(cached)
      return new Promise<HTMLImageElement>((resolve) => {
        const image = new Image()
        image.onload = () => {
          imageCache.set(id, image)
          resolve(image)
        }
        image.src = getTextureTile(id).toDataURL('image/png')
      })
    }),
  ).then(() => imageCache)
}

export function isMapTextureId(value: unknown): value is MapTextureId {
  return typeof value === 'string' && MAP_TEXTURES.some((texture) => texture.id === value)
}

import { describe, expect, it } from 'vitest'
import { constrainMediaView, fitMediaScale, gestureMediaView, initialMediaView, MAX_MEDIA_ZOOM, mediaWheelFactor, MIN_MEDIA_ZOOM, pdfRasterScale, zoomMediaAt } from './handoutViewport'

const content = { width: 2000, height: 1600 }
const viewport = { width: 800, height: 600 }
describe('fitted handout previews and full-size navigation', () => {
  it('fits both dimensions, including portrait pages and landscape images', () => {
    expect(fitMediaScale({ width: 600, height: 800 }, viewport)).toBeCloseTo(0.72)
    expect(fitMediaScale({ width: 2000, height: 1000 }, viewport)).toBeCloseTo(0.388)
    expect(fitMediaScale({ width: 0, height: 0 }, viewport)).toBe(0)
    expect(fitMediaScale(content, { width: 0, height: 0 })).toBe(0)
  })
  it('centers media that fits and prevents panning beyond the edges of larger media', () => {
    expect(constrainMediaView({ scale: 1, x: 5000, y: -5000 }, content, viewport)).toEqual({ scale: 1, x: 600, y: -500 })
    expect(constrainMediaView({ scale: 0.1, x: 50, y: 50 }, content, viewport)).toEqual({ scale: 0.1, x: 0, y: 0 })
    expect(constrainMediaView({ scale: 100, x: 0, y: 0 }, content, viewport).scale).toBe(MAX_MEDIA_ZOOM)
    expect(constrainMediaView({ scale: 0.001, x: 0, y: 0 }, content, viewport).scale).toBe(MIN_MEDIA_ZOOM)
  })
  it('keeps the point under the cursor fixed when zooming', () => {
    const zoomed = zoomMediaAt(initialMediaView(), 2, { x: 100, y: 50 }, content, viewport)
    expect(zoomed).toEqual({ scale: 2, x: -100, y: -50 })
    expect(zoomMediaAt(zoomed, 1, { x: 100, y: 50 }, content, viewport)).toEqual(initialMediaView())
  })
  it('pans with one pointer and pinches around the moving midpoint with two', () => {
    const start = initialMediaView()
    expect(gestureMediaView(start, [{ x: 0, y: 0 }], [{ x: 100, y: 50 }], content, viewport)).toEqual({ scale: 1, x: 100, y: 50 })
    expect(gestureMediaView(start, [{ x: -100, y: 0 }, { x: 100, y: 0 }], [{ x: -150, y: 0 }, { x: 250, y: 0 }], content, viewport)).toEqual({ scale: 2, x: 50, y: 0 })
    expect(gestureMediaView(start, [], [], content, viewport)).toEqual(start)
    expect(gestureMediaView(start, [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: -5, y: 0 }, { x: 5, y: 0 }], content, viewport).scale).toBe(MAX_MEDIA_ZOOM)
  })
  it('normalizes mouse-wheel, line-wheel, page-wheel and trackpad pinch input', () => {
    expect(mediaWheelFactor(-100, 0, false, 600)).toBeGreaterThan(1)
    expect(mediaWheelFactor(100, 0, false, 600)).toBeLessThan(1)
    expect(mediaWheelFactor(-1, 1, false, 600)).toBe(mediaWheelFactor(-16, 0, false, 600))
    expect(mediaWheelFactor(-1, 2, false, 600)).toBe(mediaWheelFactor(-600, 0, false, 600))
    expect(mediaWheelFactor(-10, 0, true, 600)).toBeGreaterThan(mediaWheelFactor(-10, 0, false, 600))
  })
  it('bounds PDF raster memory even on high-DPI screens at maximum zoom', () => {
    const page = { width: 1200, height: 1600 }
    const scale = pdfRasterScale(page, 8, 2)
    expect(page.width * page.height * scale * scale * 4).toBeLessThanOrEqual(8_000_001)
    expect(pdfRasterScale(page, 0.5, 1)).toBe(0.5)
  })
})

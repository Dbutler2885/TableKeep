export type RectLike = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

export type CanvasMetrics = {
  rect: RectLike
  width: number
  height: number
}

export type ClientPoint = { clientX: number; clientY: number }

const clampUnit = (value: number) => Math.max(0, Math.min(1, value))

export const clientPointToNormalizedPoint = (
  point: ClientPoint,
  canvas: CanvasMetrics | null,
  layerRect: RectLike | null,
) => {
  if (
    canvas &&
    canvas.rect.width > 0 &&
    canvas.rect.height > 0 &&
    canvas.width > 0 &&
    canvas.height > 0
  ) {
    const scaleX = canvas.width / canvas.rect.width
    const scaleY = canvas.height / canvas.rect.height
    const canvasX = (point.clientX - canvas.rect.left) * scaleX
    const canvasY = (point.clientY - canvas.rect.top) * scaleY
    return {
      x: clampUnit(canvasX / canvas.width),
      y: clampUnit(canvasY / canvas.height),
    }
  }

  if (!layerRect || layerRect.width <= 0 || layerRect.height <= 0) return null
  return {
    x: clampUnit((point.clientX - layerRect.left) / layerRect.width),
    y: clampUnit((point.clientY - layerRect.top) / layerRect.height),
  }
}

export const tokenPointToCanvasPoint = ({
  point,
  tokenSizePx = 0,
  canvasWidth,
  canvasHeight,
  activeMapDimension,
}: {
  point: { x: number; y: number }
  tokenSizePx?: number
  canvasWidth: number
  canvasHeight: number
  activeMapDimension: number
}) => {
  const fogScale = canvasHeight / Math.max(1, activeMapDimension)
  const yOffset = Math.max(0, tokenSizePx * fogScale * 0.5)
  return {
    x: point.x * canvasWidth,
    y: Math.max(0, point.y * canvasHeight - yOffset),
  }
}

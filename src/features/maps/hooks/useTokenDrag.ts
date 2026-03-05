import { useEffect, useRef, useState } from 'react'
import type { MouseEventHandler, TouchEventHandler } from 'react'
import { deleteField, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { Role } from '../../../types/app'
import {
  DRAG_PATH_SAMPLE_DISTANCE,
  STREAMING_LOCAL_REVEAL_INTERVAL_MS,
  STREAMING_LOCAL_REVEAL_MAX_INTERVAL_MS,
} from '../lib/constants'
import type { CanvasClipRect, MapRecord, TokenRecord, Waypoint } from '../lib/types'

type UseTokenDragOptions = {
  campaignId: string
  role: Role | null
  selectedMap: MapRecord | null
  tokens: TokenRecord[]
  selectedTokenIds: string[]
  getTokenDropPoint: (clientX: number, clientY: number) => { x: number; y: number } | null
  renderTokenDimensions: (token: TokenRecord) => { width: number; height: number; baseSize: number }
  tokenPointToCanvasPoint: (point: { x: number; y: number }, tokenSizePx?: number) => { x: number; y: number } | null
  activeFogCanvasRef: React.RefObject<HTMLCanvasElement | null>
  activeVisionCanvasRef: React.RefObject<HTMLCanvasElement | null>
  streamingMode: boolean
  usingFullScreenCanvas: boolean
  renderTokenViewDistance: (token: TokenRecord) => number
  revealFromTokenPoint: (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    center: { x: number; y: number },
    brushSize: number,
    clipRect?: CanvasClipRect | null,
  ) => void
  revealFromTokenStroke: (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    from: { x: number; y: number },
    to: { x: number; y: number },
    brushSize: number,
    clipRect?: CanvasClipRect | null,
  ) => void
  getFullscreenVisibleCanvasRect: (canvas: HTMLCanvasElement) => CanvasClipRect | null
  activeMapWidth: number
  activeMapHeight: number
  activeGridCellPx: number
  onMovementFeet: (movedFeet: number) => void
  setTokens: React.Dispatch<React.SetStateAction<TokenRecord[]>>
  persistFog: () => Promise<void>
  recentlyDroppedRef: React.MutableRefObject<Set<string>>
  lastAnimatedPathIdRef: React.MutableRefObject<Record<string, string>>
  setSelectedTokenIds: React.Dispatch<React.SetStateAction<string[]>>
}

export function useTokenDrag({
  campaignId,
  role,
  selectedMap,
  tokens,
  selectedTokenIds,
  getTokenDropPoint,
  renderTokenDimensions,
  tokenPointToCanvasPoint,
  activeFogCanvasRef,
  activeVisionCanvasRef,
  streamingMode,
  usingFullScreenCanvas,
  renderTokenViewDistance,
  revealFromTokenPoint,
  revealFromTokenStroke,
  getFullscreenVisibleCanvasRect,
  activeMapWidth,
  activeMapHeight,
  activeGridCellPx,
  onMovementFeet,
  setTokens,
  persistFog,
  recentlyDroppedRef,
  lastAnimatedPathIdRef,
  setSelectedTokenIds,
}: UseTokenDragOptions) {
  const [draggingTokenId, setDraggingTokenId] = useState('')
  const [draggingTokenIds, setDraggingTokenIds] = useState<string[]>([])
  const [, setDragTokenPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragTokenPositions, setDragTokenPositions] = useState<Record<string, { x: number; y: number }> | null>(null)

  const tokenDragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const dragTokenPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dragTokenStartPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const dragTokenPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const tokenFogTrailPointRef = useRef<{ x: number; y: number } | null>(null)
  const tokenLongPressTimerRef = useRef<number | null>(null)
  const tokenTouchDraggingRef = useRef(false)

  useEffect(
    () => () => {
      if (tokenLongPressTimerRef.current) {
        window.clearTimeout(tokenLongPressTimerRef.current)
        tokenLongPressTimerRef.current = null
      }
    },
    [],
  )

  const startTokenDragAtPoint = (tokenId: string, clientX: number, clientY: number) => {
    if (role !== 'gm') return
    const point = getTokenDropPoint(clientX, clientY)
    const token = tokens.find((entry) => entry.id === tokenId)
    if (!point || !token) return
    const groupIds =
      selectedTokenIds.length > 1 && selectedTokenIds.includes(tokenId)
        ? selectedTokenIds
        : [tokenId]
    const startPositions = Object.fromEntries(
      groupIds
        .map((id) => {
          const entry = tokens.find((item) => item.id === id)
          if (!entry) return null
          return [id, { x: entry.x, y: entry.y }] as const
        })
        .filter((entry): entry is readonly [string, { x: number; y: number }] => entry !== null),
    )
    if (!startPositions[tokenId]) return

    tokenDragOffsetRef.current = {
      x: point.x - token.x,
      y: point.y - token.y,
    }
    const tokenRenderSize = renderTokenDimensions(token).height
    tokenFogTrailPointRef.current = token.party
      ? tokenPointToCanvasPoint({ x: token.x, y: token.y }, tokenRenderSize)
      : null
    setDraggingTokenId(tokenId)
    setDraggingTokenIds(Object.keys(startPositions))
    dragTokenStartPositionsRef.current = startPositions
    dragTokenPositionsRef.current = startPositions
    setDragTokenPositions(startPositions)
    const startPosition = startPositions[tokenId]
    dragTokenPositionRef.current = startPosition
    setDragTokenPosition(startPosition)
  }

  const startTokenDrag = (tokenId: string, event: Parameters<MouseEventHandler<HTMLButtonElement>>[0]) => {
    if (role !== 'gm') return
    if (event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedTokenIds((current) => (current.includes(tokenId) ? current : [tokenId]))
    startTokenDragAtPoint(tokenId, event.clientX, event.clientY)
  }

  const handleTokenTouchStart = (
    tokenId: string,
    event: Parameters<TouchEventHandler<HTMLButtonElement>>[0],
  ) => {
    if (role !== 'gm') return
    if (event.touches.length !== 1) return
    event.stopPropagation()
    setSelectedTokenIds((current) => (current.includes(tokenId) ? current : [tokenId]))

    const touch = event.touches[0]
    if (tokenLongPressTimerRef.current) {
      window.clearTimeout(tokenLongPressTimerRef.current)
      tokenLongPressTimerRef.current = null
    }

    tokenTouchDraggingRef.current = false
    tokenLongPressTimerRef.current = window.setTimeout(() => {
      startTokenDragAtPoint(tokenId, touch.clientX, touch.clientY)
      tokenTouchDraggingRef.current = true
      tokenLongPressTimerRef.current = null
    }, 240)
  }

  const handleTokenTouchEnd: TouchEventHandler<HTMLButtonElement> = () => {
    if (tokenLongPressTimerRef.current) {
      window.clearTimeout(tokenLongPressTimerRef.current)
      tokenLongPressTimerRef.current = null
    }
  }

  useEffect(() => {
    if (!draggingTokenId || role !== 'gm' || !selectedMap) return
    const draggingToken = tokens.find((entry) => entry.id === draggingTokenId) ?? null
    const dragGroupIds = draggingTokenIds.length > 1 ? draggingTokenIds : [draggingTokenId]
    const movementTokenId =
      dragGroupIds.find((id) => {
        const token = tokens.find((entry) => entry.id === id)
        return token?.party === true && token.hidden !== true
      }) ?? ''
    let movementLastPosition =
      movementTokenId && dragTokenStartPositionsRef.current
        ? dragTokenStartPositionsRef.current[movementTokenId] ?? null
        : null
    const dragPaths: Record<string, Waypoint[]> = {}
    const lastSampledPositions: Record<string, { x: number; y: number }> = {}
    const dragStartTime = Date.now()
    let lastStreamingLocalRevealAt = 0
    let revealFrameId: number | null = null
    let pendingRevealPoint: { x: number; y: number } | null = null
    let pendingRevealBrushSize = 0
    let pendingRevealClipRect: CanvasClipRect | null = null

    const flushPendingReveal = () => {
      revealFrameId = null
      if (!draggingToken?.party || draggingToken.hidden || !activeFogCanvasRef.current || !pendingRevealPoint) return

      const nextCanvasPoint = pendingRevealPoint
      const tokenBrushSize = pendingRevealBrushSize
      const clipRect = pendingRevealClipRect
      pendingRevealPoint = null

      if (streamingMode) {
        const now = Date.now()
        const canvasArea = Math.max(1, activeFogCanvasRef.current.width * activeFogCanvasRef.current.height)
        const areaScale = Math.sqrt(canvasArea / (1280 * 720))
        const streamingInterval = Math.min(
          STREAMING_LOCAL_REVEAL_MAX_INTERVAL_MS,
          Math.max(STREAMING_LOCAL_REVEAL_INTERVAL_MS, STREAMING_LOCAL_REVEAL_INTERVAL_MS * areaScale),
        )
        if (now - lastStreamingLocalRevealAt < streamingInterval) {
          return
        }
        lastStreamingLocalRevealAt = now
      }

      const lastPoint = tokenFogTrailPointRef.current
      if (lastPoint) {
        revealFromTokenStroke(
          activeFogCanvasRef.current,
          activeVisionCanvasRef.current,
          lastPoint,
          nextCanvasPoint,
          tokenBrushSize,
          clipRect,
        )
      } else {
        revealFromTokenPoint(
          activeFogCanvasRef.current,
          activeVisionCanvasRef.current,
          nextCanvasPoint,
          tokenBrushSize,
          clipRect,
        )
      }
      tokenFogTrailPointRef.current = nextCanvasPoint
    }

    const queueReveal = (nextCanvasPoint: { x: number; y: number }, tokenBrushSize: number, clipRect: CanvasClipRect | null) => {
      pendingRevealPoint = nextCanvasPoint
      pendingRevealBrushSize = tokenBrushSize
      pendingRevealClipRect = clipRect
      if (revealFrameId !== null) return
      revealFrameId = window.requestAnimationFrame(flushPendingReveal)
    }

    const handleMoveAt = (clientX: number, clientY: number) => {
      const point = getTokenDropPoint(clientX, clientY)
      if (!point) return
      const offset = tokenDragOffsetRef.current ?? { x: 0, y: 0 }
      const nextPosition = {
        x: Math.max(0, Math.min(1, point.x - offset.x)),
        y: Math.max(0, Math.min(1, point.y - offset.y)),
      }
      const startPositions = dragTokenStartPositionsRef.current
      const groupIds = draggingTokenIds.length > 1 ? draggingTokenIds : [draggingTokenId]

      if (startPositions && groupIds.length > 1 && startPositions[draggingTokenId]) {
        const anchorStart = startPositions[draggingTokenId]
        const rawDx = nextPosition.x - anchorStart.x
        const rawDy = nextPosition.y - anchorStart.y
        const maxNegDx = Math.max(...groupIds.map((id) => -startPositions[id].x))
        const maxPosDx = Math.min(...groupIds.map((id) => 1 - startPositions[id].x))
        const maxNegDy = Math.max(...groupIds.map((id) => -startPositions[id].y))
        const maxPosDy = Math.min(...groupIds.map((id) => 1 - startPositions[id].y))
        const clampedDx = Math.max(maxNegDx, Math.min(maxPosDx, rawDx))
        const clampedDy = Math.max(maxNegDy, Math.min(maxPosDy, rawDy))
        const nextPositions = Object.fromEntries(
          groupIds.map((id) => [
            id,
            {
              x: startPositions[id].x + clampedDx,
              y: startPositions[id].y + clampedDy,
            },
          ]),
        )
        dragTokenPositionsRef.current = nextPositions
        setDragTokenPositions(nextPositions)
        dragTokenPositionRef.current = nextPositions[draggingTokenId]
        setDragTokenPosition(nextPositions[draggingTokenId])
      } else {
        const nextPositions = { [draggingTokenId]: nextPosition }
        dragTokenPositionsRef.current = nextPositions
        setDragTokenPositions(nextPositions)
        dragTokenPositionRef.current = nextPosition
        setDragTokenPosition(nextPosition)
      }

      const currentPositions = dragTokenPositionsRef.current
      if (currentPositions) {
        for (const [id, pos] of Object.entries(currentPositions)) {
          const last = lastSampledPositions[id]
          if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) >= DRAG_PATH_SAMPLE_DISTANCE) {
            if (!dragPaths[id]) dragPaths[id] = []
            dragPaths[id].push({ x: pos.x, y: pos.y, t: Date.now() - dragStartTime })
            lastSampledPositions[id] = pos
          }
        }
      }

      if (movementTokenId && selectedMap.gridCalibrated && movementLastPosition && currentPositions?.[movementTokenId]) {
        const movementCurrent = currentPositions[movementTokenId]
        const dxPx = (movementCurrent.x - movementLastPosition.x) * Math.max(1, activeMapWidth)
        const dyPx = (movementCurrent.y - movementLastPosition.y) * Math.max(1, activeMapHeight)
        const movedPx = Math.hypot(dxPx, dyPx)
        const cellPx = Math.max(1, activeGridCellPx)
        const unitsPerCell = Math.max(1, selectedMap.gridUnitsPerCell || 10)
        const movedFeet = (movedPx / cellPx) * unitsPerCell
        if (movedFeet > 0.0001) {
          onMovementFeet(movedFeet)
          movementLastPosition = movementCurrent
        }
      }

      if (draggingToken?.party && !draggingToken.hidden && activeFogCanvasRef.current) {
        const tokenBrushSize = renderTokenViewDistance(draggingToken)
        const nextCanvasPoint = tokenPointToCanvasPoint(nextPosition, renderTokenDimensions(draggingToken).height)
        if (!nextCanvasPoint) return
        const clipRect =
          streamingMode && usingFullScreenCanvas
            ? getFullscreenVisibleCanvasRect(activeFogCanvasRef.current)
            : null

        queueReveal(nextCanvasPoint, tokenBrushSize, clipRect)
      }
    }

    const handleMove = (event: MouseEvent) => {
      handleMoveAt(event.clientX, event.clientY)
    }

    const handleTouchMove = (event: globalThis.TouchEvent) => {
      if (event.touches.length !== 1) return
      if (tokenTouchDraggingRef.current) {
        event.preventDefault()
      }
      const touch = event.touches[0]
      handleMoveAt(touch.clientX, touch.clientY)
    }

    const handleUp = async () => {
      if (revealFrameId !== null) {
        window.cancelAnimationFrame(revealFrameId)
        revealFrameId = null
      }
      if (pendingRevealPoint) {
        flushPendingReveal()
      }
      const finalPositions = dragTokenPositionsRef.current
      if (!finalPositions) {
        setDraggingTokenId('')
        setDraggingTokenIds([])
        setDragTokenPositions(null)
        tokenDragOffsetRef.current = null
        return
      }

      const finalTokenIds = draggingTokenIds.length > 0 ? draggingTokenIds : [draggingTokenId]
      setDraggingTokenId('')
      setDraggingTokenIds([])
      setDragTokenPosition(null)
      setDragTokenPositions(null)
      dragTokenPositionRef.current = null
      dragTokenPositionsRef.current = null
      dragTokenStartPositionsRef.current = null
      tokenDragOffsetRef.current = null
      tokenFogTrailPointRef.current = null

      setTokens((prev) => prev.map((t) => {
        const pos = finalPositions[t.id]
        return pos ? { ...t, x: pos.x, y: pos.y } : t
      }))

      const pathId = Date.now().toString()
      finalTokenIds.forEach((tokenId) => {
        recentlyDroppedRef.current.add(tokenId)
        window.setTimeout(() => recentlyDroppedRef.current.delete(tokenId), 3000)
      })

      try {
        const batch = writeBatch(db)
        const dropTime = Date.now() - dragStartTime
        finalTokenIds.forEach((tokenId) => {
          const finalPosition = finalPositions[tokenId]
          if (!finalPosition) return
          const token = tokens.find((t) => t.id === tokenId)
          if (token?.hidden) {
            batch.update(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', tokenId), {
              x: finalPosition.x,
              y: finalPosition.y,
              path: deleteField(),
              pathId: deleteField(),
              updatedAt: serverTimestamp(),
            })
            return
          }
          const path = [...(dragPaths[tokenId] ?? []), { x: finalPosition.x, y: finalPosition.y, t: dropTime }]
          batch.update(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', tokenId), {
            x: finalPosition.x,
            y: finalPosition.y,
            path,
            pathId,
            updatedAt: serverTimestamp(),
          })
          lastAnimatedPathIdRef.current[tokenId] = pathId
        })
        await batch.commit()
      } catch (error) {
        console.warn('Token write failed', error)
      }

      if (draggingToken?.party && !draggingToken.hidden) {
        try {
          await persistFog()
        } catch (error) {
          console.warn('Token write failed', error)
        }
      }

      tokenTouchDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    window.addEventListener('touchcancel', handleUp)

    return () => {
      if (revealFrameId !== null) {
        window.cancelAnimationFrame(revealFrameId)
      }
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleUp)
      window.removeEventListener('touchcancel', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeFogCanvasRef,
    activeVisionCanvasRef,
    campaignId,
    draggingTokenId,
    draggingTokenIds,
    role,
    selectedMap,
    selectedTokenIds,
    streamingMode,
    tokens,
    usingFullScreenCanvas,
  ])

  return {
    draggingTokenId,
    draggingTokenIds,
    dragTokenPositions,
    startTokenDrag,
    handleTokenTouchStart,
    handleTokenTouchEnd,
  }
}

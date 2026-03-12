import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Role } from '../../../types/app'
import { ANIM_REVEAL_INTERVAL_MS, TOKEN_REFERENCE_DIMENSION } from '../lib/constants'
import { interpolateAlongPath } from '../lib/pathAnimation'
import type { CanvasClipRect, TokenPathAnimation, TokenRecord, Waypoint } from '../lib/types'

type UseTokenAnimationOptions = {
  tokens: TokenRecord[]
  tokenAnimationsRef: React.MutableRefObject<Record<string, TokenPathAnimation>>
  role: Role | null
  cameraLock: boolean
  fullScreenOpen: boolean
  fullBaseSize: { width: number; height: number }
  inlineBaseSize: { width: number; height: number }
  fullZoomRef: React.MutableRefObject<number>
  playerZoomRef: React.MutableRefObject<number>
  setFullPan: Dispatch<SetStateAction<{ x: number; y: number }>>
  setPlayerPan: Dispatch<SetStateAction<{ x: number; y: number }>>
  fullPanRef: React.MutableRefObject<{ x: number; y: number }>
  playerPanRef: React.MutableRefObject<{ x: number; y: number }>
  activeFogCanvasRef: React.RefObject<HTMLCanvasElement | null>
  activeVisionCanvasRef: React.RefObject<HTMLCanvasElement | null>
  renderTokenViewDistance: (token: TokenRecord) => number
  renderTokenDimensions: (token: TokenRecord) => { width: number; height: number; baseSize: number }
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
  bumpFogSampleTick: () => void
  pendingFogReloadRef: React.MutableRefObject<boolean>
}

export function useTokenAnimation({
  tokens,
  tokenAnimationsRef,
  role,
  cameraLock,
  fullScreenOpen,
  fullBaseSize,
  inlineBaseSize,
  fullZoomRef,
  playerZoomRef,
  setFullPan,
  setPlayerPan,
  fullPanRef,
  playerPanRef,
  activeFogCanvasRef,
  activeVisionCanvasRef,
  renderTokenViewDistance,
  renderTokenDimensions,
  revealFromTokenPoint,
  revealFromTokenStroke,
  bumpFogSampleTick,
  pendingFogReloadRef,
}: UseTokenAnimationOptions) {
  const [animatedTokenPositions, setAnimatedTokenPositions] = useState<Record<string, { x: number; y: number }>>({})

  const animRafRef = useRef<number | null>(null)
  const animTickRef = useRef<() => void>(() => { })
  const tokensRef = useRef<TokenRecord[]>([])
  const recentlyDroppedRef = useRef(new Set<string>())
  const lastAnimatedPathIdRef = useRef<Record<string, string>>({})
  const startTokenPathAnimationRef = useRef<(
    tokenId: string,
    fromPos: { x: number; y: number },
    path: Waypoint[],
    token: TokenRecord,
  ) => void>(() => { })

  tokensRef.current = tokens

  const averagePartyCenter = (
    partyTokens: TokenRecord[],
    nextPositions: Record<string, { x: number; y: number }>,
    mapHeightPx: number,
  ) => {
    const safeMapHeight = Math.max(1, mapHeightPx)
    const cx = partyTokens.reduce((sum, t) => sum + (nextPositions[t.id]?.x ?? t.x), 0) / partyTokens.length
    const cy = partyTokens.reduce((sum, t) => {
      const dims = renderTokenDimensions(t)
      const y = nextPositions[t.id]?.y ?? t.y
      const visualCenterY = y - dims.height / (2 * safeMapHeight)
      return sum + Math.max(0, Math.min(1, visualCenterY))
    }, 0) / partyTokens.length
    return { cx, cy }
  }

  animTickRef.current = () => {
    const now = Date.now()
    const nextPositions: Record<string, { x: number; y: number }> = {}
    let hasActive = false

    for (const [tokenId, anim] of Object.entries(tokenAnimationsRef.current)) {
      const t = Math.min(1, (now - anim.startTime) / anim.duration)
      const pos = interpolateAlongPath(anim.path, t)
      nextPositions[tokenId] = pos

      if (anim.party && activeFogCanvasRef.current && activeVisionCanvasRef.current) {
        if (now - anim.lastRevealTime >= ANIM_REVEAL_INTERVAL_MS) {
          const canvasPoint = {
            x: pos.x * activeFogCanvasRef.current.width,
            y: Math.max(0, pos.y * activeFogCanvasRef.current.height - anim.tokenSizeScale * activeFogCanvasRef.current.height * 0.5),
          }
          if (anim.lastRevealCanvasPos) {
            revealFromTokenStroke(
              activeFogCanvasRef.current,
              activeVisionCanvasRef.current,
              anim.lastRevealCanvasPos,
              canvasPoint,
              anim.brushSize,
              null,
            )
          } else {
            revealFromTokenPoint(
              activeFogCanvasRef.current,
              activeVisionCanvasRef.current,
              canvasPoint,
              anim.brushSize,
              null,
            )
          }
          anim.lastRevealCanvasPos = canvasPoint
          anim.lastRevealTime = now
        }
      }

      if (t < 1) {
        hasActive = true
      } else {
        if (anim.party && activeFogCanvasRef.current && activeVisionCanvasRef.current) {
          const endPoint = {
            x: pos.x * activeFogCanvasRef.current.width,
            y: Math.max(0, pos.y * activeFogCanvasRef.current.height - anim.tokenSizeScale * activeFogCanvasRef.current.height * 0.5),
          }
          if (anim.lastRevealCanvasPos) {
            revealFromTokenStroke(
              activeFogCanvasRef.current,
              activeVisionCanvasRef.current,
              anim.lastRevealCanvasPos,
              endPoint,
              anim.brushSize,
              null,
            )
          } else {
            revealFromTokenPoint(
              activeFogCanvasRef.current,
              activeVisionCanvasRef.current,
              endPoint,
              anim.brushSize,
              null,
            )
          }
        }
        delete tokenAnimationsRef.current[tokenId]
      }
    }

    if (cameraLock && role !== 'gm') {
      const partyTokens = tokensRef.current.filter((t) => t.party && !t.hidden)
      const hasPartyAnim = partyTokens.some((t) => nextPositions[t.id] !== undefined)
      if (hasPartyAnim && partyTokens.length > 0) {
        if (fullScreenOpen) {
          const { cx, cy } = averagePartyCenter(partyTokens, nextPositions, fullBaseSize.height)
          const nextPan = {
            x: fullBaseSize.width * fullZoomRef.current * (0.5 - cx),
            y: fullBaseSize.height * fullZoomRef.current * (0.5 - cy),
          }
          fullPanRef.current = nextPan
          setFullPan(nextPan)
        } else {
          const { cx, cy } = averagePartyCenter(partyTokens, nextPositions, inlineBaseSize.height)
          const nextPan = {
            x: inlineBaseSize.width * playerZoomRef.current * (0.5 - cx),
            y: inlineBaseSize.height * playerZoomRef.current * (0.5 - cy),
          }
          playerPanRef.current = nextPan
          setPlayerPan(nextPan)
        }
      }
    }

    if (hasActive || Object.keys(tokenAnimationsRef.current).length > 0) {
      setAnimatedTokenPositions({ ...nextPositions })
      animRafRef.current = requestAnimationFrame(animTickRef.current)
    } else {
      setAnimatedTokenPositions({})
      animRafRef.current = null
      if (pendingFogReloadRef.current) {
        pendingFogReloadRef.current = false
        bumpFogSampleTick()
      }
    }
  }

  startTokenPathAnimationRef.current = (tokenId, fromPos, path, token) => {
    const brushSize = renderTokenViewDistance(token)
    const tokenSizeScale = token.sizeScale ?? token.size / TOKEN_REFERENCE_DIMENSION
    const firstT = (path[0] as Waypoint).t
    const fullPath: Waypoint[] = [
      { x: fromPos.x, y: fromPos.y, t: firstT !== undefined ? 0 : undefined },
      ...path,
    ]
    const lastWaypoint = fullPath[fullPath.length - 1]
    const recordedDuration = lastWaypoint.t
    const duration = recordedDuration !== undefined
      ? Math.min(3000, Math.max(200, recordedDuration * 1.2))
      : Math.min(1500, Math.max(400, fullPath.reduce((acc, p, i) =>
        i === 0 ? 0 : acc + Math.hypot(p.x - fullPath[i - 1].x, p.y - fullPath[i - 1].y), 0) * 1200))
    tokenAnimationsRef.current[tokenId] = {
      path: fullPath,
      startTime: Date.now(),
      duration,
      brushSize,
      tokenSizeScale,
      party: token.party,
      lastRevealTime: 0,
      lastRevealCanvasPos: null,
    }
    if (animRafRef.current === null) {
      animRafRef.current = requestAnimationFrame(animTickRef.current)
    }
  }

  return {
    animatedTokenPositions,
    tokenAnimationsRef,
    animRafRef,
    tokensRef,
    recentlyDroppedRef,
    lastAnimatedPathIdRef,
    startTokenPathAnimationRef,
  }
}

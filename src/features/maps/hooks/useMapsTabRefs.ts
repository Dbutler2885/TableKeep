import { useLayoutEffect, useRef } from 'react'
import { clientPointToNormalizedPoint, tokenPointToCanvasPoint as calculateTokenCanvasPoint } from '../lib/canvasCoordinates'
import type { MapDimensions } from '../lib/inlineMapSizing'
import { renderTokenDimensions as calculateTokenDimensions, renderTokenViewDistance as calculateTokenViewDistance } from '../lib/tokenRenderGeometry'
import type { TokenPathAnimation, TokenRecord, Waypoint } from '../lib/types'

type Point = { x: number; y: number }
type GetDropPoint = (clientX: number, clientY: number) => Point | null
type StartTokenPathAnimation = (tokenId: string, fromPos: Point, path: Waypoint[], token: TokenRecord) => void

// Stable refs used to break circular deps between the map hooks. useMapData is
// called before useFogTools and useTokenAnimation, so it is handed these refs and
// they are kept in step with what those hooks produce, so that async subscription
// callbacks in useMapData always call the current implementations.
export function useMapsTabRefs() {
  return {
    tokenAnimationsRef: useRef<Record<string, TokenPathAnimation>>({}),
    pendingFogReloadRef: useRef(false),
    suppressNextMapClickRef: useRef(false),
    getDropPointRef: useRef<GetDropPoint>(() => null),
    tokensRef: useRef<TokenRecord[]>([]),
    recentlyDroppedRef: useRef(new Set<string>()),
    lastAnimatedPathIdRef: useRef<Record<string, string>>({}),
    startTokenPathAnimationRef: useRef<StartTokenPathAnimation>(() => { }),
  }
}

export type MapsTabRefs = ReturnType<typeof useMapsTabRefs>

type ElementRef<T> = { current: T | null }

// Where a client point falls on the map, normalized to 0..1: measured against the
// fog canvas once it has a size, and against the map layer before that.
export function useTokenDropPoint(fogCanvasRef: ElementRef<HTMLCanvasElement>, layerRef: ElementRef<HTMLDivElement>, getDropPointRef: { current: GetDropPoint }) {
  const getTokenDropPoint = (clientX: number, clientY: number) => {
    const canvas = fogCanvasRef.current
    const layer = layerRef.current
    return clientPointToNormalizedPoint(
      { clientX, clientY },
      canvas ? { rect: canvas.getBoundingClientRect(), width: canvas.width, height: canvas.height } : null,
      layer?.getBoundingClientRect() ?? null,
    )
  }
  useLayoutEffect(() => {
    getDropPointRef.current = getTokenDropPoint
  })
  return getTokenDropPoint
}

type AnimationRefs = Pick<MapsTabRefs, 'tokensRef' | 'recentlyDroppedRef' | 'lastAnimatedPathIdRef' | 'startTokenPathAnimationRef'>

// Points the refs handed to useMapData at useTokenAnimation's own values.
export function useSharedAnimationRefs({ tokensRef, recentlyDroppedRef, lastAnimatedPathIdRef, startTokenPathAnimationRef }: AnimationRefs, animation: AnimationRefs) {
  useLayoutEffect(() => {
    tokensRef.current = animation.tokensRef.current
    recentlyDroppedRef.current = animation.recentlyDroppedRef.current
    lastAnimatedPathIdRef.current = animation.lastAnimatedPathIdRef.current
    startTokenPathAnimationRef.current = animation.startTokenPathAnimationRef.current
  })
}

// Token sizes and view distances in map pixels, and token points on the fog canvas.
export function tokenGeometry(dimensions: MapDimensions, fogCanvasRef: ElementRef<HTMLCanvasElement>) {
  return {
    renderTokenDimensions: (token: TokenRecord) => calculateTokenDimensions(token, dimensions.activeMapDimension),
    renderTokenViewDistance: (token: TokenRecord) => calculateTokenViewDistance(token, dimensions.activeFogDimension),
    tokenPointToCanvasPoint: (point: Point, tokenSizePx = 0) => {
      const canvas = fogCanvasRef.current
      if (!canvas) return null
      return calculateTokenCanvasPoint({
        point,
        tokenSizePx,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        activeMapDimension: dimensions.activeMapDimension,
      })
    },
  }
}

export type TokenGeometry = ReturnType<typeof tokenGeometry>

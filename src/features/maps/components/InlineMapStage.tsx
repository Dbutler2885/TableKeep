import { useEffect, useRef } from 'react'
import type {
  CSSProperties,
  MouseEventHandler,
  ReactNode,
  RefObject,
  TouchEventHandler,
  WheelEventHandler,
} from 'react'
import type { MapRecord } from '../lib/types'

type InlineMapStageProps = {
  stageRef: RefObject<HTMLDivElement | null>
  mapLayerRef: RefObject<HTMLDivElement | null>
  stageClassName: string
  selectedMap: MapRecord | null
  mapLayerClassName: string
  mapLayerStyle?: CSSProperties
  onImageReady: (image: HTMLImageElement) => void
  onBlankReady: (width: number, height: number) => void
  onStageWheel?: WheelEventHandler<HTMLDivElement>
  onStageMouseDown?: MouseEventHandler<HTMLDivElement>
  onStageMouseMove?: MouseEventHandler<HTMLDivElement>
  onStageMouseUp?: MouseEventHandler<HTMLDivElement>
  onStageMouseLeave?: MouseEventHandler<HTMLDivElement>
  onMapLayerContextMenu: MouseEventHandler<HTMLDivElement>
  onMapLayerWheel: WheelEventHandler<HTMLDivElement>
  onMapLayerMouseDown: MouseEventHandler<HTMLDivElement>
  onMapLayerMouseMove: MouseEventHandler<HTMLDivElement>
  onMapLayerClick: MouseEventHandler<HTMLDivElement>
  onMapLayerTouchStart: TouchEventHandler<HTMLDivElement>
  onMapLayerTouchMove: TouchEventHandler<HTMLDivElement>
  onMapLayerTouchEnd: TouchEventHandler<HTMLDivElement>
  onMapLayerTouchCancel: TouchEventHandler<HTMLDivElement>
  children: ReactNode
}

export function InlineMapStage({
  stageRef,
  mapLayerRef,
  stageClassName,
  selectedMap,
  mapLayerClassName,
  mapLayerStyle,
  onImageReady,
  onBlankReady,
  onStageWheel,
  onStageMouseDown,
  onStageMouseMove,
  onStageMouseUp,
  onStageMouseLeave,
  onMapLayerContextMenu,
  onMapLayerWheel,
  onMapLayerMouseDown,
  onMapLayerMouseMove,
  onMapLayerClick,
  onMapLayerTouchStart,
  onMapLayerTouchMove,
  onMapLayerTouchEnd,
  onMapLayerTouchCancel,
  children,
}: InlineMapStageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const onImageReadyRef = useRef(onImageReady)
  const onBlankReadyRef = useRef(onBlankReady)

  useEffect(() => {
    onImageReadyRef.current = onImageReady
  }, [onImageReady])

  useEffect(() => {
    onBlankReadyRef.current = onBlankReady
  }, [onBlankReady])

  useEffect(() => {
    const image = imageRef.current
    if (!image || !selectedMap?.imageUrl) return
    if (image.complete && image.naturalWidth > 0) onImageReadyRef.current(image)
  }, [selectedMap?.id, selectedMap?.imageUrl])

  // An unsaved blank map (no exported image yet) renders a neutral placeholder
  // surface; once saved it has an image and goes through the standard image path.
  const isUnsavedBlank = selectedMap?.kind === 'blank' && !selectedMap.imageUrl

  // Measure the blank surface once per map (or when its source dimensions change).
  // We read the callback from a ref and depend only on stable primitives so the
  // measurement's own setState cannot retrigger this effect into a render loop.
  const blankMapId = selectedMap?.id
  const blankSourceWidth = selectedMap?.width
  const blankSourceHeight = selectedMap?.height
  useEffect(() => {
    if (!isUnsavedBlank) return
    const mapLayer = mapLayerRef.current
    if (!mapLayer) return
    let frame = 0
    const measure = (attempt = 0) => {
      const rect = mapLayer.getBoundingClientRect()
      const width = Math.round(rect.width)
      const height = Math.round(rect.height)
      if ((width <= 0 || height <= 0) && attempt < 8) {
        frame = window.requestAnimationFrame(() => measure(attempt + 1))
        return
      }
      onBlankReadyRef.current(
        Math.max(1, width || blankSourceWidth || 1),
        Math.max(1, height || blankSourceHeight || 1),
      )
    }
    measure()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [mapLayerRef, isUnsavedBlank, blankMapId, blankSourceWidth, blankSourceHeight])

  const mapIsRenderable = Boolean(selectedMap?.imageUrl) || isUnsavedBlank
  const blankLayerStyle: CSSProperties | undefined = isUnsavedBlank
    ? {
        ...mapLayerStyle,
        width: `min(100%, ${Math.max(1, selectedMap.width)}px)`,
        aspectRatio: `${Math.max(1, selectedMap.width)} / ${Math.max(1, selectedMap.height)}`,
      }
    : mapLayerStyle

  return (
    <div
      ref={stageRef}
      className={stageClassName}
      onWheel={onStageWheel}
      onMouseDown={onStageMouseDown}
      onMouseMove={onStageMouseMove}
      onMouseUp={onStageMouseUp}
      onMouseLeave={onStageMouseLeave}
    >
      {mapIsRenderable ? (
        <div
          ref={mapLayerRef}
          className={[
            mapLayerClassName,
            isUnsavedBlank ? 'blank-map-layer' : '',
          ].filter(Boolean).join(' ')}
          onContextMenu={onMapLayerContextMenu}
          onWheel={onMapLayerWheel}
          onMouseDown={onMapLayerMouseDown}
          onMouseMove={onMapLayerMouseMove}
          onClick={onMapLayerClick}
          onTouchStart={onMapLayerTouchStart}
          onTouchMove={onMapLayerTouchMove}
          onTouchEnd={onMapLayerTouchEnd}
          onTouchCancel={onMapLayerTouchCancel}
          style={blankLayerStyle}
        >
          {isUnsavedBlank ? (
            <div
              key={selectedMap.id}
              data-map-id={selectedMap.id}
              className="map-blank-surface inline-map-image"
              style={{ backgroundColor: selectedMap.backgroundColor }}
              aria-label={selectedMap.name}
            />
          ) : (
            <img
              ref={imageRef}
              key={selectedMap?.id}
              data-map-id={selectedMap?.id}
              src={selectedMap?.imageUrl}
              alt={selectedMap?.name}
              className="map-image inline-map-image"
              onLoad={(event) => onImageReadyRef.current(event.currentTarget)}
            />
          )}
          {children}
        </div>
      ) : (
        <p>Select a map from the list.</p>
      )}
    </div>
  )
}

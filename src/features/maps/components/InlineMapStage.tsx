import { Maximize2 } from 'lucide-react'
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
  isMobile: boolean
  stageClassName: string
  selectedMap: MapRecord | null
  mapLayerClassName: string
  mapLayerStyle?: CSSProperties
  onOpenFullscreen: () => void
  onImageReady: (image: HTMLImageElement) => void
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
  isMobile,
  stageClassName,
  selectedMap,
  mapLayerClassName,
  mapLayerStyle,
  onOpenFullscreen,
  onImageReady,
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

  useEffect(() => {
    onImageReadyRef.current = onImageReady
  }, [onImageReady])

  useEffect(() => {
    const image = imageRef.current
    if (!image || !selectedMap?.imageUrl) return
    if (image.complete && image.naturalWidth > 0) onImageReadyRef.current(image)
  }, [selectedMap?.id, selectedMap?.imageUrl])

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
      {!isMobile ? (
        <button type="button" className="map-fullscreen-btn" onClick={onOpenFullscreen}>
          <Maximize2 size={15} />
          Full Screen
        </button>
      ) : null}
      {selectedMap?.imageUrl ? (
        <div
          ref={mapLayerRef}
          className={mapLayerClassName}
          onContextMenu={onMapLayerContextMenu}
          onWheel={onMapLayerWheel}
          onMouseDown={onMapLayerMouseDown}
          onMouseMove={onMapLayerMouseMove}
          onClick={onMapLayerClick}
          onTouchStart={onMapLayerTouchStart}
          onTouchMove={onMapLayerTouchMove}
          onTouchEnd={onMapLayerTouchEnd}
          onTouchCancel={onMapLayerTouchCancel}
          style={mapLayerStyle}
        >
          <img
            ref={imageRef}
            key={selectedMap.id}
            data-map-id={selectedMap.id}
            src={selectedMap.imageUrl}
            alt={selectedMap.name}
            className="map-image inline-map-image"
            onLoad={(event) => onImageReadyRef.current(event.currentTarget)}
          />
          {children}
        </div>
      ) : (
        <p>Select a map from the list.</p>
      )}
    </div>
  )
}

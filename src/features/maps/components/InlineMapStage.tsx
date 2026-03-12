import { Maximize2 } from 'lucide-react'
import type {
  CSSProperties,
  MouseEventHandler,
  ReactNode,
  RefObject,
  SyntheticEvent,
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
  onImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void
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
  onImageLoad,
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
            key={selectedMap.id}
            src={selectedMap.imageUrl}
            alt={selectedMap.name}
            className="map-image inline-map-image"
            onLoad={onImageLoad}
          />
          {children}
        </div>
      ) : (
        <p>Select a map from the list.</p>
      )}
    </div>
  )
}

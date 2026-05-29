import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type {
  CSSProperties,
  MouseEventHandler,
  ReactNode,
  RefObject,
  WheelEventHandler,
} from 'react'
import type { MapRecord } from '../lib/types'

type FullscreenMapStageProps = {
  stageRef: RefObject<HTMLDivElement | null>
  mapLayerRef: RefObject<HTMLDivElement | null>
  selectedMap: MapRecord | null
  fullDragging: boolean
  mapLayerStyle: CSSProperties
  onClose: () => void
  onImageReady: (image: HTMLImageElement) => void
  onStageWheel: WheelEventHandler<HTMLDivElement>
  onStageMouseDown: MouseEventHandler<HTMLDivElement>
  onStageAuxClick: MouseEventHandler<HTMLDivElement>
  onStageMouseMove: MouseEventHandler<HTMLDivElement>
  onStageMouseUp: MouseEventHandler<HTMLDivElement>
  onStageMouseLeave: MouseEventHandler<HTMLDivElement>
  onMapLayerWheel: WheelEventHandler<HTMLDivElement>
  onMapLayerMouseDown: MouseEventHandler<HTMLDivElement>
  onMapLayerMouseMove: MouseEventHandler<HTMLDivElement>
  onMapLayerClick: MouseEventHandler<HTMLDivElement>
  children: ReactNode
  controlsNode?: ReactNode
}

export function FullscreenMapStage({
  stageRef,
  mapLayerRef,
  selectedMap,
  fullDragging,
  mapLayerStyle,
  onClose,
  onImageReady,
  onStageWheel,
  onStageMouseDown,
  onStageAuxClick,
  onStageMouseMove,
  onStageMouseUp,
  onStageMouseLeave,
  onMapLayerWheel,
  onMapLayerMouseDown,
  onMapLayerMouseMove,
  onMapLayerClick,
  children,
  controlsNode,
}: FullscreenMapStageProps) {
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
    <div className="map-fullscreen-overlay" role="dialog" aria-modal="true">
      <div className="map-fullscreen-shell">
        <div
          ref={stageRef}
          className={fullDragging ? 'map-fullscreen-stage dragging' : 'map-fullscreen-stage'}
          onWheel={onStageWheel}
          onMouseDown={onStageMouseDown}
          onAuxClick={onStageAuxClick}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onMouseLeave={onStageMouseLeave}
        >
          <button
            type="button"
            className="map-fullscreen-close"
            onClick={onClose}
            aria-label="Close full screen map"
          >
            <X size={16} />
          </button>

          {selectedMap?.imageUrl ? (
            <div
              className="map-zoom-layer"
              ref={mapLayerRef}
              onWheel={onMapLayerWheel}
              onMouseDown={onMapLayerMouseDown}
              onMouseMove={onMapLayerMouseMove}
              onClick={onMapLayerClick}
              style={mapLayerStyle}
            >
              <img
                ref={imageRef}
                key={selectedMap.id}
                data-map-id={selectedMap.id}
                src={selectedMap.imageUrl}
                alt={selectedMap.name}
                className="map-image zoomable"
                draggable={false}
                onLoad={(event) => onImageReadyRef.current(event.currentTarget)}
              />
              {children}
            </div>
          ) : (
            <p>Select a map from the list.</p>
          )}
        </div>
        {controlsNode}
      </div>
    </div>
  )
}

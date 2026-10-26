import type { ChangeEvent, KeyboardEvent } from 'react'
import { Check, Circle, Pencil, Trash2, Upload } from 'lucide-react'
import type { useMapData } from '../hooks/useMapData'
import { isActivationKey, isTextEntry } from '../lib/bareMapInteractions'
import { mapListNotice, mapRowClassName } from '../lib/mapListDisplay'
import type { MapRecord } from '../lib/types'
import type { MapsTabModel } from './mapsTabModel'

type MapData = ReturnType<typeof useMapData>

type MapCreateActionsProps = { uploading: boolean; onDraw: () => void; onUpload: (file: File) => void }

function MapCreateActions({ uploading, onDraw, onUpload }: MapCreateActionsProps) {
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    onUpload(file)
  }
  return (
    <div className="maps-create-actions">
      <button
        type="button"
        className="upload-trigger map-blank-create-btn"
        onClick={onDraw}
        disabled={uploading}
      >
        <Pencil size={16} />
        Draw
      </button>
      <label className="upload-trigger">
        <Upload size={16} />
        {uploading ? 'Uploading...' : 'Upload'}
        <input type="file" accept="image/*" onChange={upload} disabled={uploading} />
      </label>
    </div>
  )
}

function selectOnKey(event: KeyboardEvent<HTMLDivElement>, select: () => void) {
  if (isTextEntry(event.target as HTMLElement)) return
  if (!isActivationKey(event.key)) return
  event.preventDefault()
  select()
}

function MapThumb({ map }: { map: MapRecord }) {
  return (
    <>
      {map.imageUrl ? <img src={map.imageUrl} alt={map.name} className="map-thumb" /> : null}
      {map.kind === 'blank' && !map.imageUrl ? <span className="map-thumb blank" aria-hidden /> : null}
    </>
  )
}

function MapVisibilityButton({ map, onToggle }: { map: MapRecord; onToggle: MapData['togglePlayerVisibility'] }) {
  return (
    <button
      type="button"
      className={map.visibleToPlayers ? 'map-visibility-btn on' : 'map-visibility-btn'}
      onClick={(event) => {
        event.stopPropagation()
        void onToggle(map, !map.visibleToPlayers)
      }}
      aria-label={map.visibleToPlayers ? 'Visible to players' : 'Hidden from players'}
    >
      {map.visibleToPlayers ? <Check size={14} /> : <Circle size={14} />}
    </button>
  )
}

type MapThumbColumnProps = { map: MapRecord; isGm: boolean; onToggleVisibility: MapData['togglePlayerVisibility'] }

function MapThumbColumn({ map, isGm, onToggleVisibility }: MapThumbColumnProps) {
  return (
    <div className="map-thumb-column">
      <div className="map-thumb-wrap">
        {isGm ? <MapThumb map={map} /> : null}
      </div>
      {isGm ? <MapVisibilityButton map={map} onToggle={onToggleVisibility} /> : null}
    </div>
  )
}

function MapRowMeta({ map, mapData }: { map: MapRecord; mapData: MapData }) {
  return (
    <div className="map-meta">
      {mapData.editingMapId === map.id ? (
        <input
          value={mapData.editName}
          onChange={(event) => mapData.setEditName(event.target.value)}
          aria-label="Edit map name"
        />
      ) : (
        <strong>{map.name}</strong>
      )}
    </div>
  )
}

function MapRowActions({ map, mapData }: { map: MapRecord; mapData: MapData }) {
  return (
    <div className="map-actions">
      {mapData.editingMapId === map.id ? (
        <button type="button" className="map-edit-btn" onClick={() => void mapData.saveRename(map.id)}>
          <Check size={14} />
        </button>
      ) : (
        <button type="button" className="map-edit-btn" onClick={() => mapData.startRename(map)}>
          <Pencil size={14} />
        </button>
      )}
      <button
        type="button"
        className="map-delete-btn"
        onClick={() => mapData.setDeleteCandidate(map)}
        disabled={mapData.deletingMapId === map.id}
        aria-label={`Delete ${map.name}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

type MapListRowProps = { map: MapRecord; isGm: boolean; active: boolean; mapData: MapData; onSelect: (mapId: string) => void }

// One map in the list: select it, and for the GM, drag it to reorder, reveal it
// to players, rename it or delete it.
function MapListRow({ map, isGm, active, mapData, onSelect }: MapListRowProps) {
  const { dragOverMapId, setDragOverMapId } = mapData
  return (
    <div
      className={mapRowClassName(active, map.id === dragOverMapId, map.id === mapData.draggingMapId)}
      draggable={isGm}
      onDragStart={() => mapData.handleDragStart(map.id)}
      onDragOver={(event) => {
        event.preventDefault()
        if (dragOverMapId !== map.id) setDragOverMapId(map.id)
      }}
      onDragLeave={() => {
        if (dragOverMapId === map.id) setDragOverMapId('')
      }}
      onDrop={(event) => {
        event.preventDefault()
        void mapData.handleDrop(map.id)
      }}
      onDragEnd={() => {
        mapData.setDraggingMapId('')
        setDragOverMapId('')
      }}
    >
      <div
        className="map-select"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(map.id)}
        onKeyDown={(event) => selectOnKey(event, () => onSelect(map.id))}
      >
        <MapThumbColumn map={map} isGm={isGm} onToggleVisibility={mapData.togglePlayerVisibility} />
        <MapRowMeta map={map} mapData={mapData} />
      </div>

      {isGm ? <MapRowActions map={map} mapData={mapData} /> : null}
    </div>
  )
}

// The list of maps, with the GM's create actions above it.
export function MapsSidebar({ model, selectedMapId }: { model: MapsTabModel; selectedMapId: string }) {
  const { role, mapData } = model
  const isGm = role === 'gm'
  const notice = mapListNotice(mapData.mapsLoading, mapData.maps.length, mapData.visibleMaps.length, isGm)
  return (
    <aside className="maps-sidebar">
      <div className="maps-sidebar-header">
        <h2>Maps</h2>
        {isGm ? (
          <MapCreateActions
            uploading={mapData.uploading}
            onDraw={() => void model.drawing.openDrawingEditor()}
            onUpload={(file) => void mapData.handleMapUpload(file)}
          />
        ) : null}
      </div>
      <p className="maps-role">Role: {role ?? 'unknown'}</p>

      {notice ? <p>{notice}</p> : null}

      <div className="maps-list">
        {mapData.visibleMaps.map((map) => (
          <MapListRow key={map.id} map={map} isGm={isGm} active={map.id === selectedMapId} mapData={mapData} onSelect={model.selectMap} />
        ))}
      </div>

      {mapData.mapError ? <p className="error">{mapData.mapError}</p> : null}
    </aside>
  )
}

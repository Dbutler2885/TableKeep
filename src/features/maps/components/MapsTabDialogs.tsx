import { Check, Minus, Plus, X } from 'lucide-react'
import { ConfirmModal } from '../../common/ConfirmModal'
import { ENCOUNTER_CHECK_DISTANCE_FEET, ENCOUNTER_CHECK_TURNS } from '../lib/constants'
import { deleteConfirmLabel, tokenDeleteMessage, tokenDeleteTitle } from '../lib/mapListDisplay'
import { MAP_INTERACTION_HELP_SECTIONS } from '../lib/toolGuidance'
import { MapDrawingEditor } from './MapDrawingEditor'
import type { MapsTabModel } from './mapsTabModel'

type MapData = MapsTabModel['mapData']

// Crops an uploaded token image to the square the token shows.
function TokenImageCropModal({ assets }: { assets: MapsTabModel['tokenAssets'] }) {
  const draft = assets.tokenImageDraft
  if (!draft) return null
  return (
    <div className="monster-portrait-modal-overlay" role="dialog" aria-modal="true" aria-label="Adjust token image">
      <div className="monster-portrait-modal">
        <div className="monster-portrait-modal-header">
          <span className="monster-portrait-modal-hint">Drag to center crop</span>
          <div className="monster-portrait-modal-actions">
            <button
              type="button"
              className="modal-icon-btn"
              onClick={() => assets.adjustTokenImageDraftZoom(-0.2)}
              aria-label="Zoom out token crop"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="modal-icon-btn"
              onClick={() => assets.adjustTokenImageDraftZoom(0.2)}
              aria-label="Zoom in token crop"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="modal-icon-btn"
              onClick={() => assets.setTokenImageDraft(null)}
              aria-label="Cancel token image crop"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              className="modal-icon-btn confirm"
              onClick={() => void assets.applyTokenImageDraft()}
              aria-label="Apply token image crop"
            >
              <Check size={16} />
            </button>
          </div>
        </div>
        <div
          className="monster-portrait-modal-preview monster-portrait-drag-zone"
          style={{ aspectRatio: '1 / 1' }}
          onPointerDown={assets.handleTokenImageDraftDragStart}
          onPointerMove={assets.handleTokenImageDraftDragMove}
          onPointerUp={assets.clearTokenImageDraftDrag}
          onPointerCancel={assets.clearTokenImageDraftDrag}
        >
          <img
            src={draft.imageUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: `${draft.focusX}% ${draft.focusY}%`,
              transform: `scale(${draft.zoom})`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}

function MapDeleteDialog({ mapData }: { mapData: MapData }) {
  return (
    <ConfirmModal
      open={mapData.deleteCandidate !== null}
      title="Delete Map?"
      message={`Permanently remove "${mapData.deleteCandidate?.name ?? ''}" from this campaign?`}
      confirmLabel={deleteConfirmLabel(mapData.deletingMapId)}
      confirmDisabled={Boolean(mapData.deletingMapId)}
      onCancel={() => mapData.setDeleteCandidate(null)}
      onConfirm={() => void mapData.deleteMap()}
    />
  )
}

function TokenDeleteDialog({ mapData }: { mapData: MapData }) {
  return (
    <ConfirmModal
      open={mapData.tokenDeleteCandidate !== null}
      title={tokenDeleteTitle(mapData.tokenDeleteCandidate)}
      message={tokenDeleteMessage(mapData.tokenDeleteCandidate)}
      confirmLabel={deleteConfirmLabel(mapData.deletingTokenId)}
      confirmDisabled={Boolean(mapData.deletingTokenId)}
      onCancel={() => mapData.setTokenDeleteCandidate(null)}
      onConfirm={() => void mapData.confirmDeleteToken()}
    />
  )
}

function TokenAssetDeleteDialog({ mapData }: { mapData: MapData }) {
  return (
    <ConfirmModal
      open={mapData.tokenAssetDeleteCandidate !== null}
      title="Delete Token Icon?"
      message={`Permanently remove "${mapData.tokenAssetDeleteCandidate?.name ?? ''}" from token icons?`}
      confirmLabel={deleteConfirmLabel(mapData.deletingTokenAssetId)}
      confirmDisabled={Boolean(mapData.deletingTokenAssetId)}
      onCancel={() => mapData.setTokenAssetDeleteCandidate(null)}
      onConfirm={() => void mapData.confirmDeleteTokenAsset()}
    />
  )
}

function MapHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Map interaction help">
      <div className="confirm-modal map-help-modal">
        <h3>Map Controls</h3>
        <div className="map-help-sections">
          {MAP_INTERACTION_HELP_SECTIONS.map((section) => (
            <section key={section.title} className="map-help-section">
              <h4>{section.title}</h4>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function EncounterDialog({ encounter }: { encounter: MapsTabModel['encounter'] }) {
  const notice = encounter.encounterNotice
  if (!notice) return null
  return (
    <div className="encounter-modal-overlay" role="dialog" aria-modal="true" aria-label="Encounter alert">
      <div className="encounter-modal">
        <h3>You encounter a monster!</h3>
        <p>Encounter checks: {notice.checks} at every {ENCOUNTER_CHECK_DISTANCE_FEET * ENCOUNTER_CHECK_TURNS}&apos;.</p>
        <p>Test chance: 1 in 6. Rolls: {notice.rolls.join(', ')}.</p>
        <div className="encounter-modal-actions">
          <button type="button" onClick={encounter.dismissEncounterNotice}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function BlankMapDrawingEditor({ drawing, campaignId }: { drawing: MapsTabModel['drawing']; campaignId: string }) {
  const map = drawing.drawingEditorMap
  if (!map) return null
  return (
    <MapDrawingEditor
      mapName={map.name}
      initialSceneJson={map.drawingScene}
      backgroundColor={map.backgroundColor}
      stampScopeKey={campaignId}
      onCancel={drawing.closeDrawingEditor}
      onSave={drawing.handleSaveBlankDrawing}
    />
  )
}

// The Maps tab's dialogs: the token image crop, the delete confirmations, the
// controls help, the encounter alert and the drawing editor.
export function MapsTabDialogs({ model }: { model: MapsTabModel }) {
  const { mapData } = model
  return (
    <>
      <TokenImageCropModal assets={model.tokenAssets} />
      <MapDeleteDialog mapData={mapData} />
      <TokenDeleteDialog mapData={mapData} />
      <TokenAssetDeleteDialog mapData={mapData} />
      {model.help.open ? <MapHelpDialog onClose={() => model.help.setOpen(false)} /> : null}
      <EncounterDialog encounter={model.encounter} />
      <BlankMapDrawingEditor drawing={model.drawing} campaignId={model.campaignId} />
    </>
  )
}

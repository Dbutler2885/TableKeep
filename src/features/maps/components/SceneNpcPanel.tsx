import { Eye, Trash2, User, X } from 'lucide-react'
import type { SceneNpcPicker } from '../hooks/useSceneNpcPicker'
import type { NpcSummary } from '../lib/types'

export type SceneNpcPanelProps = {
  picker: SceneNpcPicker
  sceneNpcs: NpcSummary[]
  presentedNpc: NpcSummary | null
  onToggleSceneNpc: (npcId: string, enabled: boolean) => void
  onPresentNpc: (npcId: string) => void
  onClearPresentedNpc: () => void
  setNpcSceneMode: (value: boolean) => void
  onOpenNpc: (npcId: string) => void
}

function npcOptionLabel(npc: NpcSummary) {
  return npc.title ? `${npc.name} - ${npc.title}` : npc.name
}

function SceneNpcPickerRow({ picker, onToggleSceneNpc }: Pick<SceneNpcPanelProps, 'picker' | 'onToggleSceneNpc'>) {
  const { availableNpcs, pickerId } = picker
  return (
    <div className="scene-npc-picker-row">
      <select
        value={pickerId}
        onChange={(event) => picker.setPickerId(event.target.value)}
        disabled={availableNpcs.length === 0}
        aria-label="Select NPC to preload"
      >
        {availableNpcs.length === 0 ? (
          <option value="">All NPCs already preloaded</option>
        ) : null}
        {availableNpcs.map((npc) => (
          <option key={npc.id} value={npc.id}>
            {npcOptionLabel(npc)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="monster-example-btn"
        onClick={() => {
          if (!pickerId) return
          onToggleSceneNpc(pickerId, true)
        }}
        disabled={!pickerId}
      >
        Preload
      </button>
    </div>
  )
}

function PresentNpcButton({ presented, onToggle }: { presented: boolean; onToggle: () => void }) {
  const label = presented ? 'Hide presented NPC' : 'Present NPC'
  return (
    <button
      type="button"
      className={presented ? 'token-row-delete scene-npc-action active' : 'token-row-delete scene-npc-action'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-label={label}
      title={label}
    >
      <Eye size={14} />
    </button>
  )
}

type SceneNpcRowProps = {
  npc: NpcSummary
  presented: boolean
  onOpen: () => void
  onTogglePresented: () => void
  onRemove: () => void
}

function SceneNpcRow({ npc, presented, onOpen, onTogglePresented, onRemove }: SceneNpcRowProps) {
  return (
    <div
      className={presented ? 'token-row selected scene-npc-row' : 'token-row scene-npc-row'}
      onClick={onOpen}
    >
      <span className="token-row-icon" aria-hidden>
        {npc.portraitUrl ? <img src={npc.portraitUrl} alt="" className="token-row-image" /> : <User size={14} />}
      </span>
      <div className="token-row-fields">
        <strong>{npc.name}</strong>
        {npc.title ? <small>{npc.title}</small> : null}
      </div>
      <div className="npc-scene-actions">
        <PresentNpcButton presented={presented} onToggle={onTogglePresented} />
        <button
          type="button"
          className="token-row-delete scene-npc-action"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          aria-label="Remove from scene NPCs"
          title="Remove from scene NPCs"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// Presenting an NPC closes the panel; pressing it again on the presented NPC hides it.
function togglePresented(props: SceneNpcPanelProps, npcId: string, presented: boolean) {
  if (presented) {
    props.onClearPresentedNpc()
    return
  }
  props.onPresentNpc(npcId)
  props.setNpcSceneMode(false)
}

// The GM's scene NPCs for this map: preload one, open, present or remove each.
export function SceneNpcPanel(props: SceneNpcPanelProps) {
  const presentedId = props.presentedNpc?.id
  return (
    <section className="token-cards-panel" aria-label="Scene NPCs">
      <div className="token-cards-header">
        <h4 className="token-cards-title">Scene NPCs</h4>
        {props.presentedNpc ? (
          <button
            type="button"
            className="token-cards-toggle fast-tooltip"
            onClick={props.onClearPresentedNpc}
            aria-label="Clear presented NPC"
            data-tooltip="Clear presented NPC"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      <SceneNpcPickerRow picker={props.picker} onToggleSceneNpc={props.onToggleSceneNpc} />
      <div className="token-list">
        {props.sceneNpcs.map((npc) => (
          <SceneNpcRow
            key={npc.id}
            npc={npc}
            presented={presentedId === npc.id}
            onOpen={() => props.onOpenNpc(npc.id)}
            onTogglePresented={() => togglePresented(props, npc.id, presentedId === npc.id)}
            onRemove={() => props.onToggleSceneNpc(npc.id, false)}
          />
        ))}
        {props.sceneNpcs.length === 0 ? <p className="map-npc-scene-empty">No NPCs preloaded for this map.</p> : null}
      </div>
    </section>
  )
}

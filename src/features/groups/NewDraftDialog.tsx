import { useState } from 'react'
import { selectableRuleSets } from '../ruleSets/registry'
import { DialogShell } from './GroupDialog'

type NewDraftDialogProps = {
  busy: boolean
  error: string | null
  onCancel: () => void
  onCreate: (name: string, system: string) => void
}

/** The new draft form. It opens empty on OSE each time, because closing it unmounts it. */
export function NewDraftDialog({ busy, error, onCancel, onCreate }: NewDraftDialogProps) {
  const [name, setName] = useState('')
  const [system, setSystem] = useState('ose')

  return (
    <DialogShell>
      <h3>New draft campaign</h3>
      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          autoFocus
        />
      </label>
      <label>
        System
        <select value={system} onChange={(event) => setSystem(event.target.value)} disabled={busy}>
          {selectableRuleSets().map((ruleSet) => (
            <option key={ruleSet.id} value={ruleSet.id}>
              {ruleSet.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="group-modal-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => onCreate(name, system)} disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </DialogShell>
  )
}

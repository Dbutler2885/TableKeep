import type { revisionedSaveControls } from '../character/characterStore/revisionedStoreAdapter'
import type { SheetEdit, SheetPath } from '../character/characterStore/sheetIntentionTypes'
import './lubecSaveNotice.css'

export type LubecSaveControls = ReturnType<typeof revisionedSaveControls>
const fieldLabel = (leaf: SheetPath[number]) => typeof leaf === 'string' ? leaf : `item or effect ${leaf.recordId}`

function editDescription(edit: SheetEdit) {
  if (edit.kind === 'insert') return `Add ${String(edit.record.name ?? 'item or effect')}`
  const field = fieldLabel(edit.path.at(-1)!)
  if (edit.kind === 'delta') return `${field}: ${signedAmount(edit.amount)}`
  if (edit.kind === 'remove') return `Remove ${field}`
  return `${field}: ${displayValue(edit.value)}`
}

function displayValue(value: unknown) {
  if (typeof value === 'object') return 'edited value retained'
  return String(value)
}

export function LubecSaveNotice({ controls }: { controls?: LubecSaveControls }) {
  if (!controls) return null
  return <SaveFailure controls={controls} />
}

function SaveFailure({ controls }: { controls: NonNullable<LubecSaveControls> }) {
  const failed = controls.entries.find((entry) => entry.error)
  if (!failed) return null
  const refreshRequired = String(failed.error).startsWith('Your version of Table Keep')
  return (
    <aside className="lubec-save-notice" role="alert" aria-label="Unsaved sheet edits">
      <p>{failed.error}</p>
      <details>
        <summary>Review unsaved edits</summary>
        <ul>{controls.entries.flatMap((entry) => entry.intention.edits.map((edit, index) => <li key={`${entry.intention.operationId}-${index}`}>{editDescription(edit)}</li>))}</ul>
      </details>
      <div className="lubec-save-actions">
        <button type="button" disabled={controls.busy} onClick={controls.retry}>Retry save</button>
        <button type="button" disabled={controls.busy} onClick={controls.discard}>Discard unsaved edits</button>
        {refreshRequired ? <button type="button" onClick={() => window.location.reload()}>Refresh</button> : null}
      </div>
    </aside>
  )
}

const signedAmount = (amount: number) => amount >= 0 ? `+${amount}` : String(amount)

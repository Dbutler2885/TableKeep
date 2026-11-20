import { useState, type FormEvent } from 'react'
import { FolderSelect } from './FolderSelect'
import { folderDestinationAllowed, type HandoutFolder } from './handoutModel'

type Props = { folder: HandoutFolder; folders: HandoutFolder[]; onSave: (folder: HandoutFolder) => Promise<void>; onClose: () => void }
export function HandoutFolderEditor({ folder, folders, onSave, onClose }: Props) {
  const [name, setName] = useState(folder.name)
  const [parentId, setParentId] = useState(folder.parentId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const destinations = folders.filter((candidate) => folderDestinationAllowed(folder.id, candidate.id, folders))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try { await onSave({ id: folder.id, name: name.trim(), parentId }) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="folder-editor-title">
    <form className="confirm-modal handout-editor" onSubmit={(event) => void submit(event)}>
      <h3 id="folder-editor-title">{folder.name ? 'Edit folder' : 'Add folder'}</h3>
      <fieldset disabled={busy}>
        <label>Name<input autoFocus required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <FolderSelect value={parentId} folders={destinations} onChange={setParentId} />
      </fieldset>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="confirm-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy || !name.trim()} type="submit">{busy ? 'Saving...' : 'Save folder'}</button></div>
    </form>
  </div>
}

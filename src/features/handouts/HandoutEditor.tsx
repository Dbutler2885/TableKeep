import { useState, type FormEvent } from 'react'
import { FolderSelect } from './FolderSelect'
import { handoutFileKind, viewerUidsFor, type Handout, type HandoutCharacter, type HandoutFolder, type HandoutVisibility } from './handoutModel'

type Props = {
  handout: Handout
  folders: HandoutFolder[]
  characters: HandoutCharacter[]
  onSave: (handout: Handout, file: File | null) => Promise<void>
  onClose: () => void
}

function useHandoutEditor({ handout, characters, onSave }: Props) {
  const [draft, setDraft] = useState(handout)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (patch: Partial<Handout>) => setDraft((current) => ({ ...current, ...patch }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const viewerUids = draft.visibility === 'some' ? viewerUidsFor(draft.characterIds, characters) : []
      if (draft.visibility === 'some' && !viewerUids.length) throw new Error('Choose at least one character with an owner.')
      if (draft.kind !== 'text' && !file && !draft.storagePath) throw new Error('Choose a file to upload.')
      await onSave({ ...draft, title: draft.title.trim(), viewerUids }, file)
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  const chooseFile = (chosen: File | undefined) => {
    if (!chosen) return
    try { update({ kind: handoutFileKind(chosen) }); setFile(chosen); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }
  return { draft, file, busy, error, update, submit, chooseFile, setFile }
}

export function HandoutEditor(props: Props) {
  const { handout, folders, characters, onClose } = props
  const { draft, file, busy, error, update, submit, chooseFile, setFile } = useHandoutEditor(props)
  return <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="handout-editor-title">
    <form className="confirm-modal handout-editor" onSubmit={(event) => void submit(event)}>
      <h3 id="handout-editor-title">{handout.title ? 'Edit handout' : 'Add handout'}</h3>
      <fieldset disabled={busy}>
        <label>Title<input autoFocus required maxLength={200} value={draft.title} onChange={(event) => update({ title: event.target.value })} /></label>
        <FolderSelect value={draft.folderId} folders={folders} onChange={(folderId) => update({ folderId })} />
        <HandoutContentFields draft={draft} file={file} update={update} chooseFile={chooseFile} clearFile={() => setFile(null)} />
        <VisibilityFields visibility={draft.visibility} characterIds={draft.characterIds} characters={characters} onChange={update} />
      </fieldset>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <div className="confirm-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy || !draft.title.trim()} type="submit">{busy ? 'Saving...' : 'Save handout'}</button></div>
    </form>
  </div>
}

function HandoutContentFields({ draft, file, update, chooseFile, clearFile }: {
  draft: Handout; file: File | null; update: (patch: Partial<Handout>) => void
  chooseFile: (file: File | undefined) => void; clearFile: () => void
}) {
  return <>
        <label>Content<select value={draft.kind === 'text' ? 'text' : 'file'} onChange={(event) => { clearFile(); update({ kind: event.target.value === 'text' ? 'text' : 'image' }) }}>
          <option value="text">Text extract</option><option value="file">Image or PDF</option>
        </select></label>
        {draft.kind === 'text'
          ? <label>Text extract<textarea required rows={10} maxLength={200000} value={draft.text} onChange={(event) => update({ text: event.target.value })} /></label>
          : <label>Image or PDF<input type="file" aria-label="Image or PDF" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,application/pdf" onChange={(event) => chooseFile(event.target.files?.[0])} />
            <small>{file?.name || draft.fileName || 'Choose a file up to 20 MB.'}</small></label>}
  </>
}

function VisibilityFields({ visibility, characterIds, characters, onChange }: {
  visibility: HandoutVisibility; characterIds: string[]; characters: HandoutCharacter[]; onChange: (patch: Partial<Handout>) => void
}) {
  const toggle = (id: string) => onChange({ characterIds: characterIds.includes(id) ? characterIds.filter((current) => current !== id) : [...characterIds, id] })
  return <>
    <label>Visibility<select value={visibility} onChange={(event) => onChange({ visibility: event.target.value as HandoutVisibility })}>
      <option value="hidden">Hidden from players</option><option value="all">All players</option><option value="some">Chosen characters</option>
    </select></label>
    {visibility === 'some' ? <fieldset className="handout-character-picker"><legend>Reveal to</legend>
      {characters.filter((character) => character.ownerUserId).map((character) => <label key={character.id}>
        <input type="checkbox" checked={characterIds.includes(character.id)} onChange={() => toggle(character.id)} />{character.name}
      </label>)}
      <small>Access goes to these characters' current owners when you save. Save again after an ownership change.</small>
    </fieldset> : null}
  </>
}

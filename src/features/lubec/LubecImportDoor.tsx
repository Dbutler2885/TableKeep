import { useState, type ChangeEvent } from 'react'
import { readLubecCharacterFile, type LubecImportedCharacter } from '../ruleSets/lubec/importFile'

type ImportDoorProps = {
  onImport: (imported: LubecImportedCharacter) => void
  onBack: () => void
  onCancel: () => void
}

/** Import a file: the standalone sheet's character file, chosen or pasted as text, read the same way. */
export function LubecImportDoor({ onImport, onBack, onCancel }: ImportDoorProps) {
  const [code, setCode] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const importText = (text: string) => {
    const reading = readLubecCharacterFile(text)
    if ('refused' in reading) setRefusal(reading.refused)
    else onImport(reading.imported)
  }
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) file.text().then(importText, () => setRefusal('That file could not be read.'))
  }
  return (
    <div className="lubec-import">
      <p>Choose the <code>.json</code> file the Lubec sheet saved, or paste its character code.</p>
      <label className="lubec-import-file">
        <span>Character file</span>
        <input type="file" accept=".json,application/json" onChange={chooseFile} />
      </label>
      <label className="lubec-import-code">
        <span>Character code</span>
        <textarea rows={5} value={code} onChange={(event) => setCode(event.target.value)} />
      </label>
      {refusal ? <p className="lubec-import-refusal" role="alert">{refusal}</p> : null}
      <div className="confirm-actions">
        <button type="button" onClick={onBack}>Back</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="lubec-import-btn" disabled={code.trim() === ''} onClick={() => importText(code)}>Import code</button>
      </div>
    </div>
  )
}

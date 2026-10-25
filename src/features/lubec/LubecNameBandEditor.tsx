import { EntityMediaEditor } from '../common/EntityMediaEditor'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { TokenIconConfig } from '../tokens/TokenIconEditor'
import { lubecAgeFromInput, lubecCharacterName } from './lubecNames'

/** What an owner or the GM can do to a character from its sheet. */
export type LubecSheetEditing = {
  update: (updates: Partial<LubecCharacterRecord>) => void
  uploadPortrait: (file: File) => Promise<{ portraitPath?: string; portraitUrl?: string | null }>
  uploadToken: (file: File) => Promise<Pick<TokenIconConfig, 'customImagePath' | 'customImageUrl' | 'customImageName'>>
}

type EditorProps = {
  character: LubecCharacterRecord
  editing: LubecSheetEditing
  onDone: () => void
}

function LubecAgeField({ character, editing }: Omit<EditorProps, 'onDone'>) {
  const setAge = (text: string) => {
    const age = lubecAgeFromInput(text)
    if (age !== undefined) editing.update({ lubec: { ...character.lubec, age } })
  }
  return (
    <label className="lubec-age-field">
      Age
      <input inputMode="numeric" value={character.lubec.age ?? ''} onChange={(event) => setAge(event.target.value)} />
    </label>
  )
}

/**
 * The name band's own edits: name, age, portrait and map token. None of them
 * is locked by Finalize, so the owner and the GM can change them at any stage.
 */
export function LubecNameBandEditor({ character, editing, onDone }: EditorProps) {
  const name = lubecCharacterName(character)
  return (
    <section className="lubec-panel lubec-name-editor" aria-labelledby="lubec-panel-name-band">
      <div className="lubec-section-head">
        <h3 id="lubec-panel-name-band">Name, age and portrait</h3>
        <button type="button" className="lubec-name-editor-done" onClick={onDone}>Done</button>
      </div>
      <div className="lubec-name-editor-body">
        <EntityMediaEditor
          entityName={name}
          portraitUrl={character.portraitUrl}
          portraitFocusX={character.portraitFocusX}
          portraitFocusY={character.portraitFocusY}
          tokenIcon={character.tokenIcon}
          portraitAltLabel="Current portrait"
          tokenButtonAriaLabel="Set map token"
          onUploadTokenImage={editing.uploadToken}
          onUploadPortraitImage={editing.uploadPortrait}
          onChange={editing.update}
        />
        <div className="lubec-name-fields">
          <label>
            Name
            <input value={character.name} onChange={(event) => editing.update({ name: event.target.value })} />
          </label>
          <LubecAgeField character={character} editing={editing} />
        </div>
      </div>
    </section>
  )
}

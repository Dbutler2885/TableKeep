import type { FormEvent } from 'react'
import type { LubecGear, LubecItemKind, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecSupplyName } from './gearLabels'
import { lubecFormPages, type LubecItemFields } from './itemForm'
import type { LubecFormSheet } from './itemSheet'
import { LubecItemFormBottom } from './LubecItemFormBottom'
import { LubecItemFormKind } from './LubecItemFormKind'
import { LubecCountPick, LubecKindTiles, LubecPictureField, LubecSizePick } from './LubecItemFormTop'
import { LubecNameField } from './LubecNameField'
import { LubecSheetHead } from './LubecSheetHead'
import type { LubecStockEntry } from './stockEntries'
import { useLubecMediaQuery } from './useLubecMediaQuery'

/** What the form's buttons do. */
export type LubecFormActions = {
  onForm: (form: LubecFormSheet) => void
  onPickStock: (entry: LubecStockEntry) => void
  onBrowse: (query: string) => void
  onSubmit: (paged: boolean) => void
  onBack: () => void
  onClose: () => void
}

type FormProps = {
  form: LubecFormSheet
  gear: LubecGear
  supplies: readonly LubecSupply[]
  supplyName: LubecSupplyName
  stock: readonly LubecStockEntry[]
  actions: LubecFormActions
}

// On a phone, and in a narrow window, the form is pages, so it never scrolls (captain, round 24).
const PAGED = '(max-width: 59.99rem)'

const countsUp = (kind: LubecItemKind) => kind !== 'armor' && kind !== 'holder'

function FormSteps({ form, onPage }: { form: LubecFormSheet; onPage: (page: number) => void }) {
  return (
    <div className="form-steps" role="tablist" aria-label="Form pages">
      {lubecFormPages(form.fields.kind).map(([id, label], k) => (
        <button key={id} type="button" role="tab" aria-selected={k === form.page} onClick={() => onPage(k)}><b>{k + 1}</b>{label}</button>
      ))}
    </div>
  )
}

type FootProps = { form: LubecFormSheet; paged: boolean; onPage: (page: number) => void; onBack: () => void }

// Back turns a page back on a phone; on the first page, or a wide screen, it returns where the form came from, or cancels.
function BackButton({ form, paged, onPage, onBack }: FootProps) {
  if (paged && form.page > 0) return <button className="btn line" type="button" onClick={() => onPage(form.page - 1)}>Back</button>
  return <button className="btn line" type="button" onClick={onBack}>{form.back ? 'Back' : 'Cancel'}</button>
}

// Next turns the page on a phone; the last page, or a wide screen, adds or saves.
function NextButton({ form, paged, onPage }: FootProps) {
  if (paged && form.page < lubecFormPages(form.fields.kind).length - 1) return <button className="btn" type="button" onClick={() => onPage(form.page + 1)}>Next</button>
  return <button className="btn" type="submit">{form.editId ? 'Save' : 'Add it'}</button>
}

/** The page a phone shows, by its id, or '' when every part shows at once. */
const pageId = (form: LubecFormSheet, paged: boolean) => (paged ? lubecFormPages(form.fields.kind)[form.page][0] : '')

/** The form after the player picks a kind, still on a page that kind has. */
const withKind = (form: LubecFormSheet, kind: LubecItemKind): LubecFormSheet =>
  ({ ...form, fields: { ...form.fields, kind }, page: Math.min(form.page, lubecFormPages(kind).length - 1) })

function FormTop({ form, onFields, stock, supplyName, actions }: Pick<FormProps, 'form' | 'stock' | 'supplyName' | 'actions'> & { onFields: (fields: LubecItemFields) => void }) {
  const { fields } = form
  return (
    <div className="form-top">
      <div className="name-pic">
        <LubecPictureField fields={fields} onFields={onFields} />
        <div className="name-col">
          <LubecNameField fields={fields} onName={(name) => onFields({ ...fields, name })} stock={form.editId ? null : stock} supplyName={supplyName} onPick={actions.onPickStock} onBrowse={actions.onBrowse} />
          <div className="stock-line">
            {form.editId ? null : <button type="button" className="link-btn" onClick={() => actions.onBrowse(fields.name.trim())}>Browse stock</button>}
            {fields.stock ? <p className="from-stock">From stock: <b>{fields.stock}</b>. A copy, so change anything.</p> : null}
          </div>
          <label className="field"><span className="label">Description</span><textarea rows={2} placeholder="What it looks like, where it came from" value={fields.note} onChange={(e) => onFields({ ...fields, note: e.target.value })} /></label>
        </div>
      </div>
      <LubecSizePick fields={fields} onFields={onFields} />
      {countsUp(fields.kind) ? <LubecCountPick fields={fields} onFields={onFields} /> : null}
    </div>
  )
}

/** The add and edit form: the kind tiles, the item, its kind's own page, and where it goes. One size for every kind, and it never scrolls. */
export function LubecItemForm(props: FormProps) {
  const { form, gear, supplies, actions } = props
  const editing = gear.items.find((x) => x.id === form.editId)
  const paged = useLubecMediaQuery(PAGED)
  const onFields = (fields: LubecItemFields) => actions.onForm({ ...form, fields })
  const onPage = (page: number) => actions.onForm({ ...form, page })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    actions.onSubmit(paged)
  }
  return (
    <form className="sheet-form item-form" noValidate onSubmit={submit} data-page={pageId(form, paged)} data-kind={form.fields.kind} data-mode={form.fields.mode}>
      <LubecSheetHead eyebrow={editing ? 'Edit item' : 'New item'} title={editing ? editing.name : 'Add an item'} onClose={actions.onClose} />
      {paged ? <FormSteps form={form} onPage={onPage} /> : null}
      <LubecKindTiles fields={form.fields} onKind={(kind) => actions.onForm(withKind(form, kind))} />
      <FormTop {...props} onFields={onFields} />
      <div className="form-kind">
        <LubecItemFormKind fields={form.fields} onFields={onFields} supplies={supplies} gear={gear} editId={form.editId} />
      </div>
      <LubecItemFormBottom fields={form.fields} onFields={onFields} gear={gear} editing={editing} />
      {form.error ? <p className="form-error" role="alert">{form.error}</p> : null}
      <div className="sheet-foot">
        <div className="actions">
          <BackButton form={form} paged={paged} onPage={onPage} onBack={actions.onBack} />
          <NextButton form={form} paged={paged} onPage={onPage} onBack={actions.onBack} />
        </div>
      </div>
    </form>
  )
}

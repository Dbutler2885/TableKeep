import { useState, type KeyboardEvent } from 'react'
import { makeId } from '../../character/characterFactories'
import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from '../gear/gearLabels'
import { lubecFieldsFromStock } from '../gear/itemForm'
import { lubecRefusedForm, type LubecFormSheet } from '../gear/itemSheet'
import { LubecItemForm } from '../gear/LubecItemForm'
import { LUBEC_SHEET_TITLE } from '../gear/LubecSheetHead'
import { LubecStockPicker } from '../gear/LubecStockPicker'
import { lubecStockEntries, type LubecStockEntry } from '../gear/stockEntries'
import { lubecSaveLibraryForm } from './gmItemForm'
import { saveLubecLibraryItem, type LubecItemsRecords } from './gmItemWrites'

type FormProps = {
  form: LubecFormSheet
  /** The campaign item being edited, or null for a new one. */
  was: LubecGmItem | null
  /** The campaign items, which the picker offers as "This campaign". */
  library: readonly LubecStockItem[]
  records: LubecItemsRecords
  onForm: (form: LubecFormSheet | null) => void
  /** Opens the card of the item just saved. */
  onSaved: (itemId: string) => void
  toast: (text: string) => void
}

// A campaign item belongs to no sheet, so a supply cannot be made here; the game's are offered.
const NO_MADE_SUPPLY = 'A new supply is made on a character\'s sheet. Here, pick one the game has.'

const CANNOT_SAVE = 'Could not save that. Nothing changed.'

// The form's Add it or Save: written whole, then its card opens. A refusal stays on the form.
async function submitLibraryForm({ form, was, records, onForm, onSaved, toast }: FormProps, paged: boolean, setSaving: (saving: boolean) => void) {
  const saved = lubecSaveLibraryForm(form, was, makeId)
  if (!saved.ok) return onForm(lubecRefusedForm(form, saved, paged))
  setSaving(true)
  try {
    await saveLubecLibraryItem(records, saved.item)
    onForm(null)
    onSaved(saved.item.id)
    toast(saved.toast)
  } catch {
    onForm({ ...form, error: CANNOT_SAVE })
  } finally {
    setSaving(false)
  }
}

function FormBody(props: FormProps & { saving: boolean; setSaving: (saving: boolean) => void }) {
  const { form, was, library, onForm, toast, saving, setSaving } = props
  const gear = { ...emptyLubecGear(), items: was ? [was as LubecItem] : [] }
  const supplies = lubecSupplies(gear)
  const supplyName = supplyNameIn(supplies)
  const stock = lubecStockEntries(library)
  const onPickStock = (x: LubecStockEntry) => {
    onForm({ ...form, fields: lubecFieldsFromStock(form.fields, x), browsing: null, error: null })
    toast(`${x.name}: copied in from stock.`)
  }
  if (form.browsing !== null) {
    return (
      <LubecStockPicker entries={stock} query={form.browsing} kind={form.fields.kind} supplyName={supplyName} onPick={onPickStock}
        onBack={() => onForm({ ...form, browsing: null })} onClose={() => onForm(null)} />
    )
  }
  const actions = {
    onForm,
    onPickStock,
    onBrowse: (query: string) => onForm({ ...form, browsing: query }),
    onSubmit: (paged: boolean) => { if (!saving) void submitLibraryForm(props, paged, setSaving) },
    onMakeSupply: () => {
      onForm({ ...form, error: NO_MADE_SUPPLY })
      return false
    },
    // The card it was opened from, or the list, is under the form, so Back and Cancel both close it.
    onBack: () => onForm(null),
    onClose: () => onForm(null),
  }
  return <LubecItemForm form={form} gear={gear} supplies={supplies} supplyName={supplyName} stock={stock} actions={actions} placed={false} />
}

/** The add and edit form for a campaign item, and the stock picker, in the sheet's overlay: the player's form with no "where it goes". */
export function LubecLibraryForm(props: FormProps) {
  const [saving, setSaving] = useState(false)
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onForm(null)
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={LUBEC_SHEET_TITLE} onKeyDown={closeOnEscape}>
      <div className={`item-sheet ${props.form.browsing === null ? 'form' : 'stock'}`}>
        <FormBody {...props} saving={saving} setSaving={setSaving} />
      </div>
    </div>
  )
}

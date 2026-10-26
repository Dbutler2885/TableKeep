import type { KeyboardEvent } from 'react'
import { makeId } from '../../character/characterFactories'
import { lubecUseOne, stepLubecLoaded, stepLubecQty, type LubecCountChange } from '../../ruleSets/lubec/gear/counts'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import { destOf } from './itemLabels'
import { lubecFieldsFromStock, lubecFormPages } from './itemForm'
import { lubecAddSheet, lubecBackSheet, lubecCardSheet, lubecEditSheet, lubecSaveForm, type LubecFormSheet, type LubecItemSheetState } from './itemSheet'
import { LubecItemCard } from './LubecItemCard'
import { LubecItemForm } from './LubecItemForm'
import { LUBEC_SHEET_TITLE } from './LubecSheetHead'
import { LubecSmallStuffList } from './LubecSmallStuffList'
import { LubecStockPicker } from './LubecStockPicker'
import { lubecStockEntries, type LubecStockEntry } from './stockEntries'

type SheetContext = {
  gear: LubecGear
  onGearChange: (gear: LubecGear) => void
  onSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
  /** The campaign's own list for the picker; empty until the GM Items tab fills it. */
  campaignStock: readonly LubecStockItem[]
}

type SheetProps = SheetContext & { sheet: LubecItemSheetState }

type CardSheet = Extract<LubecItemSheetState, { mode: 'view' }>

// Rule K4: a count that reaches 0 on a consumable uses it up, and it leaves the sheet and the card closes.
function countChanged(ctx: SheetContext, sheet: CardSheet, item: LubecItem, r: LubecCountChange) {
  if (!r.ok) return ctx.onSheet({ ...sheet, error: r.msg })
  ctx.onGearChange(r.gear)
  if (!r.gone) return ctx.onSheet({ ...sheet, error: null })
  ctx.onSheet(null)
  ctx.toast(`${item.name}: used up.`)
}

function CardMode({ sheet, item, ...ctx }: SheetContext & { sheet: CardSheet; item: LubecItem }) {
  const actions = {
    onStep: (field: 'qty' | 'loaded', d: number) => {
      if (field === 'qty') countChanged(ctx, sheet, item, stepLubecQty(ctx.gear, item, d))
      else countChanged(ctx, sheet, item, { ok: true, gear: stepLubecLoaded(ctx.gear, item, d), gone: false })
    },
    onUseOne: () => countChanged(ctx, sheet, item, lubecUseOne(ctx.gear, item)),
    onEdit: () => ctx.onSheet(lubecEditSheet(item, destOf(item))),
    onClose: () => ctx.onSheet(null),
  }
  return <LubecItemCard gear={ctx.gear} item={item} supplies={lubecSupplies(ctx.gear)} error={sheet.error} actions={actions} />
}

// The form's Add it or Save; a refusal stays on the form, turning a phone to the page it points at.
function submitForm(ctx: SheetContext, form: LubecFormSheet, paged: boolean) {
  const saved = lubecSaveForm(ctx.gear, form, makeId)
  if (!saved.ok) {
    const at = lubecFormPages(form.fields.kind).findIndex(([id]) => id === saved.page)
    return ctx.onSheet({ ...form, error: saved.msg, page: paged && at >= 0 ? at : form.page })
  }
  ctx.onGearChange(saved.gear)
  ctx.onSheet(saved.next)
  ctx.toast(saved.toast)
}

function FormMode({ sheet, ...ctx }: SheetContext & { sheet: LubecFormSheet }) {
  const supplies = lubecSupplies(ctx.gear)
  const supplyName = supplyNameIn(supplies)
  const stock = lubecStockEntries(ctx.campaignStock)
  const onPickStock = (x: LubecStockEntry) => {
    ctx.onSheet({ ...sheet, fields: lubecFieldsFromStock(sheet.fields, x), browsing: null, error: null })
    ctx.toast(`${x.name}: copied in from stock.`)
  }
  if (sheet.browsing !== null) {
    return (
      <LubecStockPicker entries={stock} query={sheet.browsing} kind={sheet.fields.kind} supplyName={supplyName} onPick={onPickStock}
        onBack={() => ctx.onSheet({ ...sheet, browsing: null })} onClose={() => ctx.onSheet(null)} />
    )
  }
  const actions = {
    onForm: ctx.onSheet,
    onPickStock,
    onBrowse: (query: string) => ctx.onSheet({ ...sheet, browsing: query }),
    onSubmit: (paged: boolean) => submitForm(ctx, sheet, paged),
    onBack: () => ctx.onSheet(lubecBackSheet(sheet.back)),
    onClose: () => ctx.onSheet(null),
  }
  return <LubecItemForm form={sheet} gear={ctx.gear} supplies={supplies} supplyName={supplyName} stock={stock} actions={actions} />
}

function SheetBody({ sheet, ...ctx }: SheetProps) {
  if (sheet.mode === 'form') return <FormMode sheet={sheet} {...ctx} />
  if (sheet.mode === 'small') {
    return <LubecSmallStuffList gear={ctx.gear} onOpen={(id) => ctx.onSheet(lubecCardSheet(id))} onAdd={() => ctx.onSheet(lubecAddSheet('backpack#small', { mode: 'small' }))} onClose={() => ctx.onSheet(null)} />
  }
  const item = ctx.gear.items.find((x) => x.id === sheet.itemId)
  return item ? <CardMode sheet={sheet} item={item} {...ctx} /> : null
}

// The sheet keeps one shape in every mode; the form and the stock picker are wider on a wide screen.
const sheetClass = (sheet: LubecItemSheetState) => {
  if (sheet.mode !== 'form') return sheet.mode === 'view' ? 'card' : 'small'
  return sheet.browsing === null ? 'form' : 'stock'
}

/** The item sheet over the Gear page: one dialog, in the sheet's overlay, whose mode is the card, small stuff, the form or the stock picker. */
export function LubecItemSheet(props: SheetProps) {
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onSheet(null)
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={LUBEC_SHEET_TITLE} onKeyDown={closeOnEscape}>
      <div className={`item-sheet ${sheetClass(props.sheet)}`}>
        <SheetBody {...props} />
      </div>
    </div>
  )
}

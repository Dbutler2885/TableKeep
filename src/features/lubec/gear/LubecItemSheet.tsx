import type { KeyboardEvent } from 'react'
import { makeId } from '../../character/characterFactories'
import { lubecSpendRound } from '../../ruleSets/lubec/gear/attack'
import { lubecUseOne, stepLubecLoaded, stepLubecQty, type LubecCountChange } from '../../ruleSets/lubec/gear/counts'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecWithTableSays, type LubecWielder } from '../../ruleSets/lubec/gear/minStrength'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecWithCheck, type LubecCheck } from '../../ruleSets/lubec/gear/strengthCheck'
import { lubecMakeSupply, lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import { destOf } from './itemLabels'
import { lubecFieldsFromStock } from './itemForm'
import { lubecCardMove } from './gearMoves'
import {
  lubecAddSheet,
  lubecBackSheet,
  lubecCardSheet,
  lubecEditSheet,
  lubecFormNeedsStrength,
  lubecRefusedForm,
  lubecSaveForm,
  type LubecCardSheet,
  type LubecFormSheet,
  type LubecItemSheetState,
} from './itemSheet'
import type { LubecPictureUpload } from './lubecPicked'
import type { LubecGearAcross } from './lubecGearWork'
import { LubecArmorPieces } from './LubecArmorPieces'
import { LubecItemCard } from './LubecItemCard'
import { LubecItemForm } from './LubecItemForm'
import { LUBEC_SHEET_TITLE } from './LubecSheetHead'
import { LubecSmallStuffList } from './LubecSmallStuffList'
import { LubecStockPicker } from './LubecStockPicker'
import { lubecStockEntries, type LubecStockEntry } from './stockEntries'
import { LUBEC_NO_HIDDEN_PICTURE } from '../../ruleSets/lubec/gear/containers'
import { lubecAskFirst, type LubecStrengthAsk } from './strengthAsk'
import { lubecTooHeavyDropped } from './strengthLabels'
import { attackRefusalText, attackToast } from './weaponFacts'
import { lubecCardLoadAct, lubecTakeOutAct, lubecLoadContext, type LubecLoadContext, type LubecLoadResult } from './loadActs'
import { LUBEC_SUPPLY_UNNAMED, lubecLoadButtons, lubecSupplyMadeToast, lubecTakeOutCost, type LubecLoadAct } from './loadLabels'
import type { LubecCardLoad } from './LubecItemCard'
import type { LubecGearGive } from './lubecGive'
import { useLubecCardGive } from './useLubecCardGive'
import { lubecOpenWithPicker } from './useLubecPictureUpload'
import { LubecCardPrompt } from './LubecLoadPrompts'
import type { LubecSupplyFieldKey } from './LubecSupplyField'

type SheetContext = {
  gear: LubecGear
  onGearChange: (gear: LubecGear) => void
  onSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
  /** The GM Items tab's campaign items, for the picker's "This campaign". */
  campaignStock: readonly LubecStockItem[]
  /** Drops the thing, which goes to the GM's Items tab; a refusal comes back to the card. `said` replaces the drop's own toast. */
  onDrop: (item: LubecItem, refused: (msg: string) => void, said?: string) => void
  /** Asks the character's owner for a Strength roll before a heavy thing comes onto them; null when nobody is asked. */
  onAsk: ((ask: LubecStrengthAsk) => void) | null
  /** True while a move is being saved. */
  busy: boolean
  /** The character's Strength and Handle, for a weapon's minimum Strength. */
  wielder: LubecWielder
  /** Gives things to other people's characters; null for a viewer who may not. */
  give: LubecGearGive | null
  /** The moves that leave this record; null when there are none. */
  across?: LubecGearAcross | null
  /** True while this is a carrier's own record, whose form offers only its pockets. */
  inCarrier?: boolean
  /** True while this is a hidden carrier's record, where a thing has no uploaded picture (spec 4.6). */
  inHidden?: boolean
  /** Uploads an item's picture; null or absent for a sheet that has none. */
  upload?: LubecPictureUpload | null
}

type SheetProps = SheetContext & { sheet: LubecItemSheetState }

type CardSheet = LubecCardSheet

// A hidden thing is never offered an upload.
const uploadOf = ({ upload = null, inHidden }: SheetContext) => (inHidden ? null : upload)

// Rule K4: a count that reaches 0 on a consumable uses it up, and it leaves the sheet and the card closes.
function countChanged(ctx: SheetContext, sheet: CardSheet, item: LubecItem, r: LubecCountChange) {
  if (!r.ok) return ctx.onSheet({ ...sheet, error: r.msg })
  ctx.onGearChange(r.gear)
  if (!r.gone) return ctx.onSheet({ ...sheet, error: null })
  ctx.onSheet(null)
  ctx.toast(`${item.name}: used up.`)
}

// The Move panel's Move it or Swap: one commit, then the card shows where it is now, with the panel closed.
// A heavy thing coming onto you asks its owner first (Rule E5).
function moveFromCard(ctx: SheetContext, sheet: CardSheet, item: LubecItem, value: string) {
  const refused = (msg: string) => ctx.onSheet({ ...sheet, error: msg })
  if (ctx.across?.move(item, value, refused)) return
  const r = lubecAskFirst(ctx.gear, lubecCardMove(ctx.gear, item, value), ctx.onAsk, sheet)
  if (!r) return
  if (r.kind === 'drop') return ctx.onDrop(item, refused)
  if (r.kind === 'refused') return refused(r.msg)
  ctx.onGearChange(r.gear)
  ctx.onSheet({ ...sheet, error: null, move: false })
  ctx.toast(r.toast)
}

// Attack or Fire: a firearm uses a round; Gear rolls no die and logs nothing, so the toast says to roll it at the table.
// An empty firearm stops with the empty-weapon prompt over the card.
function attackFromCard(ctx: SheetContext, sheet: CardSheet, item: LubecItem) {
  const r = lubecSpendRound(ctx.gear, item.id)
  if (!r.ok && r.why === 'empty') return ctx.onSheet({ ...sheet, error: null, prompt: { kind: 'empty', error: null } })
  if (!r.ok) return ctx.onSheet({ ...sheet, error: attackRefusalText(item) })
  ctx.onGearChange(r.gear)
  ctx.onSheet({ ...sheet, error: null })
  ctx.toast(attackToast(r.weapon))
}

// The card's Passed and Failed switch overrides the recorded roll and never touches Stress; an extra heavy thing that failed is dropped.
function checkFromCard(ctx: SheetContext, sheet: CardSheet, item: LubecItem, check: LubecCheck) {
  if (item.check === check) return
  if (check === 'fail' && item.weight === 'extra') return ctx.onDrop(item, (msg) => ctx.onSheet({ ...sheet, error: msg }), lubecTooHeavyDropped(item))
  ctx.onGearChange(lubecWithCheck(ctx.gear, item.id, check))
}

const loadContext = (gear: LubecGear): LubecLoadContext => lubecLoadContext(gear, makeId)

// One commit, then the card shows what B's shows after it, with its panels closed; a refusal stays on the card.
function loaded(ctx: SheetContext, sheet: CardSheet, r: LubecLoadResult) {
  if (!r.ok) return ctx.onSheet({ ...sheet, error: r.msg })
  ctx.onGearChange(r.gear)
  ctx.onSheet(lubecCardSheet(r.show))
  if (r.toast) ctx.toast(r.toast)
}

// The picker and "Take some out" open something; every other loading button commits at once.
function loadFromCard(ctx: SheetContext, sheet: CardSheet, item: LubecItem, act: LubecLoadAct) {
  if (act.type === 'load-pick') return ctx.onSheet({ ...sheet, error: null, prompt: { kind: 'load-pick', error: null } })
  if (act.type === 'takeout') return ctx.onSheet({ ...sheet, error: null, move: false, give: false, takeout: !sheet.takeout })
  loaded(ctx, sheet, lubecCardLoadAct(loadContext(ctx.gear), item, act))
}

function cardLoad(gear: LubecGear, sheet: CardSheet, item: LubecItem): LubecCardLoad {
  const { supplies, supplyName } = loadContext(gear)
  return {
    buttons: lubecLoadButtons({ gear, supplyName }, item, supplies),
    takeoutOpen: sheet.takeout === true,
    takeOutCost: (n) => lubecTakeOutCost(gear, item, n, supplies, supplyName),
  }
}

function CardMode({ sheet, item, ...ctx }: SheetContext & { sheet: CardSheet; item: LubecItem }) {
  const onEdit = () => ctx.onSheet(lubecEditSheet(item, destOf(item)))
  const give = useLubecCardGive(ctx.give, { sheet, item, onSheet: ctx.onSheet, toast: ctx.toast })
  const actions = {
    onToggleMove: () => ctx.onSheet({ ...sheet, error: null, takeout: false, give: false, move: !sheet.move }),
    onMove: (value: string) => moveFromCard(ctx, sheet, item, value),
    onDrop: () => ctx.onDrop(item, (msg) => ctx.onSheet({ ...sheet, error: msg })),
    onStep: (field: 'qty' | 'loaded', d: number) => {
      if (field === 'qty') countChanged(ctx, sheet, item, stepLubecQty(ctx.gear, item, d))
      else countChanged(ctx, sheet, item, { ok: true, gear: stepLubecLoaded(ctx.gear, item, d), gone: false })
    },
    onUseOne: () => countChanged(ctx, sheet, item, lubecUseOne(ctx.gear, item)),
    onCheck: (check: LubecCheck) => checkFromCard(ctx, sheet, item, check),
    onAttack: () => attackFromCard(ctx, sheet, item),
    onLoad: (act: LubecLoadAct) => loadFromCard(ctx, sheet, item, act),
    onTakeOut: (n: number) => loaded(ctx, sheet, lubecTakeOutAct(loadContext(ctx.gear), item, n)),
    onTableSays: (penalty: number | null) => ctx.onGearChange(lubecWithTableSays(ctx.gear, item.id, penalty)),
    onEdit,
    onAddPicture: uploadOf(ctx) ? () => lubecOpenWithPicker(onEdit) : null,
    onClose: () => ctx.onSheet(null),
  }
  return (
    <LubecItemCard
      gear={ctx.gear} item={item} supplies={lubecSupplies(ctx.gear)} wielder={ctx.wielder} error={sheet.error} moveOpen={sheet.move === true} busy={ctx.busy}
      load={cardLoad(ctx.gear, sheet, item)} give={give} actions={actions} moveGroups={ctx.across?.groups(item)}
    />
  )
}


// The form's Add it or Save. One that brings a heavy thing onto you asks its owner for a Strength roll first, and saves on Done (Rule E5).
function submitForm(ctx: SheetContext, form: LubecFormSheet, paged: boolean) {
  if (ctx.inHidden && form.fields.picture?.picturePath) return ctx.onSheet(lubecRefusedForm(form, { msg: LUBEC_NO_HIDDEN_PICTURE, page: 'top' }, paged))
  const saved = lubecSaveForm(ctx.gear, form, makeId)
  if (!saved.ok) return ctx.onSheet(lubecRefusedForm(form, saved, paged))
  if (ctx.onAsk && lubecFormNeedsStrength(ctx.gear, form)) return ctx.onAsk({ kind: 'form', form })
  ctx.onGearChange(saved.gear)
  ctx.onSheet(saved.next)
  ctx.toast(saved.toast)
}

// "+ Make a supply" (Rule L1): one known by that name in any letters is picked; a new one is stored on this sheet first.
function makeSupply(ctx: SheetContext, form: LubecFormSheet, field: LubecSupplyFieldKey, name: string): boolean {
  const r = lubecMakeSupply(ctx.gear, name, makeId)
  if (!r.ok) {
    ctx.onSheet({ ...form, error: LUBEC_SUPPLY_UNNAMED })
    return false
  }
  if (r.made) {
    ctx.onGearChange(r.gear)
    ctx.toast(lubecSupplyMadeToast(r.supply.name))
  }
  ctx.onSheet({ ...form, error: null, fields: { ...form.fields, [field]: r.supply.id } })
  return true
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
    onMakeSupply: (field: LubecSupplyFieldKey, name: string) => makeSupply(ctx, sheet, field, name),
    onBack: () => ctx.onSheet(lubecBackSheet(sheet.back)),
    onClose: () => ctx.onSheet(null),
  }
  const upload = uploadOf(ctx)
  return <LubecItemForm form={sheet} gear={ctx.gear} supplies={supplies} supplyName={supplyName} stock={stock} actions={actions} onYou={!ctx.inCarrier} pictures={upload && { upload, toast: ctx.toast }} />
}

function SheetBody({ sheet, ...ctx }: SheetProps) {
  if (sheet.mode === 'form') return <FormMode sheet={sheet} {...ctx} />
  if (sheet.mode === 'pieces') return <LubecArmorPieces gear={ctx.gear} part={sheet.part} onPick={(id) => ctx.onSheet(lubecCardSheet(id))} onClose={() => ctx.onSheet(null)} />
  if (sheet.mode === 'small') {
    return <LubecSmallStuffList gear={ctx.gear} onOpen={(id) => ctx.onSheet(lubecCardSheet(id))} onAdd={() => ctx.onSheet(lubecAddSheet('backpack#small', { mode: 'small' }))} onClose={() => ctx.onSheet(null)} />
  }
  const item = ctx.gear.items.find((x) => x.id === sheet.itemId)
  return item ? <CardMode sheet={sheet} item={item} {...ctx} /> : null
}

// The sheet keeps one shape in every mode; the form and the stock picker are wider on a wide screen, and "which piece?" fits its words.
const SHEET_CLASS = { view: 'card', small: 'small', pieces: 'prompt' } as const

const sheetClass = (sheet: LubecItemSheetState) => {
  if (sheet.mode !== 'form') return SHEET_CLASS[sheet.mode]
  return sheet.browsing === null ? 'form' : 'stock'
}

/** The item sheet over the Gear page: one dialog, in the sheet's overlay, whose mode is the card, small stuff, the form, the stock picker or "which piece?"; and the card's prompt over it. */
export function LubecItemSheet(props: SheetProps) {
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onSheet(null)
  }
  return (
    <>
      <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={LUBEC_SHEET_TITLE} onKeyDown={closeOnEscape}>
        <div className={`item-sheet ${sheetClass(props.sheet)}`}>
          <SheetBody {...props} />
        </div>
      </div>
      {props.sheet.mode === 'view' ? <LubecCardPrompt gear={props.gear} sheet={props.sheet} onGearChange={props.onGearChange} onSheet={props.onSheet} toast={props.toast} /> : null}
    </>
  )
}

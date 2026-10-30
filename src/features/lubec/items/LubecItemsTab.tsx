// The GM's Items tab for a Lubec campaign (spec 8): the campaign items,
// which are every picker's "This campaign", and what players dropped, in
// the NPCs tab's list-and-detail layout, with B's rows, card and form inside.
// Only the GM sees it; the shell gives a player no Items tab.

import { ChevronLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { db } from '../../../firebase'
import type { Role } from '../../../types/app'
import { makeId } from '../../character/characterFactories'
import { useCharacterStore } from '../../character/characterStore/useCharacterStore'
import { useResponsiveCharacterLayout } from '../../character/hooks/useResponsiveCharacterLayout'
import { lubecCharacterStore } from '../../ruleSets/lubec/characterParser'
import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { lubecMoveStoreOf } from '../gear/lubecGearDrop'
import type { LubecFormSheet } from '../gear/itemSheet'
import { lubecOpenWithPicker } from '../gear/useLubecPictureUpload'
import { useLubecToast } from '../gear/useLubecToast'
import { LubecRoughFilter } from '../LubecRoughFilter'
import { lubecCharacterName } from '../lubecNames'
import { lubecBulkDeletedText } from './droppedSelection'
import { lubecLibraryEditSheet, lubecLibraryAddSheet } from './gmItemForm'
import { lubecGmItemById, lubecLibraryStock, type LubecItemsFilter } from './gmItemsList'
import { deleteLubecGmItem, giveLubecGmItem, keepLubecGmItem, type LubecItemsRecords } from './gmItemWrites'
import type { LubecDroppedPicks } from './LubecDroppedPicks'
import { LubecGmItemCard, type LubecGiveTarget, type LubecGmItemActions } from './LubecGmItemCard'
import { LubecItemsRoster } from './LubecItemsRoster'
import { LubecLibraryForm } from './LubecLibraryForm'
import { useDroppedBulkDelete, useDroppedSelection } from './useDroppedSelection'
import { useLubecGmItems } from './useLubecGmItems'
import '../gear/lubecGear.css'
import '../gear/lubecGearSheet.css'
import './lubecItemsTab.css'

export type LubecItemsTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
  currentUserId: string
  gmUserId: string | null
  setError: (message: string) => void
}

// The characters an item can arrive on, which are the ones in play, from the
// shared store, which also holds each one's waiting save for the move.
function useGiveTargets({ campaignId, groupId, role, currentUserId, gmUserId, setError }: LubecItemsTabProps) {
  const store = useCharacterStore({ ruleSet: lubecCharacterStore, campaignId, groupId, userId: currentUserId, role, gmUserId, setError, enabled: true })
  const targets: LubecGiveTarget[] = store.characters
    .filter((character) => character.creationStatus === 'active')
    .map((character) => ({ id: character.id, name: lubecCharacterName(character) }))
  return { targets, moveStore: lubecMoveStoreOf(store) }
}

type Refusal = { itemId: string; msg: string }

type ActionsOptions = {
  records: LubecItemsRecords
  give: ReturnType<typeof useGiveTargets>
  toast: (text: string) => void
  select: (itemId: string | null) => void
  openForm: (form: LubecFormSheet) => void
}

const CANNOT_SAVE = 'Could not save that. Nothing changed.'

// One write at a time: a refusal stays on the card it came from, and `done` follows a write that went through.
function useWriteRunner() {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const run = async (item: LubecGmItem, write: () => Promise<{ ok: boolean; msg?: string } | void>, done: () => void) => {
    setBusy(true)
    setRefusal(null)
    const result = await write().catch(() => ({ ok: false, msg: CANNOT_SAVE }))
    setBusy(false)
    if (result && !result.ok) setRefusal({ itemId: item.id, msg: result.msg ?? CANNOT_SAVE })
    else done()
  }
  return { busy, refusal, run }
}

// A campaign item is edited, and given a picture through the same form; a dropped item is neither.
function editActions(item: LubecGmItem, openForm: ActionsOptions['openForm']): Pick<LubecGmItemActions, 'onEdit' | 'onAddPicture'> {
  if (item.status !== 'library') return { onEdit: null, onAddPicture: null }
  const onEdit = () => openForm(lubecLibraryEditSheet(item))
  return { onEdit, onAddPicture: () => lubecOpenWithPicker(onEdit) }
}

// The card's actions for one item: Give to... lands it by the arrival rule; a dropped item leaves the list when given.
function itemActions(item: LubecGmItem, { records, give, toast, select, openForm }: ActionsOptions, run: ReturnType<typeof useWriteRunner>['run']): LubecGmItemActions {
  const library = item.status === 'library'
  const nameOf = (id: string) => give.targets.find((t) => t.id === id)?.name ?? 'them'
  return {
    ...editActions(item, openForm),
    onGive: (characterId) => void run(item, () => giveLubecGmItem(records, item, characterId, give.moveStore, makeId()), () => {
      toast(`Gave ${item.name} to ${nameOf(characterId)}. It lands on ${nameOf(characterId)}'s sheet.`)
      if (!library) select(null)
    }),
    onKeep: library ? null : () => void run(item, () => keepLubecGmItem(records, item), () => toast(`${item.name}: kept as a campaign item.`)),
    onDelete: () => void run(item, () => deleteLubecGmItem(records, item), () => {
      toast(`Deleted ${item.name}.`)
      select(null)
    }),
  }
}

type DetailProps = {
  item: LubecGmItem | null
  isSinglePane: boolean
  onBack: () => void
  card: (item: LubecGmItem) => ReactNode
}

function Detail({ item, isSinglePane, onBack, card }: DetailProps) {
  return (
    <div className="monsters-detail lubec-items-detail">
      <div className="monsters-detail-inner">
        {isSinglePane ? (
          <div className="monster-detail-header-row">
            <button type="button" className="back-link monster-mobile-back" onClick={onBack} aria-label="Back to the items"><ChevronLeft size={16} /></button>
          </div>
        ) : null}
        {item ? card(item) : <p className="note">Pick an item to see it.</p>}
      </div>
    </div>
  )
}

type Selection = ReturnType<typeof useItemsSelection>

// The chosen item, which on a narrow screen is the one pane shown; choosing none goes back to the list.
function useItemsSelection(items: LubecGmItem[] | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const layout = useResponsiveCharacterLayout({ hasOpenDetail: selectedId !== null })
  const select = (itemId: string | null) => {
    setSelectedId(itemId)
    layout.setPaneView(itemId ? 'detail' : 'list')
  }
  return { selectedId, selected: lubecGmItemById(items, selectedId), select, layout }
}

type CardForProps = { item: LubecGmItem; give: ReturnType<typeof useGiveTargets>; writes: ReturnType<typeof useWriteRunner>; options: ActionsOptions }

// The chosen item's card, with a refusal only when it came from this item.
function CardFor({ item, give, writes, options }: CardForProps) {
  const error = writes.refusal?.itemId === item.id ? writes.refusal.msg : null
  return <LubecGmItemCard key={item.id} item={item} targets={give.targets} busy={writes.busy} error={error} actions={itemActions(item, options, writes.run)} />
}

type FormOverProps = Omit<Parameters<typeof LubecLibraryForm>[0], 'form' | 'was' | 'library'> & { form: LubecFormSheet | null; items: LubecGmItem[] | null }

// The add and edit form over the tab, while one is open.
function FormOver({ form, items, ...props }: FormOverProps) {
  if (!form) return null
  return <LubecLibraryForm form={form} was={lubecGmItemById(items, form.editId)} library={lubecLibraryStock(items ?? [])} {...props} />
}

function Toast({ toast }: { toast: ReturnType<typeof useLubecToast> }) {
  return <div className={`toast${toast.shown ? ' show' : ''}`} role="status" aria-live="polite">{toast.text}</div>
}

// The dropped items' ticks, which outlive the list pane on a narrow screen; deleting the open item closes its card.
function useDroppedPicks(records: LubecItemsRecords, items: LubecGmItem[] | null, selection: Selection, toast: (text: string) => void): LubecDroppedPicks {
  const picked = useDroppedSelection(items)
  const bulk = useDroppedBulkDelete(records, picked, (gone) => {
    toast(lubecBulkDeletedText(gone))
    if (gone.some((item) => item.id === selection.selectedId)) selection.select(null)
  })
  return { selection: picked, bulk }
}

type PanesProps = { items: LubecGmItem[] | null; selection: Selection; picks: LubecDroppedPicks; card: (item: LubecGmItem) => ReactNode; onAdd: () => void }

// The list and the chosen item side by side, or one of them on a narrow screen.
function Panes({ items, selection, picks, card, onAdd }: PanesProps) {
  const [filter, setFilter] = useState<LubecItemsFilter>('all')
  const { layout, selectedId, select } = selection
  return (
    <>
      {layout.showListPane ? <LubecItemsRoster items={items} filter={filter} onFilter={setFilter} selectedId={selectedId} onSelect={select} onAdd={onAdd} picks={picks} /> : null}
      {layout.showDetailPane ? <Detail item={selection.selected} isSinglePane={layout.isSinglePane} onBack={() => select(null)} card={card} /> : null}
    </>
  )
}

/** The GM Items tab: the list on the left, the chosen item's card on the right, and the add and edit form over them. */
export function LubecItemsTab(props: LubecItemsTabProps) {
  const records = { db, scope: { campaignId: props.campaignId, groupId: props.groupId } }
  const items = useLubecGmItems(records.scope, 'all', props.setError)
  const give = useGiveTargets(props)
  const [form, setForm] = useState<LubecFormSheet | null>(null)
  const toast = useLubecToast()
  const writes = useWriteRunner()
  const selection = useItemsSelection(items)
  const picks = useDroppedPicks(records, items, selection, toast.show)
  const options = { records, give, toast: toast.show, select: selection.select, openForm: setForm }
  return (
    <div className="maps-layout monsters-layout lubec-items-tab lubec-gear" aria-busy={writes.busy || picks.bulk.busy}>
      <LubecRoughFilter />
      <Panes items={items} selection={selection} picks={picks} card={(item) => <CardFor item={item} give={give} writes={writes} options={options} />} onAdd={() => setForm(lubecLibraryAddSheet())} />
      <FormOver form={form} items={items} records={records} onForm={setForm} onSaved={selection.select} toast={toast.show} />
      <Toast toast={toast} />
    </div>
  )
}

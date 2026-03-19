import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  SquareStack,
  Dices,
  GripVertical,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { collection, addDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, limit as firestoreLimit } from 'firebase/firestore'
import { db } from '../../firebase'
import { MOBILE_BREAKPOINT } from '../../constants/layout'
import { useTables } from './useTables'
import { useEntityPickers } from './useEntityPickers'
import type { EntitySummary } from './useEntityPickers'
import type {
  TableRecord,
  TableBlock,
  TableQty,
  RollHistoryEntry,
  RollStep,
  ResolvedBlock,
} from '../../types/app'

type TablesTabProps = {
  campaignId: string
}

const entityName = (list: EntitySummary[], id: string): string =>
  list.find((e) => e.id === id)?.name ?? id

const DIE_OPTIONS = [4, 6, 8, 10, 12, 20, 100]
const CUSTOM_DIE_OPTION = 'custom'

const diceLabel = (dice: { count: number; sides: number }) =>
  `${dice.count}d${dice.sides}`

const rowCount = (dice: { count: number; sides: number }) =>
  dice.sides * dice.count - dice.count + 1

const minResult = (dice: { count: number; sides: number }) => dice.count

const isPresetDieOption = (sides: number) => DIE_OPTIONS.includes(sides)

const qtyLabel = (qty?: TableQty): string => {
  if (!qty) return '1'
  if ('fixed' in qty) return String(qty.fixed)
  const mod = qty.modifier ? (qty.modifier > 0 ? `+${qty.modifier}` : String(qty.modifier)) : ''
  return `${qty.count}d${qty.sides}${mod}`
}

const rollDice = (count: number, sides: number): number => {
  let total = 0
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1
  }
  return total
}

const resolveQty = (qty?: TableQty): number => {
  if (!qty) return 1
  if ('fixed' in qty) return qty.fixed
  return rollDice(qty.count, qty.sides) + (qty.modifier ?? 0)
}

const makeTable = (): TableRecord => {
  const dice = { count: 1, sides: 6 }
  return {
    id: crypto.randomUUID(),
    name: 'New Table',
    tags: [],
    dice,
    rows: Array.from({ length: rowCount(dice) }, () => ({ blocks: [] })),
    createdAt: null,
    updatedAt: null,
  }
}

const blockTypeLabel = (type: TableBlock['type']) => {
  switch (type) {
    case 'monster': return 'Monster'
    case 'npc': return 'NPC'
    case 'item': return 'Item'
    case 'table': return 'Table'
    case 'text': return 'Text'
  }
}

export function TablesTab({ campaignId }: TablesTabProps) {
  const { tables, tablesLoading, addTable, updateTable, deleteTable } = useTables(campaignId)
  const { monsters: monsterList, npcs: npcList, items: itemList } = useEntityPickers(campaignId)

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [panelMode, setPanelMode] = useState<'editor' | 'results'>('editor')
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null)
  const [diceSidesCustomMode, setDiceSidesCustomMode] = useState(false)
  const previousSelectedTableIdRef = useRef('')
  // Copy-to-rows mode: source row index + set of target row indices
  const [copySourceIdx, setCopySourceIdx] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set())
  const [deleteCandidate, setDeleteCandidate] = useState<TableRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [tagFilterSearch, setTagFilterSearch] = useState('')
  // Tag manager modal state
  const [tagsModalOpen, setTagsModalOpen] = useState(false)
  const [tagSelection, setTagSelection] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [tagSearch, setTagSearch] = useState('')
  // Roll history
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>([])
  const [rollHistoryIdx, setRollHistoryIdx] = useState(0)

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setMobileView('list')
    }
    handler()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId],
  )

  // Load roll history when a table is selected in results mode
  useEffect(() => {
    if (!selectedTableId || !campaignId) {
      setRollHistory([])
      return
    }
    const historyRef = collection(db, 'campaigns', campaignId, 'tables', selectedTableId, 'history')
    const q = query(historyRef, orderBy('timestamp', 'desc'), firestoreLimit(50))
    const unsub = onSnapshot(q, (snap) => {
      const entries = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          timestamp: data.timestamp,
          steps: Array.isArray(data.steps) ? data.steps as RollStep[] : [],
          complete: data.complete === true,
        } satisfies RollHistoryEntry
      })
      setRollHistory(entries)
    })
    return () => unsub()
  }, [campaignId, selectedTableId])

  // Derived data
  const allTags = useMemo(
    () => Array.from(new Set(tables.flatMap((t) => t.tags))).sort((a, b) => a.localeCompare(b)),
    [tables],
  )

  const visibleTables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return tables
      .filter((t) => {
        if (tagFilter !== 'all' && !t.tags.includes(tagFilter)) return false
        if (!q) return true
        const haystack = [t.name, t.tags.join(' ')].join(' ').toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tables, searchQuery, tagFilter])

  const tagsInUse = useMemo(() => {
    const used = new Set<string>()
    visibleTables.forEach((t) => t.tags.forEach((tag) => used.add(tag)))
    return allTags.filter((tag) => used.has(tag))
  }, [allTags, visibleTables])

  // Keep selection valid
  useEffect(() => {
    setSelectedTableId((current) => {
      if (tables.length === 0) return ''
      return tables.some((t) => t.id === current) ? current : ''
    })
  }, [tables])

  useEffect(() => {
    if (selectedTableId === previousSelectedTableIdRef.current) return
    previousSelectedTableIdRef.current = selectedTableId
    setDiceSidesCustomMode(selectedTable ? !isPresetDieOption(selectedTable.dice.sides) : false)
  }, [selectedTable, selectedTableId])

  // Reset tag selection when tags modal opens
  useEffect(() => {
    if (!tagsModalOpen) return
    setTagSelection(selectedTable?.tags ?? [])
    setNewTagInput('')
    setTagSearch('')
  }, [tagsModalOpen, selectedTable])

  const showListPane = !isMobile || mobileView === 'list'
  const showDetailPane = !isMobile || mobileView === 'detail'

  // --- Actions ---

  const handleAddTable = () => {
    const next = makeTable()
    addTable(next)
    setSelectedTableId(next.id)
    setPanelMode('editor')
    setEditingRowIdx(null)
    if (isMobile) setMobileView('detail')
  }

  const handleSelectTable = (id: string) => {
    setSelectedTableId(id)
    setPanelMode('editor')
    setEditingRowIdx(null)
    cancelCopyMode()
    if (isMobile) setMobileView('detail')
  }

  const handleRollTable = (id: string) => {
    const table = tables.find((t) => t.id === id)
    if (!table) return
    setSelectedTableId(id)
    setPanelMode('results')
    if (isMobile) setMobileView('detail')
    performRoll(table)
  }

  const performRoll = (table: TableRecord) => {
    const roll = rollDice(table.dice.count, table.dice.sides)
    const rowIdx = roll - minResult(table.dice)
    const row = table.rows[rowIdx]
    if (!row) return

    const resolvedBlocks: ResolvedBlock[] = row.blocks.map((block) => {
      switch (block.type) {
        case 'monster':
          return { type: 'monster', monsterId: block.monsterId, resolvedQty: resolveQty(block.qty) }
        case 'npc':
          return { type: 'npc', npcId: block.npcId, resolvedQty: resolveQty(block.qty) }
        case 'item':
          return { type: 'item', itemId: block.itemId, resolvedQty: resolveQty(block.qty) }
        case 'table':
          return { type: 'table', tableId: block.tableId }
        case 'text':
          return { type: 'text', content: block.content }
      }
    })

    const hasNestedTable = resolvedBlocks.some((b) => b.type === 'table')

    const step: RollStep = {
      tableId: table.id,
      tableName: table.name,
      rollValue: roll,
      resolvedBlocks,
    }

    const entry: Omit<RollHistoryEntry, 'id'> = {
      timestamp: serverTimestamp(),
      steps: [step],
      complete: !hasNestedTable,
    }

    // Persist to Firestore
    void addDoc(
      collection(db, 'campaigns', campaignId, 'tables', table.id, 'history'),
      entry,
    ).then(() => {
      setRollHistoryIdx(0)
    })
  }

  const handleRollNested = async (historyEntry: RollHistoryEntry, nestedTableId: string) => {
    const nestedTable = tables.find((t) => t.id === nestedTableId)
    if (!nestedTable || !selectedTable) return

    const roll = rollDice(nestedTable.dice.count, nestedTable.dice.sides)
    const rowIdx = roll - minResult(nestedTable.dice)
    const row = nestedTable.rows[rowIdx]
    if (!row) return

    const resolvedBlocks: ResolvedBlock[] = row.blocks.map((block) => {
      switch (block.type) {
        case 'monster':
          return { type: 'monster', monsterId: block.monsterId, resolvedQty: resolveQty(block.qty) }
        case 'npc':
          return { type: 'npc', npcId: block.npcId, resolvedQty: resolveQty(block.qty) }
        case 'item':
          return { type: 'item', itemId: block.itemId, resolvedQty: resolveQty(block.qty) }
        case 'table':
          return { type: 'table', tableId: block.tableId }
        case 'text':
          return { type: 'text', content: block.content }
      }
    })

    const newStep: RollStep = {
      tableId: nestedTable.id,
      tableName: nestedTable.name,
      rollValue: roll,
      resolvedBlocks,
    }

    const updatedSteps = [...historyEntry.steps, newStep]
    const stillHasUnresolved = updatedSteps.some((s) =>
      s.resolvedBlocks.some((b) => b.type === 'table' && !updatedSteps.some((later) => later.tableId === b.tableId)),
    )

    await setDoc(
      doc(db, 'campaigns', campaignId, 'tables', selectedTable.id, 'history', historyEntry.id),
      { steps: updatedSteps, complete: !stillHasUnresolved },
      { merge: true },
    )
  }

  const referencingTables = useMemo(() => {
    if (!deleteCandidate) return []
    return tables.filter((t) =>
      t.id !== deleteCandidate.id
      && t.rows.some((row) =>
        row.blocks.some((b) => b.type === 'table' && b.tableId === deleteCandidate.id),
      ),
    )
  }, [deleteCandidate, tables])

  const handleDeleteConfirm = () => {
    if (!deleteCandidate) return
    deleteTable(deleteCandidate.id)
    if (selectedTableId === deleteCandidate.id) {
      setSelectedTableId('')
      setEditingRowIdx(null)
    }
    setDeleteCandidate(null)
  }

  const handleDiceChange = (field: 'count' | 'sides', value: number) => {
    if (!selectedTable) return
    const newDice = { ...selectedTable.dice, [field]: value }
    const newRowCount = rowCount(newDice)
    const currentRows = selectedTable.rows
    const newRows = Array.from({ length: newRowCount }, (_, i) =>
      currentRows[i] ?? { blocks: [] },
    )
    updateTable(selectedTable.id, { dice: newDice, rows: newRows })
    if (editingRowIdx !== null && editingRowIdx >= newRowCount) {
      setEditingRowIdx(null)
    }
  }

  const addBlockToRow = (rowIdx: number, blockType: TableBlock['type']) => {
    if (!selectedTable) return
    let newBlock: TableBlock
    switch (blockType) {
      case 'monster': newBlock = { type: 'monster', monsterId: '', qty: { fixed: 1 } }; break
      case 'npc': newBlock = { type: 'npc', npcId: '', qty: { fixed: 1 } }; break
      case 'item': newBlock = { type: 'item', itemId: '', qty: { fixed: 1 } }; break
      case 'table': newBlock = { type: 'table', tableId: '' }; break
      case 'text': newBlock = { type: 'text', content: '' }; break
    }
    const row = selectedTable.rows[rowIdx]
    const newRows = [...selectedTable.rows]
    newRows[rowIdx] = { blocks: [...row.blocks, newBlock] }
    updateTable(selectedTable.id, { rows: newRows })
  }

  const updateBlockInRow = (rowIdx: number, blockIdx: number, block: TableBlock) => {
    if (!selectedTable) return
    const row = selectedTable.rows[rowIdx]
    const newBlocks = [...row.blocks]
    newBlocks[blockIdx] = block
    const newRows = [...selectedTable.rows]
    newRows[rowIdx] = { blocks: newBlocks }
    updateTable(selectedTable.id, { rows: newRows })
  }

  const removeBlockFromRow = (rowIdx: number, blockIdx: number) => {
    if (!selectedTable) return
    const row = selectedTable.rows[rowIdx]
    const newRows = [...selectedTable.rows]
    newRows[rowIdx] = { blocks: row.blocks.filter((_, i) => i !== blockIdx) }
    updateTable(selectedTable.id, { rows: newRows })
  }

  const moveBlockInRow = (rowIdx: number, blockIdx: number, direction: -1 | 1) => {
    if (!selectedTable) return
    const row = selectedTable.rows[rowIdx]
    const newIdx = blockIdx + direction
    if (newIdx < 0 || newIdx >= row.blocks.length) return
    const newBlocks = [...row.blocks]
    ;[newBlocks[blockIdx], newBlocks[newIdx]] = [newBlocks[newIdx], newBlocks[blockIdx]]
    const newRows = [...selectedTable.rows]
    newRows[rowIdx] = { blocks: newBlocks }
    updateTable(selectedTable.id, { rows: newRows })
  }

  const startCopyMode = (sourceIdx: number) => {
    setCopySourceIdx(sourceIdx)
    setCopyTargets(new Set())
  }

  const cancelCopyMode = () => {
    setCopySourceIdx(null)
    setCopyTargets(new Set())
  }

  const toggleCopyTarget = (rowIdx: number) => {
    setCopyTargets((prev) => {
      const next = new Set(prev)
      if (next.has(rowIdx)) next.delete(rowIdx)
      else next.add(rowIdx)
      return next
    })
  }

  const applyCopy = () => {
    if (!selectedTable || copySourceIdx === null || copyTargets.size === 0) return
    const sourceBlocks = selectedTable.rows[copySourceIdx].blocks
    const newRows = [...selectedTable.rows]
    for (const idx of copyTargets) {
      newRows[idx] = { blocks: sourceBlocks.map((b) => ({ ...b })) }
    }
    updateTable(selectedTable.id, { rows: newRows })
    cancelCopyMode()
  }

  // Tag management
  const addTagToSelection = (tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed || tagSelection.includes(trimmed)) return
    setTagSelection((current) => [...current, trimmed])
  }

  const removeTagFromSelection = (tag: string) => {
    setTagSelection((current) => current.filter((t) => t !== tag))
  }

  const saveTags = () => {
    if (!selectedTable) return
    const nextTags = Array.from(new Set(tagSelection.map((t) => t.trim().toLowerCase()).filter(Boolean)))
    updateTable(selectedTable.id, { tags: nextTags })
    setTagsModalOpen(false)
  }

  // --- Render helpers ---

  const blockSummaryText = (block: TableBlock): { text: string; bold: boolean } => {
    switch (block.type) {
      case 'monster': {
        const name = block.monsterId ? entityName(monsterList, block.monsterId) : '(pick monster)'
        const qty = qtyLabel(block.qty)
        return { text: qty !== '1' ? `${name} x${qty}` : name, bold: true }
      }
      case 'npc': {
        const name = block.npcId ? entityName(npcList, block.npcId) : '(pick NPC)'
        const qty = qtyLabel(block.qty)
        return { text: qty !== '1' ? `${name} x${qty}` : name, bold: false }
      }
      case 'item': {
        const name = block.itemId ? entityName(itemList, block.itemId) : '(pick item)'
        const qty = qtyLabel(block.qty)
        return { text: qty !== '1' ? `${name} x${qty}` : name, bold: false }
      }
      case 'table': {
        const ref = tables.find((t) => t.id === block.tableId)
        return { text: ref?.name || '(pick table)', bold: false }
      }
      case 'text':
        return { text: block.content || '(empty text)', bold: false }
    }
  }

  const renderBlockEditor = (rowIdx: number, blockIdx: number, block: TableBlock) => {
    const update = (b: TableBlock) => updateBlockInRow(rowIdx, blockIdx, b)
    return (
      <div key={blockIdx} className="table-block-editor-row">
        <div className="table-block-editor-grip">
          <button
            type="button"
            disabled={blockIdx === 0}
            onClick={() => moveBlockInRow(rowIdx, blockIdx, -1)}
            aria-label="Move up"
          >
            <GripVertical size={14} />
          </button>
        </div>
        <div className="table-block-editor-fields">
          <span className="table-block-type-badge">{blockTypeLabel(block.type)}</span>
          {block.type === 'text' ? (
            <input
              type="text"
              value={block.content}
              onChange={(e) => update({ ...block, content: e.target.value })}
              placeholder="Enter text..."
              className="table-block-text-input"
            />
          ) : block.type === 'table' ? (
            <select
              value={block.tableId}
              onChange={(e) => update({ ...block, tableId: e.target.value })}
            >
              <option value="">-- Select table --</option>
              {tables
                .filter((t) => t.id !== selectedTable?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
          ) : (
            <>
              {block.type === 'monster' ? (
                <select
                  value={block.monsterId}
                  onChange={(e) => update({ ...block, monsterId: e.target.value })}
                  className="table-block-id-input"
                >
                  <option value="">-- Select monster --</option>
                  {monsterList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : block.type === 'npc' ? (
                <select
                  value={block.npcId}
                  onChange={(e) => update({ ...block, npcId: e.target.value })}
                  className="table-block-id-input"
                >
                  <option value="">-- Select NPC --</option>
                  {npcList.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              ) : block.type === 'item' ? (
                <select
                  value={block.itemId}
                  onChange={(e) => update({ ...block, itemId: e.target.value })}
                  className="table-block-id-input"
                >
                  <option value="">-- Select item --</option>
                  {itemList.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              ) : null}
              {'qty' in block ? (
                <div className="table-block-qty-row">
                  <label>Qty:</label>
                  <select
                    value={block.qty && 'fixed' in block.qty ? 'fixed' : 'dice'}
                    onChange={(e) => {
                      const mode = e.target.value
                      if (mode === 'fixed') {
                        update({ ...block, qty: { fixed: 1 } } as TableBlock)
                      } else {
                        update({ ...block, qty: { count: 1, sides: 6 } } as TableBlock)
                      }
                    }}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="dice">Dice</option>
                  </select>
                  {block.qty && 'fixed' in block.qty ? (
                    <input
                      type="number"
                      min={1}
                      value={block.qty.fixed}
                      onChange={(e) =>
                        update({ ...block, qty: { fixed: Math.max(1, Number(e.target.value) || 1) } } as TableBlock)
                      }
                      className="table-block-qty-num"
                    />
                  ) : block.qty && 'count' in block.qty ? (
                    <div className="table-block-dice-inputs">
                      <input
                        type="number"
                        min={1}
                        value={block.qty.count}
                        onChange={(e) =>
                          update({ ...block, qty: { ...block.qty as { count: number; sides: number; modifier?: number }, count: Math.max(1, Number(e.target.value) || 1) } } as TableBlock)
                        }
                        className="table-block-qty-num"
                      />
                      <span>d</span>
                      <select
                        value={(block.qty as { count: number; sides: number }).sides}
                        onChange={(e) =>
                          update({ ...block, qty: { ...block.qty as { count: number; sides: number; modifier?: number }, sides: Number(e.target.value) } } as TableBlock)
                        }
                      >
                        {DIE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input
                        type="number"
                        value={(block.qty as { count: number; sides: number; modifier?: number }).modifier ?? 0}
                        onChange={(e) =>
                          update({ ...block, qty: { ...block.qty as { count: number; sides: number; modifier?: number }, modifier: Number(e.target.value) || 0 } } as TableBlock)
                        }
                        className="table-block-qty-num"
                        placeholder="+/-"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        <button
          type="button"
          className="table-block-delete-btn"
          onClick={() => removeBlockFromRow(rowIdx, blockIdx)}
          aria-label="Remove block"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  const renderResolvedBlock = (block: ResolvedBlock, historyEntry: RollHistoryEntry) => {
    switch (block.type) {
      case 'monster':
        return (
          <div className="table-result-block monster">
            <span className="table-result-type">Monster</span>
            <span className="table-result-name">{entityName(monsterList, block.monsterId)}</span>
            {block.resolvedQty > 1 ? <span className="table-result-qty">x{block.resolvedQty}</span> : null}
          </div>
        )
      case 'npc':
        return (
          <div className="table-result-block npc">
            <span className="table-result-type">NPC</span>
            <span className="table-result-name">{entityName(npcList, block.npcId)}</span>
            {block.resolvedQty > 1 ? <span className="table-result-qty">x{block.resolvedQty}</span> : null}
          </div>
        )
      case 'item':
        return (
          <div className="table-result-block item">
            <span className="table-result-type">Item</span>
            <span className="table-result-name">{entityName(itemList, block.itemId)}</span>
            {block.resolvedQty > 1 ? <span className="table-result-qty">x{block.resolvedQty}</span> : null}
          </div>
        )
      case 'table': {
        const ref = tables.find((t) => t.id === block.tableId)
        const alreadyRolled = historyEntry.steps.some((s) => s.tableId === block.tableId)
        return (
          <div className="table-result-block table-ref">
            <span className="table-result-type">Table</span>
            <span className="table-result-name">{ref?.name ?? block.tableId}</span>
            {!alreadyRolled ? (
              <button
                type="button"
                className="table-roll-next-btn"
                onClick={() => void handleRollNested(historyEntry, block.tableId)}
              >
                Roll next
              </button>
            ) : (
              <span className="table-result-rolled">rolled</span>
            )}
          </div>
        )
      }
      case 'text':
        return (
          <div className="table-result-block text">
            <span className="table-result-content">{block.content}</span>
          </div>
        )
    }
  }

  // --- Main render ---

  return (
    <div className="maps-layout monsters-layout">
      {/* Sidebar */}
      {showListPane ? (
        <aside className="maps-sidebar monsters-sidebar characters-sidebar">
          <div className="maps-sidebar-header">
            <h2>Tables</h2>
            <button
              type="button"
              className="monster-add-btn"
              onClick={handleAddTable}
              aria-label="Add table"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="npc-filter-bar">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tables"
              aria-label="Search tables"
            />
            <div className="npc-tag-filter-wrapper">
              <Tag size={16} className="npc-tag-filter-icon" />
              <button
                type="button"
                className="npc-tag-filter-trigger"
                onClick={() => {
                  setTagFilterOpen((o) => !o)
                  setTagFilterSearch('')
                }}
              >
                {tagFilter === 'all' ? 'All tags' : tagFilter}
              </button>
              {tagFilterOpen ? (
                <>
                  <div className="npc-tag-filter-menu">
                    <div className="npc-tag-filter-search">
                      <Search size={14} />
                      <input
                        type="text"
                        value={tagFilterSearch}
                        onChange={(e) => setTagFilterSearch(e.target.value)}
                        placeholder="Search tags"
                      />
                    </div>
                    <div className="npc-tag-filter-options">
                      {!tagFilterSearch.trim() ? (
                        <button
                          type="button"
                          className={tagFilter === 'all' ? 'npc-tag-filter-option active' : 'npc-tag-filter-option'}
                          onClick={() => { setTagFilter('all'); setTagFilterOpen(false) }}
                        >
                          All tags
                        </button>
                      ) : null}
                      {tagsInUse
                        .filter((tag) => !tagFilterSearch.trim() || tag.includes(tagFilterSearch.trim().toLowerCase()))
                        .map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={tagFilter === tag ? 'npc-tag-filter-option active' : 'npc-tag-filter-option'}
                            onClick={() => { setTagFilter(tag); setTagFilterOpen(false) }}
                          >
                            {tag}
                          </button>
                        ))}
                      {tagFilterSearch.trim() && tagsInUse.filter((tag) => tag.includes(tagFilterSearch.trim().toLowerCase())).length === 0 ? (
                        <div className="npc-tag-filter-empty">No matching tags</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="npc-tag-filter-backdrop" onClick={() => setTagFilterOpen(false)} />
                </>
              ) : null}
            </div>
          </div>

          {tablesLoading ? <p className="tables-loading">Loading tables...</p> : null}
          {!tablesLoading && visibleTables.length === 0 ? <p className="tables-empty">No tables yet.</p> : null}

          <div className="monster-list-grid character-list-grid">
            {visibleTables.map((table) => (
              <div key={table.id} className={table.id === selectedTableId ? 'map-row active' : 'map-row'}>
                <div
                  className="map-select"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectTable(table.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelectTable(table.id)
                    }
                  }}
                >
                  <div className="map-meta">
                    <strong>{table.name || 'Unnamed Table'}</strong>
                    <p className="monster-card-statline">{diceLabel(table.dice)}</p>
                    {table.tags.length > 0 ? (
                      <div className="item-faction-tag-list">
                        {table.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="item-tag">{tag}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="table-sidebar-actions">
                  <button
                    type="button"
                    className="table-roll-sidebar-btn"
                    onClick={(e) => { e.stopPropagation(); handleRollTable(table.id) }}
                    aria-label={`Roll ${table.name || 'table'}`}
                  >
                    <Dices size={14} />
                  </button>
                  <button
                    type="button"
                    className="map-delete-btn character-card-delete-btn"
                    onClick={() => setDeleteCandidate(table)}
                    aria-label={`Delete ${table.name || 'table'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {/* Detail pane */}
      {showDetailPane ? (
        <div className="monsters-detail">
          <div className="monsters-detail-inner">
            {isMobile ? (
              <div className="monster-detail-header-row">
                <button type="button" className="back-link monster-mobile-back" onClick={() => setMobileView('list')}>
                  <ChevronLeft size={16} />
                </button>
              </div>
            ) : null}

            {!selectedTable ? (
              <p>Select a table from the list, or create a new one.</p>
            ) : panelMode === 'editor' ? (
              /* ===== EDITOR MODE ===== */
              <div className="table-editor">
                {/* Header */}
                <div className="table-editor-header">
                  <input
                    type="text"
                    value={selectedTable.name}
                    onChange={(e) => updateTable(selectedTable.id, { name: e.target.value })}
                    className="table-name-input"
                    placeholder="Table name"
                  />
                  <div className="table-editor-header-actions">
                    <button
                      type="button"
                      className="monster-example-btn"
                      onClick={() => setTagsModalOpen(true)}
                      aria-label="Manage tags"
                    >
                      <Tag size={14} />
                    </button>
                    <button
                      type="button"
                      className="table-roll-sidebar-btn"
                      onClick={() => { setPanelMode('results'); performRoll(selectedTable) }}
                      aria-label="Roll table"
                    >
                      <Dices size={16} />
                    </button>
                  </div>
                </div>

                {/* Tags display */}
                {selectedTable.tags.length > 0 ? (
                  <div className="item-faction-tag-list" style={{ marginBottom: 8 }}>
                    {selectedTable.tags.map((tag) => (
                      <span key={tag} className="item-tag">{tag}</span>
                    ))}
                  </div>
                ) : null}

                {/* Dice formula */}
                <div className="table-dice-picker">
                  <label>Dice:</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={selectedTable.dice.count}
                    onChange={(e) => handleDiceChange('count', Math.max(1, Number(e.target.value) || 1))}
                    className="table-dice-count"
                  />
                  <span>d</span>
                  {!diceSidesCustomMode ? (
                    <select
                      value={selectedTable.dice.sides}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        if (nextValue === CUSTOM_DIE_OPTION) {
                          setDiceSidesCustomMode(true)
                          return
                        }
                        setDiceSidesCustomMode(false)
                        handleDiceChange('sides', Number(nextValue))
                      }}
                    >
                      {DIE_OPTIONS.map((d) => <option key={d} value={d}>{`d${d}`}</option>)}
                      <option value={CUSTOM_DIE_OPTION}>Custom</option>
                    </select>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={2}
                        max={1000}
                        value={selectedTable.dice.sides}
                        onChange={(e) => handleDiceChange('sides', Math.max(2, Number(e.target.value) || 2))}
                        className="table-dice-count table-dice-custom-input"
                        aria-label="Custom die sides"
                      />
                      <button
                        type="button"
                        className="monster-example-btn"
                        onClick={() => handleDiceChange('sides', 6)}
                      >
                        Presets
                      </button>
                    </>
                  )}
                  <span className="table-dice-info">
                    = {rowCount(selectedTable.dice)} rows ({minResult(selectedTable.dice)}-{minResult(selectedTable.dice) + rowCount(selectedTable.dice) - 1})
                  </span>
                </div>

                {/* Row grid — every row listed individually */}
                <div className="table-row-grid">
                  {selectedTable.rows.map((row, rowIdx) => {
                    const resultNum = rowIdx + minResult(selectedTable.dice)
                    const hasBlocks = row.blocks.length > 0
                    const isCopySource = copySourceIdx === rowIdx
                    const isCopyTarget = copyTargets.has(rowIdx)
                    const inCopyMode = copySourceIdx !== null

                    return (
                      <div
                        key={rowIdx}
                        className={
                          'table-row-entry'
                          + (isCopySource ? ' copy-source' : '')
                          + (isCopyTarget ? ' copy-target' : '')
                        }
                      >
                        {inCopyMode ? (
                          /* Copy-mode: checkbox selection */
                          <label className="table-row-label table-row-copy-check">
                            <input
                              type="checkbox"
                              checked={isCopyTarget}
                              disabled={isCopySource}
                              onChange={() => toggleCopyTarget(rowIdx)}
                            />
                            <span className="table-row-number">{resultNum}</span>
                            <div className="table-row-blocks-preview">
                              {hasBlocks
                                ? row.blocks.map((block, bi) => {
                                    const { text, bold } = blockSummaryText(block)
                                    return (
                                      <span key={bi}>
                                        {bi > 0 ? ', ' : ''}
                                        {bold ? <strong>{text}</strong> : text}
                                      </span>
                                    )
                                  })
                                : <span className="table-row-empty">(empty)</span>}
                            </div>
                            {isCopySource ? <span className="table-row-copy-badge">source</span> : null}
                          </label>
                        ) : (
                          /* Normal mode: click to edit */
                          <button
                            type="button"
                            className="table-row-label"
                            onClick={() => setEditingRowIdx(rowIdx)}
                          >
                            <span className="table-row-number">{resultNum}</span>
                            <div className="table-row-blocks-preview">
                              {hasBlocks
                                ? row.blocks.map((block, bi) => {
                                    const { text, bold } = blockSummaryText(block)
                                    return (
                                      <span key={bi}>
                                        {bi > 0 ? ', ' : ''}
                                        {bold ? <strong>{text}</strong> : text}
                                      </span>
                                    )
                                  })
                                : <span className="table-row-empty">(empty)</span>}
                            </div>
                          </button>
                        )}
                        {/* Row actions — only in normal mode, only if row has blocks */}
                        {!inCopyMode && hasBlocks ? (
                          <div className="table-row-actions">
                            <button
                              type="button"
                              className="table-row-action-btn"
                              onClick={() => startCopyMode(rowIdx)}
                              aria-label="Copy to other rows"
                            >
                              <SquareStack size={13} />
                            </button>
                            <button
                              type="button"
                              className="table-row-action-btn table-row-clear-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                const newRows = [...selectedTable.rows]
                                newRows[rowIdx] = { blocks: [] }
                                updateTable(selectedTable.id, { rows: newRows })
                              }}
                              aria-label="Clear row"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                {/* Copy-mode apply bar */}
                {copySourceIdx !== null ? (
                  <div className="table-copy-bar">
                    <span>
                      Copy row {copySourceIdx + minResult(selectedTable.dice)} to {copyTargets.size} row{copyTargets.size !== 1 ? 's' : ''}
                    </span>
                    <div className="table-copy-bar-actions">
                      <button type="button" onClick={cancelCopyMode}>Cancel</button>
                      <button type="button" disabled={copyTargets.size === 0} onClick={applyCopy}>Apply</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              /* ===== RESULTS MODE ===== */
              <div className="table-results">
                <div className="table-results-header">
                  <h3>{selectedTable.name} - Results</h3>
                  <div className="table-results-header-actions">
                    <button
                      type="button"
                      className="monster-example-btn"
                      onClick={() => setPanelMode('editor')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="table-roll-sidebar-btn"
                      onClick={() => performRoll(selectedTable)}
                      aria-label="Roll again"
                    >
                      <Dices size={16} /> Roll
                    </button>
                  </div>
                </div>

                {rollHistory.length === 0 ? (
                  <p>No rolls yet. Click Roll to get started.</p>
                ) : (
                  <>
                    {/* Carousel navigation */}
                    <div className="table-results-carousel">
                      <button
                        type="button"
                        disabled={rollHistoryIdx >= rollHistory.length - 1}
                        onClick={() => setRollHistoryIdx((i) => Math.min(i + 1, rollHistory.length - 1))}
                        aria-label="Older result"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="table-results-page">
                        {rollHistoryIdx + 1} / {rollHistory.length}
                      </span>
                      <button
                        type="button"
                        disabled={rollHistoryIdx <= 0}
                        onClick={() => setRollHistoryIdx((i) => Math.max(i - 1, 0))}
                        aria-label="Newer result"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Current result */}
                    {(() => {
                      const entry = rollHistory[rollHistoryIdx]
                      if (!entry) return null
                      return (
                        <div className="table-result-entry">
                          {!entry.complete ? (
                            <div className="table-result-incomplete">Pending nested roll...</div>
                          ) : null}
                          {entry.steps.map((step, si) => (
                            <div key={si} className="table-result-step">
                              <div className="table-result-step-header">
                                <strong>{step.tableName}</strong>
                                <span className="table-result-roll-value">
                                  Rolled: {step.rollValue}
                                </span>
                              </div>
                              <div className="table-result-blocks">
                                {step.resolvedBlocks.map((block, bi) => (
                                  <div key={bi}>
                                    {renderResolvedBlock(block, entry)}
                                  </div>
                                ))}
                                {step.resolvedBlocks.length === 0 ? (
                                  <p className="table-result-empty">(empty row)</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Shorthand log */}
                    <details className="table-results-log">
                      <summary>Recent rolls</summary>
                      <div className="table-results-log-list">
                        {rollHistory.slice(0, 20).map((entry, i) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={i === rollHistoryIdx ? 'table-log-entry active' : 'table-log-entry'}
                            onClick={() => setRollHistoryIdx(i)}
                          >
                            {entry.steps.map((s) => `${s.tableName}: ${s.rollValue}`).join(' → ')}
                            {!entry.complete ? ' (pending)' : ''}
                          </button>
                        ))}
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Row edit modal */}
      {editingRowIdx !== null && selectedTable ? (() => {
        const row = selectedTable.rows[editingRowIdx]
        const resultNum = editingRowIdx + minResult(selectedTable.dice)
        if (!row) { setEditingRowIdx(null); return null }
        return (
          <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => setEditingRowIdx(null)}>
            <div className="confirm-modal table-row-modal" onClick={(e) => e.stopPropagation()}>
              <div className="table-row-modal-header">
                <h3>Row {resultNum}</h3>
                <button type="button" className="map-edit-btn" onClick={() => setEditingRowIdx(null)} aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="table-row-modal-blocks">
                {row.blocks.length === 0 ? (
                  <p className="table-row-empty">No blocks yet. Add one below.</p>
                ) : null}
                {row.blocks.map((block, bi) =>
                  renderBlockEditor(editingRowIdx, bi, block),
                )}
              </div>

              <div className="table-add-block-row">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addBlockToRow(editingRowIdx, e.target.value as TableBlock['type'])
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="">+ Add block...</option>
                  <option value="monster">Monster</option>
                  <option value="npc">NPC</option>
                  <option value="item">Item</option>
                  <option value="table">Table</option>
                  <option value="text">Text</option>
                </select>
              </div>

              <div className="confirm-actions">
                <button type="button" onClick={() => setEditingRowIdx(null)}>Done</button>
              </div>
            </div>
          </div>
        )
      })() : null}

      {/* Delete confirmation modal */}
      {deleteCandidate ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>Delete Table</h3>
            <p>Delete <strong>{deleteCandidate.name || 'this table'}</strong>?</p>
            {referencingTables.length > 0 ? (
              <div className="table-delete-refs-warning">
                <p>This table is referenced by {referencingTables.length} other table{referencingTables.length > 1 ? 's' : ''}:</p>
                <ul>
                  {referencingTables.map((t) => <li key={t.id}>{t.name || 'Unnamed'}</li>)}
                </ul>
                <p>Those references will become dangling.</p>
              </div>
            ) : null}
            <div className="confirm-actions">
              <button type="button" className="confirm-danger" onClick={() => setDeleteCandidate(null)}>Cancel</button>
              <button type="button" onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tags modal */}
      {tagsModalOpen && selectedTable ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => saveTags()}>
          <div className="confirm-modal npc-tag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="npc-tag-modal-header">
              <div className="npc-tag-modal-title">
                <Tag size={18} />
                <h3>Manage Tags</h3>
              </div>
              <button type="button" className="map-edit-btn" onClick={() => setTagsModalOpen(false)} aria-label="Close tags">
                <X size={16} />
              </button>
            </div>
            <p className="npc-tag-modal-subtitle">{selectedTable.name || 'Table'}</p>

            <section className="npc-tag-modal-section">
              <h4>Current Tags</h4>
              <div className="item-faction-tag-list">
                {tagSelection.length > 0 ? tagSelection.map((tag) => (
                  <button key={tag} type="button" className="npc-tag-chip selected" onClick={() => removeTagFromSelection(tag)}>
                    <span>{tag}</span>
                    <X size={12} />
                  </button>
                )) : <p className="map-npc-scene-empty">No tags selected.</p>}
              </div>
            </section>

            <section className="npc-tag-modal-section">
              <h4>Create Tag</h4>
              <div className="npc-tag-input-row">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTagToSelection(newTagInput)
                      setNewTagInput('')
                    }
                  }}
                  placeholder="encounter"
                />
                <button
                  type="button"
                  className="monster-example-btn"
                  onClick={() => { addTagToSelection(newTagInput); setNewTagInput('') }}
                  disabled={!newTagInput.trim()}
                >
                  <Plus size={14} />
                </button>
              </div>
            </section>

            {allTags.length > 0 ? (
              <section className="npc-tag-modal-section">
                <h4>Available Tags</h4>
                <div className="npc-tag-search-row">
                  <Search size={14} />
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags"
                  />
                </div>
                <div className="item-faction-tag-list">
                  {allTags
                    .filter((tag) => !tagSelection.includes(tag))
                    .filter((tag) => !tagSearch.trim() || tag.includes(tagSearch.trim().toLowerCase()))
                    .map((tag) => (
                      <button key={tag} type="button" className="npc-tag-chip" onClick={() => addTagToSelection(tag)}>
                        <span>{tag}</span>
                        <Plus size={12} />
                      </button>
                    ))}
                </div>
              </section>
            ) : null}

            <div className="confirm-actions">
              <button type="button" onClick={() => setTagsModalOpen(false)}>Cancel</button>
              <button type="button" onClick={saveTags}>
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

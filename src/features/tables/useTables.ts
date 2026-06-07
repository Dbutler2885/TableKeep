import { useEffect, useRef, useState } from 'react'
import { deleteDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { TableRecord, TableRow, TableBlock, TableQty } from '../../types/app'
import { campaignCollectionRef, campaignDocRef } from '../campaign/firestorePaths'

const normalizeQty = (value: unknown): TableQty | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const src = value as Record<string, unknown>
  if (typeof src.fixed === 'number') return { fixed: src.fixed }
  if (typeof src.count === 'number' && typeof src.sides === 'number') {
    return {
      count: src.count,
      sides: src.sides,
      ...(typeof src.modifier === 'number' ? { modifier: src.modifier } : {}),
    }
  }
  return undefined
}

const normalizeBlock = (value: unknown): TableBlock | null => {
  if (!value || typeof value !== 'object') return null
  const src = value as Record<string, unknown>
  switch (src.type) {
    case 'monster':
      if (typeof src.monsterId !== 'string') return null
      return { type: 'monster', monsterId: src.monsterId, qty: normalizeQty(src.qty) }
    case 'npc':
      if (typeof src.npcId !== 'string') return null
      return { type: 'npc', npcId: src.npcId, qty: normalizeQty(src.qty) }
    case 'item':
      if (typeof src.itemId !== 'string') return null
      return { type: 'item', itemId: src.itemId, qty: normalizeQty(src.qty) }
    case 'table':
      if (typeof src.tableId !== 'string') return null
      return { type: 'table', tableId: src.tableId }
    case 'text':
      return { type: 'text', content: typeof src.content === 'string' ? src.content : '' }
    default:
      return null
  }
}

const normalizeRows = (value: unknown, diceCount: number): TableRow[] => {
  if (!Array.isArray(value)) return []
  const minResult = diceCount
  const rows = value.map((row, i) => {
    if (!row || typeof row !== 'object') return { rangeMin: minResult + i, rangeMax: minResult + i, blocks: [] }
    const src = row as Record<string, unknown>
    const blocks = Array.isArray(src.blocks)
      ? src.blocks.map(normalizeBlock).filter((b): b is TableBlock => b !== null)
      : []
    const rangeMin = typeof src.rangeMin === 'number' ? src.rangeMin : minResult + i
    const rangeMax = typeof src.rangeMax === 'number' ? src.rangeMax : rangeMin
    return { rangeMin, rangeMax, blocks }
  })
  return rows
}

const normalizeTableRecord = (id: string, data: Record<string, unknown>): TableRecord => {
  const dice = data.dice && typeof data.dice === 'object'
    ? data.dice as Record<string, unknown>
    : {}
  const diceCount = typeof dice.count === 'number' ? dice.count : 1
  const diceSides = typeof dice.sides === 'number' ? dice.sides : 6
  const expectedRows = diceSides * diceCount - diceCount + 1
  const minResult = diceCount

  let rows = normalizeRows(data.rows, diceCount)
  // If no rows exist (new table) or rows lack range fields (legacy), generate defaults
  if (rows.length === 0) {
    rows = Array.from({ length: expectedRows }, (_, i) => ({
      rangeMin: minResult + i,
      rangeMax: minResult + i,
      blocks: [],
    }))
  }

  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    tags: Array.isArray(data.tags)
      ? data.tags.filter((t): t is string => typeof t === 'string')
      : [],
    dice: { count: diceCount, sides: diceSides },
    rows,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

const toFirestoreTable = (table: TableRecord): Record<string, unknown> => ({
  name: table.name,
  tags: table.tags,
  dice: table.dice,
  rows: table.rows,
})

export function useTables(campaignId: string, groupId: string) {
  const [tables, setTables] = useState<TableRecord[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const tablesRef = useRef<TableRecord[]>([])
  const pendingWritesRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    tablesRef.current = tables
  }, [tables])

  useEffect(() => {
    if (!campaignId) return
    setTablesLoading(true)

    const unsub = onSnapshot(
      campaignCollectionRef(db, { campaignId, groupId }, 'tables'),
      (snap) => {
        const all = snap.docs.map((docSnap) => {
          if (pendingWritesRef.current[docSnap.id]) {
            const local = tablesRef.current.find((t) => t.id === docSnap.id)
            if (local) return local
          }
          const data = docSnap.data() as Record<string, unknown>
          return normalizeTableRecord(docSnap.id, data)
        })
        setTables(all)
        setTablesLoading(false)
      },
      () => {
        setTablesLoading(false)
      },
    )

    return () => unsub()
  }, [campaignId, groupId])

  useEffect(() => {
    return () => {
      Object.values(pendingWritesRef.current).forEach((timer) => clearTimeout(timer))
      pendingWritesRef.current = {}
    }
  }, [])

  const scheduleTableWrite = (tableId: string) => {
    if (!campaignId) return
    const existing = pendingWritesRef.current[tableId]
    if (existing) clearTimeout(existing)

    pendingWritesRef.current[tableId] = setTimeout(() => {
      delete pendingWritesRef.current[tableId]
      const table = tablesRef.current.find((t) => t.id === tableId)
      if (!table) return

      void setDoc(
        campaignDocRef(db, { campaignId, groupId }, 'tables', table.id),
        { ...toFirestoreTable(table), updatedAt: serverTimestamp() },
        { merge: true },
      ).catch((error) => {
        console.error('Failed to update table', { tableId: table.id, error })
      })
    }, 500)
  }

  const addTable = (table: TableRecord) => {
    setTables((current) => [table, ...current])
    if (!campaignId) return
    void setDoc(
      campaignDocRef(db, { campaignId, groupId }, 'tables', table.id),
      { ...toFirestoreTable(table), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    ).catch((error) => {
      console.error('Failed to create table', { tableId: table.id, error })
    })
  }

  const updateTable = (tableId: string, patch: Partial<TableRecord>) => {
    setTables((current) =>
      current.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
    )
    scheduleTableWrite(tableId)
  }

  const deleteTable = (tableId: string) => {
    if (!campaignId) return
    const pending = pendingWritesRef.current[tableId]
    if (pending) {
      clearTimeout(pending)
      delete pendingWritesRef.current[tableId]
    }
    setTables((current) => current.filter((t) => t.id !== tableId))
    void deleteDoc(campaignDocRef(db, { campaignId, groupId }, 'tables', tableId)).catch((error) => {
      console.error('Failed to delete table', { tableId, error })
    })
  }

  return { tables, tablesLoading, addTable, updateTable, deleteTable }
}

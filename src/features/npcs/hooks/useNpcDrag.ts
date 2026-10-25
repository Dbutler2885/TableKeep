import { useEffect, useRef, useState } from 'react'
import type { Dispatch, DragEvent, SetStateAction } from 'react'
import type { AutoScroller, ScrollList } from '../lib/npcAutoScroll'
import { createAutoScroller, stopAutoScroll, updateAutoScroll } from '../lib/npcAutoScroll'

export type NpcDragState = {
  draggingNpcId: string | null
  dragOverNpcId: string | null
  dragHeight: number | null
}

const idleDrag: NpcDragState = { draggingNpcId: null, dragOverNpcId: null, dragHeight: null }

type DragSession = {
  canReorder: boolean
  drag: NpcDragState
  setDrag: Dispatch<SetStateAction<NpcDragState>>
  scroller: AutoScroller
  list: ScrollList
  onReorder: (sourceId: string, targetId: string) => void
}

const isDragging = (session: DragSession) => session.canReorder && session.drag.draggingNpcId !== null

function startNpcDrag(session: DragSession, npcId: string, event: DragEvent<HTMLElement>) {
  if (!session.canReorder) return
  event.dataTransfer.effectAllowed = 'move'
  const height = event.currentTarget.offsetHeight
  // Defer the re-render to the next frame: emptying the dragged row
  // into a placeholder synchronously here makes Chrome cancel the drag.
  requestAnimationFrame(() => session.setDrag({ draggingNpcId: npcId, dragOverNpcId: npcId, dragHeight: height }))
}

function dragOverNpc(session: DragSession, npcId: string, event: DragEvent<HTMLElement>) {
  if (!isDragging(session)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  updateAutoScroll(session.scroller, session.list, event.clientY)
  const { draggingNpcId, dragOverNpcId } = session.drag
  if (npcId !== draggingNpcId && dragOverNpcId !== npcId) session.setDrag((current) => ({ ...current, dragOverNpcId: npcId }))
}

function endNpcDrag(session: DragSession) {
  session.setDrag(idleDrag)
  stopAutoScroll(session.scroller)
}

function dropOnNpc(session: DragSession, npcId: string, event: DragEvent<HTMLElement>) {
  const { draggingNpcId, dragOverNpcId } = session.drag
  if (!session.canReorder || draggingNpcId === null) return
  event.preventDefault()
  session.onReorder(draggingNpcId, dragOverNpcId ?? npcId)
  endNpcDrag(session)
}

function dragOverList(session: DragSession, event: DragEvent<HTMLElement>) {
  if (!isDragging(session)) return
  event.preventDefault()
  updateAutoScroll(session.scroller, session.list, event.clientY)
}

// Drag-to-reorder for the roster: which row is held, which it is over, and
// edge auto-scroll for the list element `listRef` is attached to.
export function useNpcDrag(canReorder: boolean, onReorder: (sourceId: string, targetId: string) => void) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [scroller] = useState(createAutoScroller)
  const [drag, setDrag] = useState<NpcDragState>(idleDrag)
  useEffect(() => () => stopAutoScroll(scroller), [scroller])

  const session: DragSession = { canReorder, drag, setDrag, scroller, list: listRef, onReorder }
  const controls = {
    canReorder,
    drag,
    row: {
      start: (npcId: string, event: DragEvent<HTMLElement>) => startNpcDrag(session, npcId, event),
      over: (npcId: string, event: DragEvent<HTMLElement>) => dragOverNpc(session, npcId, event),
      drop: (npcId: string, event: DragEvent<HTMLElement>) => dropOnNpc(session, npcId, event),
      end: () => endNpcDrag(session),
    },
    list: {
      onDragOver: (event: DragEvent<HTMLElement>) => dragOverList(session, event),
      onDrop: () => stopAutoScroll(scroller),
    },
  }
  return { listRef, controls }
}

export type NpcDragControls = ReturnType<typeof useNpcDrag>['controls']

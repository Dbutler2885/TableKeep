import { useEffect, useState, type RefObject } from 'react'
import { lubecWires, type LubecNodePosition, type LubecWire } from './lubecSkillTree'

// Where each skill's dot and label sit inside the tree, as the prototype's drawWires reads them.
function nodePositions(tree: HTMLElement): Record<string, LubecNodePosition> {
  const box = tree.getBoundingClientRect()
  return Object.fromEntries([...tree.querySelectorAll<HTMLElement>('.skill-node')].map((node) => {
    const dot = node.querySelector('.skill-dot')!.getBoundingClientRect()
    const label = node.querySelector('.skill-label')!.getBoundingClientRect()
    return [node.dataset.skill, { y: dot.top + dot.height / 2 - box.top, dotLeft: dot.left - box.left, labelRight: label.right - box.left }]
  }))
}

/**
 * The tree's wires, measured from its laid-out nodes and measured again
 * whenever the tree changes size or its fonts finish loading, as the prototype
 * redraws them. None where the browser cannot watch the tree's size.
 */
export function useLubecSkillWires(treeRef: RefObject<HTMLElement | null>): LubecWire[] {
  const [wires, setWires] = useState<LubecWire[]>([])
  useEffect(() => {
    const tree = treeRef.current
    if (!tree || typeof ResizeObserver === 'undefined') return
    let live = true
    const draw = () => { if (live) setWires(lubecWires(nodePositions(tree))) }
    const observer = new ResizeObserver(draw)
    observer.observe(tree)
    void document.fonts?.ready.then(draw)
    return () => {
      live = false
      observer.disconnect()
    }
  }, [treeRef])
  return wires
}

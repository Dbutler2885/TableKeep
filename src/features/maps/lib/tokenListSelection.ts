// Pure updates of the GM's token selection, as the token list makes them.

export function addMissingIds(current: string[], ids: string[]) {
  const next = [...current]
  ids.forEach((id) => {
    if (!next.includes(id)) next.push(id)
  })
  return next
}

export function setIdsSelected(current: string[], ids: string[], selected: boolean) {
  if (selected) return addMissingIds(current, ids)
  const removed = new Set(ids)
  return current.filter((id) => !removed.has(id))
}

export function toggleId(current: string[], id: string) {
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
}

export function includeId(current: string[], id: string) {
  return current.includes(id) ? current : [...current, id]
}

// The ids from the anchor to the clicked token, either way round, or null when
// either of them is not in the list.
export function idRange(orderedIds: string[], anchorId: string, id: string) {
  const startIndex = orderedIds.indexOf(anchorId)
  const endIndex = orderedIds.indexOf(id)
  if (startIndex < 0 || endIndex < 0) return null
  const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
  return orderedIds.slice(from, to + 1)
}

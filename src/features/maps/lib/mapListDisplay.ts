import type { TokenRecord } from './types'

// The note under the map list header, when there is one.
export function mapListNotice(loading: boolean, mapCount: number, visibleCount: number, isGm: boolean) {
  if (loading) return 'Loading maps...'
  if (mapCount === 0) return 'No maps uploaded yet.'
  if (visibleCount === 0 && !isGm) return 'No maps revealed to players yet.'
  return null
}

export function mapRowClassName(active: boolean, dragOver: boolean, dragging: boolean) {
  return ['map-row', active ? 'active' : '', dragOver ? 'drag-over' : '', dragging ? 'dragging' : ''].filter(Boolean).join(' ')
}

export function deleteConfirmLabel(deleting: string) {
  return deleting ? 'Deleting...' : 'Delete'
}

function quotedTokenName(token: TokenRecord) {
  return `"${token.name || 'Token'}"`
}

export function tokenDeleteTitle(candidates: TokenRecord[] | null) {
  return (candidates?.length ?? 0) > 1 ? 'Delete Tokens?' : 'Delete Token?'
}

function tokensToDelete(candidates: TokenRecord[]) {
  if (candidates.length === 1) return quotedTokenName(candidates[0])
  return `${candidates.length} tokens: ${candidates.map(quotedTokenName).join(', ')}`
}

export function tokenDeleteMessage(candidates: TokenRecord[] | null) {
  if (!candidates || candidates.length === 0) return 'Permanently remove this token from the map?'
  return `Permanently remove ${tokensToDelete(candidates)} from the map?`
}

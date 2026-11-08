export type HandoutVisibility = 'hidden' | 'all' | 'some'
export type HandoutKind = 'text' | 'image' | 'pdf'
export type HandoutFolder = { id: string; name: string; parentId: string }
export type HandoutCharacter = { id: string; name: string; ownerUserId: string }
export type Handout = {
  id: string
  title: string
  description?: string
  folderId: string
  kind: HandoutKind
  text: string
  storagePath: string
  fileName: string
  visibility: HandoutVisibility
  characterIds: string[]
  viewerUids: string[]
  gmUserId: string
}

export const emptyHandout = (folderId: string, gmUserId: string): Handout => ({
  id: crypto.randomUUID(), title: '', description: '', folderId, kind: 'text', text: '', storagePath: '',
  fileName: '', visibility: 'hidden', characterIds: [], viewerUids: [], gmUserId,
})

export function viewerUidsFor(characterIds: string[], characters: HandoutCharacter[]): string[] {
  return [...new Set(characters.filter((character) => characterIds.includes(character.id))
    .map((character) => character.ownerUserId).filter(Boolean))]
}

// A visited set also makes old or malformed folder cycles safe to display.
export function folderAncestors(folderId: string, folders: HandoutFolder[]): string[] {
  const result: string[] = []
  let current = folderId
  while (current && !result.includes(current)) {
    result.push(current)
    current = folders.find((folder) => folder.id === current)?.parentId ?? ''
  }
  return result
}

export function visibleFolders(folders: HandoutFolder[], handouts: Handout[]): HandoutFolder[] {
  const ids = new Set(handouts.flatMap((handout) => folderAncestors(handout.folderId, folders)))
  return folders.filter((folder) => ids.has(folder.id))
}

export function folderDestinationAllowed(folderId: string, parentId: string, folders: HandoutFolder[]): boolean {
  return !folderAncestors(parentId, folders).includes(folderId)
}

export function folderLabel(folderId: string, folders: HandoutFolder[]): string {
  return folderAncestors(folderId, folders).reverse()
    .map((id) => folders.find((folder) => folder.id === id)?.name ?? 'Folder').join(' / ') || 'Handouts'
}

export const MAX_HANDOUT_BYTES = 20 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']

export function handoutFileKind(file: Pick<File, 'type' | 'size'>): 'image' | 'pdf' {
  if (file.size > MAX_HANDOUT_BYTES) throw new Error('Choose a file smaller than 20 MB.')
  if (file.type === 'application/pdf') return 'pdf'
  if (IMAGE_TYPES.includes(file.type)) return 'image'
  throw new Error('Choose a PDF, PNG, JPEG, WebP, GIF, or AVIF file.')
}

// Template art is shared by demo sandboxes and must survive a clone's edit/delete.
export function handoutFileBelongsTo(scope: { groupId: string; campaignId: string }, path: string): boolean {
  return path.startsWith(`groups/${scope.groupId}/campaigns/${scope.campaignId}/handouts/`)
}

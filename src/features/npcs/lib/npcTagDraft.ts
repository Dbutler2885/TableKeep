// The tags dialog's working copy: the chosen tags and its two text fields.
import type { NpcRecord } from '../../../types/app'

export type NpcTagDraft = {
  selection: string[]
  newTagInput: string
  tagSearch: string
}

export const emptyTagDraft: NpcTagDraft = { selection: [], newTagInput: '', tagSearch: '' }

export const tagDraftFor = (npc: NpcRecord | null): NpcTagDraft => ({ ...emptyTagDraft, selection: npc?.tags ?? [] })

const normalizeTag = (tag: string) => tag.trim().toLowerCase()

export function withTag(draft: NpcTagDraft, tag: string): NpcTagDraft {
  const normalized = normalizeTag(tag)
  if (!normalized || draft.selection.includes(normalized)) return draft
  return { ...draft, selection: [...draft.selection, normalized] }
}

// The typed tag joins the selection and the field clears, even when the tag
// was blank or already chosen.
export const withNewTag = (draft: NpcTagDraft): NpcTagDraft => ({ ...withTag(draft, draft.newTagInput), newTagInput: '' })

export const withoutTag = (draft: NpcTagDraft, tag: string): NpcTagDraft => ({
  ...draft,
  selection: draft.selection.filter((entry) => entry !== tag),
})

export const normalizedTags = (selection: string[]) => Array.from(new Set(selection.map(normalizeTag).filter(Boolean)))

export const tagsChanged = (current: string[], next: string[]) => next.join('|') !== current.join('|')

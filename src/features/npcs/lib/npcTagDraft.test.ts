import { describe, expect, it } from 'vitest'
import { makeNpc } from './npcRecords'
import { emptyTagDraft, normalizedTags, tagDraftFor, tagsChanged, withNewTag, withoutTag, withTag } from './npcTagDraft'

describe('the tags draft', () => {
  it('starts from the NPC\'s tags, or empty without an NPC', () => {
    expect(tagDraftFor({ ...makeNpc(), tags: ['spy'] })).toEqual({ selection: ['spy'], newTagInput: '', tagSearch: '' })
    expect(tagDraftFor(null)).toEqual(emptyTagDraft)
  })

  it('adds a tag trimmed and lower-cased, once, and ignores a blank one', () => {
    const draft = withTag(emptyTagDraft, '  Noble ')
    expect(draft.selection).toEqual(['noble'])
    expect(withTag(draft, 'NOBLE')).toBe(draft)
    expect(withTag(draft, '   ')).toBe(draft)
  })

  it('adds the typed tag and clears the field, even when nothing was added', () => {
    expect(withNewTag({ ...emptyTagDraft, newTagInput: 'Guard' })).toEqual({ selection: ['guard'], newTagInput: '', tagSearch: '' })
    expect(withNewTag({ selection: ['guard'], newTagInput: 'guard', tagSearch: 'g' })).toEqual({ selection: ['guard'], newTagInput: '', tagSearch: 'g' })
  })

  it('removes a tag', () => {
    expect(withoutTag({ ...emptyTagDraft, selection: ['a', 'b'] }, 'a').selection).toEqual(['b'])
  })
})

describe('saving tags', () => {
  it('normalizes and de-duplicates the selection, dropping blanks', () => {
    expect(normalizedTags([' A', 'a', '', 'B '])).toEqual(['a', 'b'])
  })

  it('counts a change in order as a change', () => {
    expect(tagsChanged(['a', 'b'], ['a', 'b'])).toBe(false)
    expect(tagsChanged(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(tagsChanged([], ['a'])).toBe(true)
  })
})

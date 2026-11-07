import { describe, expect, it } from 'vitest'
import { emptyHandout, folderAncestors, folderDestinationAllowed, folderLabel, handoutFileBelongsTo, handoutFileKind, viewerUidsFor, visibleFolders } from './handoutModel'

const folders = [
  { id: 'evidence', name: 'Evidence', parentId: '' },
  { id: 'letters', name: 'Letters', parentId: 'evidence' },
  { id: 'empty', name: 'Empty', parentId: '' },
]

describe('handout folders and audience', () => {
  it('starts every new handout hidden', () => {
    expect(emptyHandout('letters', 'gm')).toMatchObject({ folderId: 'letters', visibility: 'hidden', viewerUids: [], characterIds: [] })
  })
  it('keeps ancestors but hides every empty branch for a player', () => {
    const handout = { ...emptyHandout('letters', 'gm'), visibility: 'all' as const }
    expect(visibleFolders(folders, [handout]).map((folder) => folder.id)).toEqual(['evidence', 'letters'])
    expect(visibleFolders(folders, [])).toEqual([])
    expect(folderLabel('letters', folders)).toBe('Evidence / Letters')
    expect(folderLabel('', folders)).toBe('Handouts')
  })
  it('rejects moves into the same folder or a descendant', () => {
    expect(folderDestinationAllowed('evidence', 'letters', folders)).toBe(false)
    expect(folderDestinationAllowed('evidence', 'evidence', folders)).toBe(false)
    expect(folderDestinationAllowed('letters', '', folders)).toBe(true)
    expect(folderDestinationAllowed('letters', 'empty', folders)).toBe(true)
  })
  it('terminates malformed cycles and missing parents', () => {
    expect(folderAncestors('a', [{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }])).toEqual(['a', 'b'])
    expect(folderAncestors('missing', folders)).toEqual(['missing'])
  })
  it('recomputes owner grants and deduplicates people with multiple characters', () => {
    const characters = [{ id: 'a', name: 'A', ownerUserId: 'alice' }, { id: 'b', name: 'B', ownerUserId: 'alice' }, { id: 'c', name: 'C', ownerUserId: '' }]
    expect(viewerUidsFor(['a', 'b', 'c', 'deleted'], characters)).toEqual(['alice'])
    expect(viewerUidsFor(['a'], [{ ...characters[0], ownerUserId: 'bob' }])).toEqual(['bob'])
    expect(viewerUidsFor([], characters)).toEqual([])
  })
  it('accepts original images and PDFs while rejecting oversized or active content', () => {
    expect(handoutFileKind({ type: 'image/png', size: 100 })).toBe('image')
    expect(handoutFileKind({ type: 'application/pdf', size: 100 })).toBe('pdf')
    expect(() => handoutFileKind({ type: 'image/svg+xml', size: 100 })).toThrow('Choose a PDF')
    expect(() => handoutFileKind({ type: 'application/pdf', size: 21 * 1024 * 1024 })).toThrow('20 MB')
  })
  it('owns only files under the current campaign handout prefix', () => {
    const scope = { groupId: 'g', campaignId: 'c' }
    expect(handoutFileBelongsTo(scope, 'groups/g/campaigns/c/handouts/h/file.pdf')).toBe(true)
    expect(handoutFileBelongsTo(scope, 'groups/demo-template/campaigns/demo-campaign/handouts/h/file.pdf')).toBe(false)
    expect(handoutFileBelongsTo(scope, 'groups/g/campaigns/other/handouts/h/file.pdf')).toBe(false)
    expect(handoutFileBelongsTo(scope, '')).toBe(false)
  })

})

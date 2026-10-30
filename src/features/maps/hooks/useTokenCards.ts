import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { groupTokensByCategory, selectedCategoryLabel, shareOneCategory, type TokenGroup } from '../lib/tokenListGroups'
import { addMissingIds, idRange, includeId, setIdsSelected, toggleId } from '../lib/tokenListSelection'
import type { TokenRecord } from '../lib/types'

type UpdateToken = (tokenId: string, updates: Partial<Pick<TokenRecord, 'name' | 'group'>>) => Promise<void>
type SetSelection = Dispatch<SetStateAction<string[]>>

function useKeyToggles() {
  const [keys, setKeys] = useState<string[]>([])
  return {
    keys,
    setKeys,
    isOn: (key: string) => keys.includes(key),
    toggle: (key: string) => setKeys((current) => toggleId(current, key)),
  }
}

export type KeyToggles = ReturnType<typeof useKeyToggles>

// The token list's categories, and which of them are collapsed. A collapsed
// category that empties is forgotten, so it comes back expanded.
function useTokenGroups(tokens: TokenRecord[]) {
  const tokenGroups = useMemo(() => groupTokensByCategory(tokens), [tokens])
  const collapsedGroups = useKeyToggles()
  const [previousTokenGroups, setPreviousTokenGroups] = useState(tokenGroups)
  if (previousTokenGroups !== tokenGroups) {
    setPreviousTokenGroups(tokenGroups)
    const visibleGroupKeys = new Set<string>(tokenGroups.map((group) => group.key))
    collapsedGroups.setKeys((current) => current.filter((key) => visibleGroupKeys.has(key)))
  }
  return { tokenGroups, collapsedGroups }
}

// Selecting from the list: a click toggles one token, Shift-click adds the run
// from the last clicked token, and a category or group checkbox sets them all.
function useTokenListSelection(tokenGroups: TokenGroup[], setSelection: SetSelection) {
  const [anchorId, setAnchorId] = useState('')
  const orderedIds = useMemo(
    () => tokenGroups.flatMap((group) => group.tokens.map((token) => token.id)),
    [tokenGroups],
  )
  const toggleToken = (tokenId: string, shiftKey: boolean) => {
    const range = shiftKey && anchorId ? idRange(orderedIds, anchorId, tokenId) : null
    setSelection((current) => (range ? addMissingIds(current, range) : toggleId(current, tokenId)))
    setAnchorId(tokenId)
  }
  const setTokensSelected = (tokens: TokenRecord[], selected: boolean) => {
    const ids = tokens.map((token) => token.id)
    setSelection((current) => setIdsSelected(current, ids, selected))
  }
  return { toggleToken, setTokensSelected }
}

function withoutKey(drafts: Record<string, string>, key: string) {
  const next = { ...drafts }
  delete next[key]
  return next
}

// Renaming from the list: focusing a name selects its token, and the typed name
// is saved on blur when it differs from the current one.
function useTokenNameDrafts(setSelection: SetSelection, onUpdateToken: UpdateToken) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  return {
    draftFor: (token: TokenRecord) => drafts[token.id] ?? token.name,
    beginRename: (token: TokenRecord) => {
      setSelection((current) => includeId(current, token.id))
      setDrafts((prev) => ({ ...prev, [token.id]: token.name }))
    },
    changeDraft: (tokenId: string, value: string) => setDrafts((prev) => ({ ...prev, [tokenId]: value })),
    commitRename: async (token: TokenRecord, value: string) => {
      const nextName = value.trim()
      if (nextName !== token.name.trim()) await onUpdateToken(token.id, { name: nextName })
      setDrafts((prev) => withoutKey(prev, token.id))
    },
  }
}

export type TokenNameDrafts = ReturnType<typeof useTokenNameDrafts>

export type DisbandCandidate = { name: string; tokenIds: string[] }

// Making a named group from the selection, and disbanding one, each behind a dialog.
function useTokenGroupEditing(selectedTokens: TokenRecord[], onUpdateToken: UpdateToken) {
  const [makeGroupOpen, setMakeGroupOpen] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [disbandCandidate, setDisbandCandidate] = useState<DisbandCandidate | null>(null)
  const confirmMakeGroup = () => {
    const name = groupNameDraft.trim()
    if (!name || selectedTokens.length === 0) return
    void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { group: name })))
    setMakeGroupOpen(false)
    setGroupNameDraft('')
  }
  const confirmDisband = () => {
    if (!disbandCandidate) return
    void Promise.all(disbandCandidate.tokenIds.map((tokenId) => onUpdateToken(tokenId, { group: '' })))
    setDisbandCandidate(null)
  }
  return {
    makeGroupOpen,
    groupNameDraft,
    setGroupNameDraft,
    openMakeGroup: () => {
      setGroupNameDraft('')
      setMakeGroupOpen(true)
    },
    closeMakeGroup: () => setMakeGroupOpen(false),
    confirmMakeGroup,
    disbandCandidate,
    setDisbandCandidate,
    confirmDisband,
  }
}

export type TokenGroupEditing = ReturnType<typeof useTokenGroupEditing>

// Everything the token cards keep between renders. It lives with the controls
// rather than the cards, so it survives the cards being hidden in the player
// view preview.
export function useTokenCards(tokens: TokenRecord[], selectedTokenIds: string[], setSelection: SetSelection, onUpdateToken: UpdateToken) {
  const [collapsed, setCollapsed] = useState(false)
  const { tokenGroups, collapsedGroups } = useTokenGroups(tokens)
  const collapsedSubgroups = useKeyToggles()
  const selectedIds = useMemo(() => new Set(selectedTokenIds), [selectedTokenIds])
  const selectedTokens = useMemo(() => tokens.filter((token) => selectedIds.has(token.id)), [selectedIds, tokens])
  const pickedTokens = useMemo(() => selectedTokenIds.flatMap((id) => tokens.filter((token) => token.id === id)), [selectedTokenIds, tokens])
  const sameCategory = shareOneCategory(selectedTokens)
  const selection = useTokenListSelection(tokenGroups, setSelection)
  const names = useTokenNameDrafts(setSelection, onUpdateToken)
  const grouping = useTokenGroupEditing(selectedTokens, onUpdateToken)
  return {
    collapsed,
    toggleCollapsed: () => setCollapsed((current) => !current),
    tokenGroups,
    collapsedGroups,
    collapsedSubgroups,
    selectedIds,
    selectedTokens,
    pickedTokens,
    sameCategory,
    categoryLabel: selectedCategoryLabel(tokenGroups, selectedIds, sameCategory),
    selection,
    names,
    grouping,
  }
}

export type TokenCards = ReturnType<typeof useTokenCards>

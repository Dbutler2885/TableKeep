// The keys of the stock suggestions under the name, copied from the
// inventory prototype (B's combobox): the arrows move through the
// suggestions and the "Browse all stock" row after them, round and round;
// Enter picks the row they are on; Escape closes the list first, not the sheet.

/** The open suggestions: which row the arrow keys are on (-1 for none), and where the list sits under the name. */
export type LubecSuggest = { at: number; top: number }

/** What a key does to open suggestions; null when the key is the input's own. `last` is the "Browse all stock" row. */
export type LubecSuggestKey = { act: 'move' | 'pick'; at: number } | { act: 'close' } | null

const moved = (key: string, at: number, last: number): number => {
  if (key === 'ArrowDown') return at >= last ? 0 : at + 1
  return at <= 0 ? last : at - 1
}

export function lubecSuggestKey(key: string, at: number, last: number): LubecSuggestKey {
  if (key === 'ArrowDown' || key === 'ArrowUp') return { act: 'move', at: moved(key, at, last) }
  if (key === 'Enter' && at >= 0) return { act: 'pick', at }
  return key === 'Escape' ? { act: 'close' } : null
}

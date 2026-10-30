// The picker's sources: the game's stock, and this campaign's list (Rule T1).
// "This campaign" is the GM Items tab's campaign items (spec 8.4); while
// there are none its choice is hidden. The third, "From a skill kit", is the
// seam for the skill kits (spec 7.4): nothing fills it until the kits are
// decided, so it stays hidden too.

import { KIND_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItemKind } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_STOCK, lubecCampaignStock, type LubecStockItem } from '../../ruleSets/lubec/gear/stock'

export type LubecStockFrom = 'game' | 'campaign' | 'kit'

/** A stock entry as the picker offers it, with where it comes from. */
export type LubecStockEntry = LubecStockItem & { from: LubecStockFrom }

export const STOCK_FROM_NAMES: Readonly<Record<LubecStockFrom, string>> = { game: 'Lubec 1977', campaign: 'This campaign', kit: 'From a skill kit' }

/** Every entry the picker offers: the game's stock, then this campaign's, one for each design (Rule T3), then a skill kit's. */
export const lubecStockEntries = (campaign: readonly LubecStockItem[], kit: readonly LubecStockItem[] = []): LubecStockEntry[] => [
  ...LUBEC_STOCK.map((x) => ({ ...x, from: 'game' as const })),
  ...lubecCampaignStock(campaign).map((x) => ({ ...x, from: 'campaign' as const })),
  ...kit.map((x) => ({ ...x, from: 'kit' as const })),
]

/** Whether the campaign's list has anything to offer; while it is empty its choice is hidden. */
export const hasCampaignStock = (entries: readonly LubecStockEntry[]): boolean => entries.some((x) => x.from === 'campaign')

/** The sources with anything to offer, in the picker's order; a source with nothing in it is hidden. */
export const lubecStockSources = (entries: readonly LubecStockEntry[]): LubecStockFrom[] =>
  (Object.keys(STOCK_FROM_NAMES) as LubecStockFrom[]).filter((from) => entries.some((x) => x.from === from))

export const KIND_IDS = Object.keys(KIND_NAMES) as LubecItemKind[]

/** Filters for browsing: a search, a kind and a source; '' is All. */
export type LubecStockFilter = { query: string; kind: LubecItemKind | ''; from: LubecStockFrom | '' }

const matchesFilter = (x: LubecStockEntry, f: LubecStockFilter, q: string) =>
  (!f.kind || x.kind === f.kind) && (!f.from || x.from === f.from) && `${x.name} ${x.tags ?? ''}`.toLowerCase().includes(q)

/** The sections the picker shows, one per kind; with no kind picked, a kind with nothing in it is left out. */
export function lubecStockSections(entries: readonly LubecStockEntry[], f: LubecStockFilter): { kind: LubecItemKind; list: LubecStockEntry[] }[] {
  const q = f.query.trim().toLowerCase()
  const hits = entries.filter((x) => matchesFilter(x, f, q))
  return KIND_IDS.filter((k) => !f.kind || k === f.kind)
    .map((kind) => ({ kind, list: hits.filter((x) => x.kind === kind) }))
    .filter((s) => f.kind || s.list.length)
}

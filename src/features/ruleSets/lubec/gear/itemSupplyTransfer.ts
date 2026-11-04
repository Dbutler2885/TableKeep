import { sheetPayload } from '../../../character/characterStore/sheetIntentionEdits'
import type { LubecItem, LubecSupply } from './gearRecord'
import { lubecCommandItemId, type LubecItemCommand } from './itemIdentity'
import { LUBEC_SUPPLIES } from './supplies'

export const lubecReferencedSupplies = (item: Pick<LubecItem, 'takes' | 'fits'>, supplies: readonly LubecSupply[]): LubecSupply[] =>
  supplies.filter((supply) => [item.takes, item.fits].includes(supply.id))

function matchingSupply(supplies: readonly LubecSupply[], incoming: LubecSupply): LubecSupply | undefined {
  const matches = supplies.filter((supply) => supply.id === incoming.id)
  if (matches.some((supply) => sheetPayload(supply) !== sheetPayload(incoming))) throw new Error('Conflicting item supply definitions.')
  return matches[0]
}

function importedSupply(supply: LubecSupply, known: readonly LubecSupply[], command: LubecItemCommand): LubecSupply {
  const collision = known.some((own) => own.id === supply.id && sheetPayload(own) !== sheetPayload(supply))
  if (!collision) return supply
  const remapped = { ...supply, id: lubecCommandItemId(command, `supply:${supply.id}`) }
  matchingSupply(known, remapped)
  return remapped
}

/** Import only referenced definitions, rewriting takes and fits with the same stable mapping. */
export function lubecImportItemSupplies(item: LubecItem, own: readonly LubecSupply[], offered: readonly LubecSupply[], command: LubecItemCommand) {
  const supplies = [...own]
  const refs = new Map<string, string>()
  const referenced = lubecReferencedSupplies(item, offered)
  for (const supply of referenced) {
    matchingSupply(referenced, supply)
    const known = [...LUBEC_SUPPLIES, ...supplies]
    // Supply roles must not collapse distinct takes/fits definitions onto an item role.
    const imported = importedSupply(supply, known, { ...command, role: `supply:${supply.id}` })
    if (!matchingSupply(known, imported)) supplies.push(imported)
    refs.set(supply.id, imported.id)
  }
  return { item: rewrittenReferences(item, refs), supplies }
}

function rewrittenReferences(item: LubecItem, refs: ReadonlyMap<string, string>): LubecItem {
  return {
    ...item,
    ...(item.takes !== undefined && { takes: refs.get(item.takes) ?? item.takes }),
    ...(item.fits !== undefined && { fits: refs.get(item.fits) ?? item.fits }),
  }
}

import { lubecCombatantKey, type LubecCombatant } from './lubecFightRequest'

/** Tiles the target grid has room for; past them the last tile becomes a list of the rest. */
const TARGET_TILES = 8

/** The targets on tiles and the rest behind the last tile; the chosen target always has a tile. */
export function lubecTargetTiles(choices: readonly LubecCombatant[], chosen: string | null): { tiles: LubecCombatant[]; rest: LubecCombatant[] } {
  if (choices.length <= TARGET_TILES) return { tiles: [...choices], rest: [] }
  const first = choices.slice(0, TARGET_TILES - 1)
  const picked = choices.find((target) => lubecCombatantKey(target) === chosen)
  const tiles = picked && !first.includes(picked) ? [...first.slice(0, -1), picked] : first
  return { tiles, rest: choices.filter((target) => !tiles.includes(target)) }
}

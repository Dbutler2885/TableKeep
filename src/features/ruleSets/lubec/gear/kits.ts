// Skill kits, the gear each skill gives: a clean seam, nothing decided
// (spec 7.4). The kits are being decided separately, so every skill's kit
// is empty here, and `skillText.ts` keeps its `kit` and `always` words as
// text. Adding a kit later is data: lines that point at stock ids. A place
// or a vehicle in a kit is a shared carrier preset, not an item, and a
// contact or a permission stays text.

const NONE: readonly LubecKitLine[] = []

/** One line of a skill's kit, naming an item by its stock id. */
export type LubecKitLine = { stockId: string; qty?: number }

/** What a skill's kit puts on the sheet. Empty until the kits are decided. */
export const lubecSkillKit = (_skill: string): readonly LubecKitLine[] => NONE

/** What a skill always gives, with no roll. Empty until decided. */
export const lubecSkillAlways = (_skill: string): readonly LubecKitLine[] => NONE

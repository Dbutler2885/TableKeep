import { LUBEC_RANGE_BANDS, type LubecItem, type LubecRangeBand, type LubecWeaponRange } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecItemFields } from './itemForm'

export type LubecRangeFields = { band: LubecRangeBand; distance: string; modifier: string; stored: LubecWeaponRange }

const numberText = (value: number | undefined): string => value === undefined ? '' : String(value)
const whole = (raw: string): number => Math.round(Number(raw) || 0)

export const newThrowableFields = () => ({
  canThrow: false, thrownImpact: '0', thrownWound: 'blunt' as const,
  catchChance: '', catchPutsThrowerOut: false, ranges: [] as LubecRangeFields[],
})

export const throwableFieldsOf = (item: Partial<LubecItem>) => ({
  canThrow: item.canThrow === true, thrownImpact: numberText(item.thrownImpact), thrownWound: item.thrownWound ?? 'blunt',
  catchChance: numberText(item.catchChance), catchPutsThrowerOut: item.catchPutsThrowerOut === true,
  ranges: (item.ranges ?? []).map((range) => ({ band: range.band, distance: range.distance ?? '', modifier: numberText(range.modifier), stored: { ...range } })),
})

const rangeDraft = ({ band, distance, modifier, stored }: LubecRangeFields): LubecWeaponRange => {
  const { distance: _distance, modifier: _modifier, ...rest } = stored
  return { ...rest, band, ...(distance.trim() ? { distance: distance.trim() } : {}), ...(modifier.trim() ? { modifier: whole(modifier) } : {}) }
}

const rangesDraft = (fields: LubecItemFields): Partial<LubecItem> =>
  fields.ranges.length ? { ranges: fields.ranges.map(rangeDraft) } : {}

export const canBeThrown = (item: Pick<LubecItem, 'mode' | 'canThrow'>): boolean =>
  item.mode === 'thrown' || ((item.mode ?? 'melee') === 'melee' && item.canThrow === true)

const catchDraft = (fields: LubecItemFields): Partial<LubecItem> => ({
  ...(fields.catchChance.trim() ? { catchChance: Math.max(0, Math.min(100, whole(fields.catchChance))) } : {}),
  ...(fields.catchPutsThrowerOut ? { catchPutsThrowerOut: true } : {}),
})

/** Irrelevant form-owned fields are omitted, so the edit writer clears their former values. */
export function throwableDraft(fields: LubecItemFields): Partial<LubecItem> {
  if (!canBeThrown(fields)) return fields.mode === 'firearm' ? rangesDraft(fields) : {}
  const melee = fields.mode === 'melee' ? { canThrow: true, thrownImpact: whole(fields.thrownImpact), thrownWound: fields.thrownWound } : {}
  return { ...melee, ...catchDraft(fields), ...rangesDraft(fields) }
}

/** A range checkbox adds that band without inventing a distance or modifier. */
export const withRangeBand = (fields: LubecItemFields, band: LubecRangeBand, enabled: boolean): LubecItemFields => ({
  ...fields,
  ranges: LUBEC_RANGE_BANDS.flatMap((key) => {
    const range = fields.ranges.find((entry) => entry.band === key)
    if (key === band) return enabled ? [{ band, distance: '', modifier: '', stored: { band } }] : []
    return range ? [range] : []
  }),
})

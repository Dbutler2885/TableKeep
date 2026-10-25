import type { LubecStoredEntry } from './characterRecord'

// What a stored last roll's fields must hold for the sheet to read it as a
// roll of its kind. A stored roll that fails any check reads as no roll.

export type LubecRollFieldChecks<Roll> = Readonly<Record<keyof Roll, (value: unknown) => boolean>>

export const isOneOf = <Option extends string>(options: readonly Option[]) => (value: unknown): value is Option =>
  (options as readonly unknown[]).includes(value)

export const isCount = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0

/** A face of a die with this many sides, 1 to `sides`. */
export const isFace = (sides: number) => (value: unknown): boolean =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= sides

/** One or two faces, as a roll with or without Advantage leaves them. */
export const areFaces = (sides: number) => (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && value.every(isFace(sides))

/** The stored entry as a roll, or null when any of its fields does not read. */
export function readLubecRollFields<Roll>(entry: LubecStoredEntry | null, checks: LubecRollFieldChecks<Roll>): Roll | null {
  if (entry === null) return null
  const reads = Object.entries(checks).every(([field, check]) => (check as (value: unknown) => boolean)(entry[field]))
  return reads ? entry as Roll : null
}

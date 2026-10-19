// The checked-in character fixtures under `ose/fixtures/` and `vtm/fixtures/`
// are plain JSON, so a Firestore timestamp is written as { "$timestamp": ISO }.
// These turn that marker into a real timestamp value and back.
import type { StoredCharacter } from './storedCharacter.ts'

export type CharacterFixture = { id: string; data: StoredCharacter }

type TimestampMarker = { $timestamp: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTimestampMarker = (value: Record<string, unknown>): value is TimestampMarker =>
  Object.keys(value).length === 1 && typeof value.$timestamp === 'string'

const mapValues = (value: Record<string, unknown>, map: (entry: unknown) => unknown) =>
  Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, map(entry)]))

/** A fixture value with every timestamp marker replaced by `timestamp(iso)`. */
export function reviveTimestamps(value: unknown, timestamp: (iso: string) => unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => reviveTimestamps(entry, timestamp))
  if (!isRecord(value)) return value
  if (isTimestampMarker(value)) return timestamp(value.$timestamp)
  return mapValues(value, (entry) => reviveTimestamps(entry, timestamp))
}

/** A document as fixture JSON: each value `toIso` recognises becomes a timestamp marker. */
export function markTimestamps(value: unknown, toIso: (value: unknown) => string | null): unknown {
  const iso = toIso(value)
  if (iso !== null) return { $timestamp: iso }
  if (Array.isArray(value)) return value.map((entry) => markTimestamps(entry, toIso))
  if (!isRecord(value)) return value
  return mapValues(value, (entry) => markTimestamps(entry, toIso))
}

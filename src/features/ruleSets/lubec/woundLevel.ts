// How hurt someone looks in the fight modal. What wound level is and how it
// shows is still the captain's question 4, and wounds are not stored yet, so
// the chip's slot is built and says nothing until both are settled.

import type { LubecCharacterSheet } from './characterRecord'

/** The words for the target's wound-level chip; null while there is nothing to say. */
export const lubecWoundLevel = (_sheet: LubecCharacterSheet | null): string | null => null

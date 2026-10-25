import type { TokenIconConfig } from '../../../types/app'
import type { StoredCharacter } from '../storedCharacter'
import type { LubecEffect } from './effects'
import type { LubecGear } from './gear/gearRecord'
import type { LubecSheet } from './sheet'

// A Lubec character as the sheet reads it: the identity every rule set shares
// at the top level, and everything Lubec's own under `lubec`. Derived values
// (final and current values, skill bonuses, Effective Handle) are never here.

/** Which of the three doors made the character. */
export type LubecDoor = 'import' | 'direct' | 'guided'

export type LubecCounters = { stress: number; minimumStress: number; trauma: number }

/** A stored part of the sheet that later pages read; kept as stored until then. */
export type LubecStoredEntry = Record<string, unknown>

export type LubecCharacterSheet = LubecSheet & {
  door: LubecDoor | null
  /** A guided character's dice, as each one landed. */
  rollUp: LubecStoredEntry | null
  counters: LubecCounters
  effects: readonly LubecEffect[]
  lastRoll: LubecStoredEntry | null
  /** The notices only an import can know, kept for the Finalize dialog. */
  importNotes: readonly string[]
  /** What the character carries: items, personal carriers and the choices about them. */
  gear: LubecGear
}

export type LubecCharacterRecord = {
  id: string
  system: 'lubec'
  name: string
  ownerUserId: string
  ownerUsername: string | null
  creationMode: 'new' | 'established'
  creationStatus: 'draft' | 'established_draft' | 'active'
  portraitPath: string
  /** Resolved from `portraitPath` for display; never stored. */
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  lubec: LubecCharacterSheet
  /** The stored top-level fields the record does not model, kept for the next save. */
  unknownFields?: StoredCharacter
}

/** The starting values the rules give a new character's counters. */
export const LUBEC_STARTING_COUNTERS: LubecCounters = { stress: 2, minimumStress: 2, trauma: 0 }

export const lubecDefaultTokenIcon: TokenIconConfig = { icon: 'pawn', color: '#c08a2e', size: 34 }

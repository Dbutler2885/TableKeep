import {
  LUBEC_STARTING_COUNTERS,
  lubecDefaultTokenIcon,
  type LubecCharacterRecord,
  type LubecCharacterSheet,
  type LubecDoor,
} from './characterRecord'
import { LUBEC_VALUE_NAMES, type LubecClassChoices, type LubecSheet, type LubecValueName } from './sheet'

// Direct entry: a new draft whose owner types the base values and chooses the
// class and its choice. Nothing typed is checked against the rules here; an
// empty or non-whole entry is a hole (`null`), never a made-up number. Guided
// roll-up starts from the same empty draft.

export type LubecOwner = { userId: string; username: string }

/** Applies a change to a draft's sheet. */
export type LubecSheetEdit = (changes: Partial<LubecCharacterSheet>) => void

const noBaseValues = () =>
  Object.fromEntries(LUBEC_VALUE_NAMES.map((name) => [name, null])) as LubecSheet['base']

// A new draft owned by its creator, with the starting counters and every value a hole.
const makeLubecDraft = (
  id: string,
  owner: LubecOwner,
  stage: Pick<LubecCharacterRecord, 'creationMode' | 'creationStatus'>,
  door: LubecDoor,
): LubecCharacterRecord => ({
  id,
  system: 'lubec',
  name: '',
  ownerUserId: owner.userId,
  ownerUsername: owner.username,
  ...stage,
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: lubecDefaultTokenIcon,
  lubec: {
    age: null,
    class: { key: null, choices: { statPenalty: null, statBonus: null } },
    base: noBaseValues(),
    skills: { free: null, picked: [] },
    door,
    rollUp: null,
    counters: { ...LUBEC_STARTING_COUNTERS },
    effects: [],
    lastRoll: null,
    importNotes: [],
  },
})

/** A new draft made through Direct entry, owned by its creator, with every value a hole. */
export const makeLubecDirectEntryCharacter = (id: string, owner: LubecOwner): LubecCharacterRecord =>
  makeLubecDraft(id, owner, { creationMode: 'established', creationStatus: 'established_draft' }, 'direct')

/** A new character made through Guided roll-up: a new character's draft, with nothing rolled yet. */
export const makeLubecGuidedCharacter = (id: string, owner: LubecOwner): LubecCharacterRecord =>
  makeLubecDraft(id, owner, { creationMode: 'new', creationStatus: 'draft' }, 'guided')

/** A typed base value: a whole number, or a hole for anything else. */
export function parseLubecBaseEntry(text: string): number | null {
  const trimmed = text.trim()
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null
}

export const withLubecBaseValue = (sheet: LubecSheet, name: LubecValueName, value: number | null): Pick<LubecSheet, 'base'> =>
  ({ base: { ...sheet.base, [name]: value } })

/** A new class, whose choice starts as a hole so another class's choice never carries over. */
export const withLubecClass = (sheet: LubecSheet, key: string | null): Pick<LubecSheet, 'class'> =>
  ({ class: { ...sheet.class, key, choices: { ...sheet.class.choices, statPenalty: null, statBonus: null } } })

export const withLubecClassChoice = (
  sheet: LubecSheet,
  field: keyof LubecClassChoices,
  stat: string | null,
): Pick<LubecSheet, 'class'> => ({ class: { ...sheet.class, choices: { ...sheet.class.choices, [field]: stat } } })

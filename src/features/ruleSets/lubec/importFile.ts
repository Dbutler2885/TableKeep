import type { LubecCharacterRecord } from './characterRecord'
import { fieldsOf, isRecord, isText, listOf, textOrHole, wholeOrHole } from './characterParser'
import { makeLubecDirectEntryCharacter, type LubecOwner } from './directEntry'
import { isLubecStat, LUBEC_VALUE_NAMES, type LubecSheet } from './sheet'

// Reads a `lubec-character` file saved by the standalone Lubec sheet, chosen
// as a file or pasted as text. Only input that is not a Lubec character file
// at all is refused. Every known field the file lacks or that cannot be read
// is a hole (`null`), and rule breaks are left for the Finalize dialog. Only
// the base values, class, skills, name, age and portrait are read: every
// derived value is worked out again from them, and the file's counters,
// inventory and everything else are ignored.

export type LubecImportedCharacter = {
  name: string
  sheet: LubecSheet
  /** The notices only the import can know, for the Finalize dialog. */
  importNotes: readonly string[]
  /** The file's portrait as an image file; null when it has none or it cannot be read. */
  portrait: File | null
}

export type LubecImportReading = { refused: string } | { imported: LubecImportedCharacter }

export const LUBEC_UNREADABLE_PORTRAIT_NOTE = 'The file\'s portrait could not be read, so the character came in without one.'

const LUBEC_FILE_FORMAT = 'lubec-character'
const LUBEC_FILE_VERSION = 1

const refused = (reason: string): LubecImportReading => ({ refused: `That is not a Lubec character file: ${reason}.` })

function parseJson(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return null
  }
}

function versionNotes(version: unknown): string[] {
  if (version === LUBEC_FILE_VERSION) return []
  if (version === undefined || version === null) return ['This file has no version; Table Keep read the fields it knows.']
  const shown = typeof version === 'number' ? String(version) : JSON.stringify(version)
  return [`This file is version ${shown}; Table Keep read the fields it knows.`]
}

const nonEmptyOrHole = (raw: unknown): string | null => (textOrHole(raw) || null)

function readClass(raw: unknown): LubecSheet['class'] {
  const stored = fieldsOf(raw)
  const choices = fieldsOf(stored.choices)
  return {
    key: nonEmptyOrHole(stored.key),
    choices: { statPenalty: nonEmptyOrHole(choices.statPenalty), statBonus: nonEmptyOrHole(choices.statBonus) },
  }
}

// A Stat's base is under `stats`, a Save's under `saves`.
function readBase(file: Record<string, unknown>): LubecSheet['base'] {
  const baseOf = (name: string) => fieldsOf(fieldsOf(isLubecStat(name) ? file.stats : file.saves)[name]).base
  return Object.fromEntries(LUBEC_VALUE_NAMES.map((name) => [name, wholeOrHole(baseOf(name))])) as LubecSheet['base']
}

const skillName = (entry: unknown): string | null => nonEmptyOrHole(fieldsOf(entry).name)

function readSkills(raw: unknown): LubecSheet['skills'] {
  const stored = fieldsOf(raw)
  return { free: skillName(stored.free), picked: listOf(stored.picked).map(skillName).filter(isText) }
}

const PORTRAIT_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([\s\S]+)$/

function decodeBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

/** A portrait data URL as an image file; null for anything else. */
export function lubecPortraitFile(raw: unknown): File | null {
  const match = isText(raw) ? PORTRAIT_DATA_URL.exec(raw) : null
  const bytes = match ? decodeBase64(match[2]) : null
  if (!match || !bytes || bytes.length === 0) return null
  return new File([bytes as BlobPart], `portrait.${match[1]}`, { type: `image/${match[1]}` })
}

function readPortrait(raw: unknown): Pick<LubecImportedCharacter, 'portrait' | 'importNotes'> {
  if (raw === undefined || raw === null) return { portrait: null, importNotes: [] }
  const portrait = lubecPortraitFile(raw)
  return { portrait, importNotes: portrait ? [] : [LUBEC_UNREADABLE_PORTRAIT_NOTE] }
}

function readCharacter(file: Record<string, unknown>): LubecImportedCharacter {
  const portrait = readPortrait(file.portrait)
  return {
    name: textOrHole(file.characterName)?.trim() ?? '',
    sheet: { age: wholeOrHole(file.age), class: readClass(file.class), base: readBase(file), skills: readSkills(file.skills) },
    importNotes: [...versionNotes(file.version), ...portrait.importNotes],
    portrait: portrait.portrait,
  }
}

/** A Lubec character file's text, read; refused only when it is not a Lubec character file at all. */
export function readLubecCharacterFile(text: string): LubecImportReading {
  const parsed = parseJson(text)
  if (parsed === null) return refused('it is not readable JSON')
  if (!isRecord(parsed.value)) return refused('it is not a JSON object')
  if (parsed.value.format !== LUBEC_FILE_FORMAT) return refused(`its format is not "${LUBEC_FILE_FORMAT}"`)
  return { imported: readCharacter(parsed.value) }
}

/** A new imported draft, owned by the importer, with the rules' starting counters and no effects. */
export function makeLubecImportedCharacter(id: string, owner: LubecOwner, imported: LubecImportedCharacter): LubecCharacterRecord {
  const draft = makeLubecDirectEntryCharacter(id, owner)
  return {
    ...draft,
    name: imported.name,
    lubec: { ...draft.lubec, ...imported.sheet, door: 'import', importNotes: [...imported.importNotes] },
  }
}

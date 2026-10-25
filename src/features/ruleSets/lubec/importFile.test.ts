import { describe, expect, it } from 'vitest'
import tommyEvesFile from './fixtures/tommy-eves.lubec-character.json'
import { emptyLubecGear } from './gear/gearRecord'
import {
  LUBEC_UNREADABLE_PORTRAIT_NOTE,
  lubecPortraitFile,
  makeLubecImportedCharacter,
  readLubecCharacterFile,
  type LubecImportedCharacter,
} from './importFile'
import { lubecRuleWarnings } from './ruleChecks'

type Fields = Record<string, unknown>

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

const fileText = (fields: Fields = {}) => JSON.stringify({ ...tommyEvesFile, ...fields })

function imported(text: string): LubecImportedCharacter {
  const reading = readLubecCharacterFile(text)
  if (!('imported' in reading)) throw new Error(`Refused: ${reading.refused}`)
  return reading.imported
}

const refusal = (text: string) => {
  const reading = readLubecCharacterFile(text)
  return 'refused' in reading ? reading.refused : null
}

describe('reading a Lubec character file', () => {
  it('reads Tommy Eves\'s name, age, class, base values and skills with no notes and no portrait', () => {
    const tommy = imported(fileText())

    expect(tommy).toEqual({
      name: 'Tommy',
      sheet: {
        age: null,
        class: { key: 'working', choices: { statPenalty: null, statBonus: null } },
        base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 },
        skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] },
      },
      importNotes: [],
      portrait: null,
    })
    expect(lubecRuleWarnings(tommy.sheet)).toEqual([])
  })

  it('refuses only input that is not readable JSON, not an object, or of another format', () => {
    expect(refusal('{ not json')).toBe('That is not a Lubec character file: it is not readable JSON.')
    expect(refusal('')).toBe('That is not a Lubec character file: it is not readable JSON.')
    expect(refusal('[1, 2]')).toBe('That is not a Lubec character file: it is not a JSON object.')
    expect(refusal('null')).toBe('That is not a Lubec character file: it is not a JSON object.')
    expect(refusal('"lubec-character"')).toBe('That is not a Lubec character file: it is not a JSON object.')
    expect(refusal(fileText({ format: 'vtm-character' }))).toBe('That is not a Lubec character file: its format is not "lubec-character".')
  })

  it('refuses a v7 standalone snapshot, which has no format', () => {
    expect(refusal(JSON.stringify({ 'char-name': 'Tommy', strength: '29' }))).toMatch(/its format is not/)
  })

  it('accepts any version, noting a version other than 1 or none', () => {
    expect(imported(fileText({ version: 2 })).importNotes).toEqual(['This file is version 2; Table Keep read the fields it knows.'])
    expect(imported(fileText({ version: '1' })).importNotes).toEqual(['This file is version "1"; Table Keep read the fields it knows.'])
    expect(imported(fileText({ version: undefined })).importNotes).toEqual(['This file has no version; Table Keep read the fields it knows.'])
    expect(imported(fileText({ version: 2 })).sheet.base.Strength).toBe(24)
  })

  it('makes a hole of every known field that is missing or unreadable', () => {
    const file = {
      format: 'lubec-character',
      version: 1,
      characterName: 7,
      age: 12.5,
      class: { key: '', choices: { statPenalty: 3 } },
      stats: { Strength: { base: '24' }, Speed: { final: 56 } },
      saves: { Sanity: { base: 20 } },
      skills: { free: { tier: 'Trained' }, picked: [{ name: 'Swimming' }, 'Diving', null, { name: '' }] },
    }

    expect(imported(JSON.stringify(file))).toEqual({
      name: '',
      sheet: {
        age: null,
        class: { key: null, choices: { statPenalty: null, statBonus: null } },
        base: { Strength: null, Speed: null, Intellect: null, Handle: null, Charm: null, Sanity: 20, Fear: null, Body: null },
        skills: { free: null, picked: ['Swimming'] },
      },
      importNotes: [],
      portrait: null,
    })
  })

  it('reads an unknown class and skills as written, leaving them to the rule warnings', () => {
    const tommy = imported(fileText({
      class: { key: 'jock', choices: {} },
      skills: { free: { name: 'Juggling' }, picked: [{ name: 'Swimming' }] },
    }))

    expect(tommy.sheet.class.key).toBe('jock')
    expect(tommy.sheet.skills).toEqual({ free: 'Juggling', picked: ['Swimming'] })
    expect(lubecRuleWarnings(tommy.sheet).map(({ code }) => code)).toEqual(['class', 'unknown-skill'])
  })

  it('reads a class choice', () => {
    expect(imported(fileText({ class: { key: 'nerd', choices: { statPenalty: 'Speed' } } })).sheet.class)
      .toEqual({ key: 'nerd', choices: { statPenalty: 'Speed', statBonus: null } })
  })

  it('reads a JPEG, PNG or WebP data URL portrait as an image file', async () => {
    const portrait = imported(fileText({ portrait: `data:image/png;base64,${PNG_BASE64}` })).portrait

    expect(portrait?.type).toBe('image/png')
    expect(portrait?.name).toBe('portrait.png')
    expect(Buffer.from(await (portrait as File).arrayBuffer()).toString('base64')).toBe(PNG_BASE64)
    expect(lubecPortraitFile(`data:image/jpeg;base64,${PNG_BASE64}`)?.type).toBe('image/jpeg')
    expect(lubecPortraitFile(`data:image/webp;base64,${PNG_BASE64}`)?.type).toBe('image/webp')
  })

  it('notes a portrait it cannot read, and brings the character in without one', () => {
    const unreadable = [`data:image/gif;base64,${PNG_BASE64}`, 'data:image/png;base64,***', 'data:image/png;base64,', 'https://example.test/kid.png', 42]

    unreadable.forEach((portrait) => {
      const tommy = imported(fileText({ portrait }))
      expect(tommy.portrait).toBeNull()
      expect(tommy.importNotes).toEqual([LUBEC_UNREADABLE_PORTRAIT_NOTE])
    })
  })
})

describe('an imported character', () => {
  const owner = { userId: 'player-1', username: 'tommyev' }

  it('is an established draft owned by the importer, made through the Import door, with the starting counters and no effects', () => {
    const character = makeLubecImportedCharacter('kid-1', owner, imported(fileText({ version: 2 })))

    expect(character).toMatchObject({
      id: 'kid-1',
      system: 'lubec',
      name: 'Tommy',
      ownerUserId: 'player-1',
      ownerUsername: 'tommyev',
      creationMode: 'established',
      creationStatus: 'established_draft',
      portraitPath: '',
      lubec: {
        door: 'import',
        counters: { stress: 2, minimumStress: 2, trauma: 0 },
        effects: [],
        lastRoll: null,
        rollUp: null,
        class: { key: 'working' },
        importNotes: ['This file is version 2; Table Keep read the fields it knows.'],
      },
    })
    expect(character.lubec.gear).toEqual(emptyLubecGear())
  })
})

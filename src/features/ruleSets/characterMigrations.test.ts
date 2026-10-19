import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  lubecCharacterVersioning,
  migrateCharacter,
  oseCharacterVersioning,
  storedSchemaVersion,
  vtmCharacterVersioning,
  type CharacterVersioning,
} from './characterMigrations'
import { markTimestamps, reviveTimestamps } from './characterFixtures'
import demoFighter from './ose/fixtures/demo-fighter.json'
import filledVtmSheet from './vtm/fixtures/filled-sheet.json'

// A rule set at version 2, whose steps record that they ran.
const twoSteps: CharacterVersioning = {
  schemaVersion: 2,
  migrations: [
    (document) => ({ ...document, ran: [...(document.ran as string[] ?? []), 'first'], schemaVersion: 1 }),
    (document, characterId) => ({ ...document, ran: [...(document.ran as string[] ?? []), `second for ${characterId}`], schemaVersion: 2 }),
  ],
}

describe('the stored version', () => {
  it('is 0 when a document has none, and the stored whole number otherwise', () => {
    expect(storedSchemaVersion({})).toBe(0)
    expect(storedSchemaVersion({ schemaVersion: 0 })).toBe(0)
    expect(storedSchemaVersion({ schemaVersion: 3 })).toBe(3)
  })

  it.each([['1'], [1.5], [-1], [null], [true]])('refuses %j', (schemaVersion) => {
    expect(() => storedSchemaVersion({ schemaVersion })).toThrow('schemaVersion is not a whole number')
  })
})

describe('the migration runner', () => {
  it('runs every step from a document without a version', () => {
    expect(migrateCharacter(twoSteps, 'c1', { name: 'A' })).toEqual({
      status: 'migrated',
      fromVersion: 0,
      document: { name: 'A', ran: ['first', 'second for c1'], schemaVersion: 2 },
    })
  })

  it('runs only the steps above the stored version', () => {
    expect(migrateCharacter(twoSteps, 'c1', { name: 'A', schemaVersion: 1 })).toEqual({
      status: 'migrated',
      fromVersion: 1,
      document: { name: 'A', ran: ['second for c1'], schemaVersion: 2 },
    })
  })

  it('returns a document at the current version as stored', () => {
    const document = { name: 'A', schemaVersion: 2 }
    const result = migrateCharacter(twoSteps, 'c1', document)
    expect(result).toEqual({ status: 'current', fromVersion: 2, document })
    expect(result.document).toBe(document)
  })

  it('returns a document above the current version as stored, marked as newer', () => {
    const document = { name: 'A', schemaVersion: 3, fromLaterCode: true }
    const result = migrateCharacter(twoSteps, 'c1', document)
    expect(result).toEqual({ status: 'newer', fromVersion: 3, document })
    expect(result.document).toBe(document)
  })

  it.each([
    ['an OSE', oseCharacterVersioning, demoFighter],
    ['a VtM', vtmCharacterVersioning, filledVtmSheet],
  ] as const)('returns %s fixture above the current version unchanged, marked as newer', (_name, versioning, fixture) => {
    const document = { ...fixture.data, schemaVersion: versioning.schemaVersion + 1 }
    const result = migrateCharacter(versioning, fixture.id, document)
    expect(result).toEqual({ status: 'newer', fromVersion: versioning.schemaVersion + 1, document })
    expect(result.document).toBe(document)
  })

  it('fails when a step does not produce the next version', () => {
    const skipping: CharacterVersioning = { schemaVersion: 1, migrations: [(document) => ({ ...document })] }
    expect(() => migrateCharacter(skipping, 'c1', {})).toThrow('migration step 0 did not produce version 1')
  })

  it('migrates a document of each rule set to its current version', () => {
    expect(migrateCharacter(oseCharacterVersioning, 'c1', { class: 'Fighter' })).toEqual({
      status: 'migrated', fromVersion: 0, document: { class: 'Fighter', schemaVersion: 1 },
    })
    expect(migrateCharacter(vtmCharacterVersioning, 'c1', { system: 'vtm' })).toEqual({
      status: 'migrated', fromVersion: 0, document: { system: 'vtm', schemaVersion: 1 },
    })
  })

  it('has one step for each version below the current one', () => {
    for (const versioning of [oseCharacterVersioning, vtmCharacterVersioning]) {
      expect(versioning.migrations).toHaveLength(versioning.schemaVersion)
    }
  })

  it('leaves a current Lubec character as stored, and refuses one below the version Lubec is born at', () => {
    const current = { system: 'lubec', schemaVersion: 1, name: 'Ilse' }
    expect(migrateCharacter(lubecCharacterVersioning, 'c1', current)).toEqual({ status: 'current', fromVersion: 1, document: current })
    expect(() => migrateCharacter(lubecCharacterVersioning, 'c1', { system: 'lubec' }))
      .toThrow('no migration step from version 0')
  })
})

describe('the step entry point', () => {
  it('loads in plain Node, with no bundler', () => {
    const entryPoint = fileURLToPath(new URL('./characterMigrations.ts', import.meta.url))
    const script = [
      `const steps = await import(${JSON.stringify(entryPoint)})`,
      "const { document } = steps.migrateCharacter(steps.oseCharacterVersioning, 'c1', { class: 'Elf', details: {} })",
      'console.log(JSON.stringify([steps.oseCharacterVersioning.schemaVersion, steps.vtmCharacterVersioning.schemaVersion, document.details.inventory[0].id]))',
    ].join('\n')
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(JSON.parse(output)).toEqual([1, 1, 'legacy-c1-spell-book'])
  })
})

describe('the fixture timestamp marker', () => {
  const stamp = { at: 'stamp' }
  const toIso = (value: unknown) => value === stamp ? '2025-01-02T03:04:05.006Z' : null

  it('turns markers into timestamps and back, at any depth', () => {
    const fixture = { createdAt: { $timestamp: '2025-01-02T03:04:05.006Z' }, rows: [{ at: { $timestamp: '2025-01-02T03:04:05.006Z' } }, 'text'], n: 1 }
    const revived = reviveTimestamps(fixture, () => stamp)
    expect(revived).toEqual({ createdAt: stamp, rows: [{ at: stamp }, 'text'], n: 1 })
    expect(markTimestamps(revived, toIso)).toEqual(fixture)
  })

  it('leaves an object with more than the marker alone', () => {
    const value = { $timestamp: '2025-01-02T03:04:05.006Z', other: true }
    expect(reviveTimestamps(value, () => stamp)).toEqual(value)
  })
})

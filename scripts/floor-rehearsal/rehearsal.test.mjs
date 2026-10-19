import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readCharacterSchemaFloors } from './floors.mjs'
import {
  REHEARSAL_CONFIG_FILE,
  REHEARSAL_RULES_FILE,
  raisedFloorRules,
  rehearsalConfig,
  rehearsalJobArgs,
  runRehearsalJob,
  selectedJobs,
  writeRehearsalFiles,
} from './rehearsal.mjs'
import { firestoreRules } from '../../vitest.firestoreRules'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const readRepoFile = (file) => readFileSync(path.join(repoRoot, file), 'utf8')
const baseConfig = JSON.parse(readRepoFile('firebase.json'))
const { scripts } = JSON.parse(readRepoFile('package.json'))

describe('the raised-floor rehearsal', () => {
  it('raises every floor in firestore.rules to its current version', () => {
    const rules = raisedFloorRules(readRepoFile('firestore.rules'), { ose: 1, vtm: 1 })
    expect(readCharacterSchemaFloors(rules)).toEqual({ ose: 1, vtm: 1 })
  })

  it('points only the Firestore rules at the generated file', () => {
    expect(rehearsalConfig(baseConfig)).toEqual({
      ...baseConfig,
      firestore: { ...baseConfig.firestore, rules: REHEARSAL_RULES_FILE },
    })
  })

  it('runs the same emulators and command as each CI job, against the generated config', () => {
    expect(rehearsalJobArgs(scripts, 'emulator')).toEqual([
      'emulators:exec', '--config', REHEARSAL_CONFIG_FILE, '--only', 'firestore,storage',
      'vitest run --config vitest.emulator.config.ts',
    ])
    expect(rehearsalJobArgs(scripts, 'smoke')).toEqual([
      'emulators:exec', '--config', REHEARSAL_CONFIG_FILE, '--only', 'auth,firestore,storage',
      'node scripts/browser-smoke.mjs',
    ])
  })

  it('refuses a job script that is not an emulators:exec command', () => {
    expect(() => rehearsalJobArgs({ 'test:emulator': 'vitest run' }, 'emulator')).toThrow(/test:emulator/)
    expect(() => rehearsalJobArgs({}, 'smoke')).toThrow(/test:browser-smoke/)
  })

  it('runs both jobs unless one is named', () => {
    expect(selectedJobs([])).toEqual(['emulator', 'smoke'])
    expect(selectedJobs(['--job=smoke'])).toEqual(['smoke'])
    expect(() => selectedJobs(['--job=deploy'])).toThrow(/Unknown job "deploy"/)
  })

  it('generates files git ignores', () => {
    const ignored = readRepoFile('.gitignore').split('\n')
    expect(ignored).toContain(REHEARSAL_RULES_FILE)
    expect(ignored).toContain(REHEARSAL_CONFIG_FILE)
  })

  it('writes the raised rules and the config that loads them', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'floor-rehearsal-'))
    try {
      writeFileSync(path.join(root, 'firestore.rules'), readRepoFile('firestore.rules'))
      writeFileSync(path.join(root, 'firebase.json'), readRepoFile('firebase.json'))
      writeRehearsalFiles(root, { ose: 1, vtm: 1 })
      expect(readCharacterSchemaFloors(readFileSync(path.join(root, REHEARSAL_RULES_FILE), 'utf8'))).toEqual({ ose: 1, vtm: 1 })
      expect(JSON.parse(readFileSync(path.join(root, REHEARSAL_CONFIG_FILE), 'utf8'))).toEqual(rehearsalConfig(baseConfig))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('runs a job with the emulator suites pointed at the raised rules, and reports its exit', () => {
    const calls = []
    const spawnFirebase = (args, env) => {
      calls.push({ args, rulesFile: env.FIRESTORE_RULES_FILE, path: env.PATH })
      return { status: calls.length === 1 ? 0 : null }
    }
    expect(runRehearsalJob('emulator', scripts, { PATH: '/java/bin' }, spawnFirebase)).toBe(0)
    expect(runRehearsalJob('smoke', scripts, { PATH: '/java/bin' }, spawnFirebase)).toBe(1)
    expect(calls).toEqual([
      { args: rehearsalJobArgs(scripts, 'emulator'), rulesFile: REHEARSAL_RULES_FILE, path: '/java/bin' },
      { args: rehearsalJobArgs(scripts, 'smoke'), rulesFile: REHEARSAL_RULES_FILE, path: '/java/bin' },
    ])
  })
})

describe('the emulator suites\' rules loader', () => {
  it('reads firestore.rules unless FIRESTORE_RULES_FILE names another file', () => {
    expect(firestoreRules({})).toBe(readRepoFile('firestore.rules'))
    expect(firestoreRules({ FIRESTORE_RULES_FILE: 'storage.rules' })).toBe(readRepoFile('storage.rules'))
  })
})

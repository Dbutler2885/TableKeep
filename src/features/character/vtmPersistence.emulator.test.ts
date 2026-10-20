// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, Timestamp, waitForPendingWrites, type Firestore } from 'firebase/firestore'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'
import { defaultVtmSheet, defaultVtmTokenIcon } from './vtmDefaults'

const connection = vi.hoisted(() => ({ db: null as unknown as Firestore }))
vi.mock('../../firebase', () => ({ get db() { return connection.db } }))
// URL resolution is a separate Storage concern. Exercise the real roster,
// parser, debounce, serializer and Firestore writes with deterministic URLs.
vi.mock('../common/mediaStorage', async (original) => ({
  ...await original<typeof import('../common/mediaStorage')>(),
  resolveStoragePathUrl: vi.fn(async (path: string) => `https://media.test/${path}`),
}))
const { useVtmCharacters } = await import('./useVtmCharacters')

const scope = { groupId: 'vtm-persistence-group', campaignId: 'vtm-persistence-campaign' }
const path = `groups/${scope.groupId}/campaigns/${scope.campaignId}`
const oldTime = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
let env: RulesTestEnvironment
const errors = vi.fn()
const waitForStore = (assertion: () => void | Promise<void>) => waitFor(assertion, { timeout: 5_000 })
const characterRef = () => doc(connection.db, `${path}/characters/caller-chosen-id`)
const userStateRef = () => doc(connection.db, `${path}/userState/player`)

function populatedDocument(schemaVersion: number) {
  const defaults = defaultVtmSheet()
  return {
    system: 'vtm', name: 'Lucita', ownerUserId: 'player', ownerUsername: 'player1',
    creationMode: 'established', creationModeExplicit: true, creationStatus: 'active', xp: 42,
    portraitPath: `${path}/portraits/lucita.png`, portraitFocusX: 23, portraitFocusY: 71,
    tokenIcon: { ...defaultVtmTokenIcon, customImagePath: `${path}/tokens/lucita.png`, futureIcon: { kept: true } },
    schemaVersion, schemaWrittenAt: oldTime, createdAt: oldTime, updatedAt: oldTime,
    future: { timestamp: oldTime, nested: [{ unknownRow: ['keep', 4, null] }] },
    vtm: {
      ...defaults,
      chronicle: 'Nightfall', concept: 'Wanderer', sire: 'Moncada', nature: 'Rebel', demeanor: 'Survivor',
      clan: 'Lasombra', generation: '7', weakness: 'No reflection', history: 'Before the edit',
      attributes: { ...defaults.attributes, physical: { ...defaults.attributes.physical, Strength: 4, futureAttribute: 2 } },
      abilities: { ...defaults.abilities, talents: { ...defaults.abilities.talents, Alertness: 3, futureAbility: 1 } },
      disciplines: [{ id: 'd1', name: 'Obtenebration', rating: 3, futureRow: { kept: true } }],
      backgrounds: [{ id: 'b1', name: 'Resources', rating: 2 }],
      virtues: { ...defaults.virtues, Courage: 5, futureVirtue: 1 },
      humanity: 6, willpowerPermanent: 7, willpowerTemporary: 5, bloodPoolCurrent: 12,
      health: { ...defaults.health, Hurt: true, futureHealth: false },
      otherTraits: [{ id: 't1', name: 'Lore', rating: 2 }],
      rituals: [{ id: 'r1', name: 'Ward', level: '1', notes: 'Keep' }],
      derangements: 'None', bloodBonds: [{ id: 'bond', boundTo: 'Sire', rating: 1, notes: 'Keep' }],
      expandedBackground: { ...defaults.expandedBackground, futureText: 'Keep' },
      possessions: { ...defaults.possessions, futurePossession: 'Keep' },
      havens: [{ id: 'h1', location: 'Madrid', description: 'Cellar' }],
      appearance: { ...defaults.appearance, futureAppearance: 'Keep' },
      combatWeapons: [{ id: 'w1', weapon: 'Sword', damage: '5', range: 'Melee', rate: '1', clip: '-', conceal: 'T' }],
      armor: [{ id: 'a1', armor: 'Leather', rating: '1', penalty: '0', notes: 'Keep' }],
      xpLedger: [{ id: 'xp1', type: 'award', amount: 42, note: 'Story', createdAtMs: 1234, futureLedger: true }],
      freebiePointsSpent: 10, freebieDots: { ...defaults.freebieDots, disciplines: 1 },
      futureSheet: { nested: ['keep'] },
    },
  }
}

function mount() {
  return renderHook(() => useVtmCharacters(scope.campaignId, scope.groupId, 'player', 'player1', 'player', 'gm', errors))
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'homeboyshouse-vtm-persistence', firestore: {
    host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules(),
  } })
  connection.db = env.authenticatedContext('player').firestore() as unknown as Firestore
})
beforeEach(async () => {
  errors.mockClear()
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, `groups/${scope.groupId}`), { createdBy: 'gm' })
    await setDoc(doc(db, `groups/${scope.groupId}/members/player`), { userId: 'player', status: 'active', role: 'member' })
    await setDoc(doc(db, path), { gmUserId: 'gm', system: 'vtm', status: 'active' })
    await setDoc(doc(db, `${path}/userState/player`), { currentCharacterId: 'caller-chosen-id', updatedAt: oldTime, futureState: { kept: true } })
  })
})
afterEach(async () => { cleanup(); await waitForPendingWrites(connection.db) })
afterAll(async () => { await env?.cleanup() })

describe('VtM persistence through the shared character store', () => {
  it.each([0, 1])('loads version %s without writing, edits one sheet field, debounces, and reloads every other stored field unchanged', async (version) => {
    const raw = populatedDocument(version)
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `${path}/characters/caller-chosen-id`), raw)
    })
    const userStateBefore = (await getDoc(userStateRef())).data()
    const first = mount()
    await waitForStore(() => expect(first.result.current.selectedCharacter?.id).toBe('caller-chosen-id'))
    await waitForStore(() => expect(first.result.current.currentCharacterId).toBe('caller-chosen-id'))
    await waitForStore(() => expect(first.result.current.selectedCharacter?.portraitUrl).toBe(`https://media.test/${raw.portraitPath}`))
    expect(first.result.current.selectedCharacter?.tokenIcon.customImageUrl).toBe(`https://media.test/${raw.tokenIcon.customImagePath}`)
    expect((await getDoc(characterRef())).data()).toEqual(raw)

    const sheet = first.result.current.selectedCharacter!.vtm
    act(() => first.result.current.updateCharacter('caller-chosen-id', { vtm: { ...sheet, history: 'After the edit' } }))
    // Local state changes before the delayed Firestore write.
    expect(first.result.current.selectedCharacter?.vtm.history).toBe('After the edit')
    await waitForStore(async () => expect((await getDoc(characterRef())).data()?.vtm.history).toBe('After the edit'))
    // getDoc may include an optimistic local write with null server times.
    // Wait for the real commit before comparing the persisted document.
    await waitForPendingWrites(connection.db)
    const saved = (await getDoc(characterRef())).data()!
    expect(saved).toEqual({
      ...raw, vtm: { ...raw.vtm, history: 'After the edit' }, schemaVersion: 1,
      schemaWrittenAt: expect.any(Timestamp), updatedAt: expect.any(Timestamp),
    })
    expect(saved.schemaWrittenAt.toMillis()).toBeGreaterThan(oldTime.toMillis())
    expect(saved.updatedAt).toEqual(saved.schemaWrittenAt)
    expect((await getDoc(userStateRef())).data()).toEqual(userStateBefore)

    first.unmount()
    const reloaded = mount()
    await waitForStore(() => expect(reloaded.result.current.selectedCharacter?.vtm.history).toBe('After the edit'))
    await waitForStore(() => expect(reloaded.result.current.currentCharacterId).toBe('caller-chosen-id'))
    expect(reloaded.result.current.selectedCharacter?.vtm).toEqual(saved.vtm)
    expect(reloaded.result.current.selectedCharacter?.unknownFields).toEqual({ future: raw.future })
    expect((await getDoc(characterRef())).data()).toEqual(saved)
    expect((await getDoc(userStateRef())).data()).toEqual(userStateBefore)
    expect(errors).not.toHaveBeenCalled()
  }, 10_000)

  it('delete removes only the parent character, retaining user state and dependent documents', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `${path}/characters/caller-chosen-id`), populatedDocument(1))
      await setDoc(doc(db, `${path}/characters/caller-chosen-id/futureRelated/child`), { kept: true })
    })
    const before = (await getDoc(userStateRef())).data()
    const { result } = mount()
    await waitForStore(() => expect(result.current.selectedCharacter?.id).toBe('caller-chosen-id'))
    act(() => result.current.deleteCharacter('caller-chosen-id'))
    await waitForStore(async () => expect((await getDoc(characterRef())).exists()).toBe(false))
    expect((await getDoc(userStateRef())).data()).toEqual(before)
    await env.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), `${path}/characters/caller-chosen-id/futureRelated/child`))).data()).toEqual({ kept: true })
    })
  })
})

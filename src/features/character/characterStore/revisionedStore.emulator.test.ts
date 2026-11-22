// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor as rtlWaitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../../vitest.firestoreRules'
import fixture from '../../ruleSets/lubec/fixtures/stored-character.json'
import { lubecCharacterStore } from '../../ruleSets/lubec/characterParser'
import type { SheetIntention } from './sheetIntentionTypes'

const waitFor = <T,>(callback: () => T) => rtlWaitFor(callback, { timeout: 10_000 })

const connection = vi.hoisted(() => ({ db: null as unknown as Firestore, mode: 'normal', gate: Promise.resolve(), started: false, active: new Set<Promise<void>>() }))
vi.mock('../../../firebase', () => ({ get db() { return connection.db } }))
vi.mock('./sheetIntentionTransaction', async (importOriginal) => {
  const original = await importOriginal<typeof import('./sheetIntentionTransaction')>()
  return { ...original, saveSheetIntention: async (...args: Parameters<typeof original.saveSheetIntention>) => {
    if (args[0] !== connection.db) return original.saveSheetIntention(...args)
    let finish = () => {}
    const done = new Promise<void>((resolve) => { finish = resolve })
    connection.active.add(done)
    try {
    connection.started = true
    if (connection.mode === 'hold-before') await connection.gate
    if (connection.mode === 'offline') throw new FirebaseError('unavailable', 'offline')
    const result = await original.saveSheetIntention(...args)
    if (connection.mode === 'hold-after') await connection.gate
    if (connection.mode === 'lost-ack') throw new FirebaseError('unavailable', 'lost acknowledgement')
    return result
    } finally { connection.active.delete(done); finish() }
  } }
})
const { useCharacterStore } = await import('./useCharacterStore')
const { saveSheetIntention } = await import('./sheetIntentionTransaction')
const scope = { groupId: 'revisioned-store', campaignId: 'lubec' }
const path = 'groups/revisioned-store/campaigns/lubec/characters/hero'
let env: RulesTestEnvironment
let gm: Firestore
let release = () => {}
const raw = () => ({ ...fixture.data, ...lubecCharacterStore.parser.serialize(lubecCharacterStore.parser.parse('hero', fixture.data)), ownerUserId: 'owner', portraitPath: '', schemaWrittenAt: new Date(123) })
const gmEdit = (id: string, edits: SheetIntention['edits']) => saveSheetIntention(gm, doc(gm, path), { operationId: id, baseRevision: 0, edits })
const read = async () => (await getDoc(doc(gm, path))).data()!
const hook = () => renderHook(() => useCharacterStore({ ruleSet: lubecCharacterStore, ...scope, userId: 'owner', role: 'player', gmUserId: 'gm', setError: vi.fn(), enabled: true }))
const ready = async (store: ReturnType<typeof hook>) => waitFor(() => expect(store.result.current.characters).toHaveLength(1))
const hold = (mode: string) => { connection.mode = mode; connection.gate = new Promise<void>((resolve) => { release = resolve }) }

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev', firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() } })
})
beforeEach(async () => {
  sessionStorage.clear()
  connection.mode = 'normal'; connection.started = false; release = () => {}
  await env.clearFirestore()
  // Clearing the backend is not a production revision rollback; each case gets fresh client caches.
  connection.db = env.authenticatedContext('owner').firestore() as unknown as Firestore
  gm = env.authenticatedContext('gm').firestore() as unknown as Firestore
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const uid of ['owner', 'gm']) await setDoc(doc(db, 'groups/revisioned-store/members', uid), { userId: uid, status: 'active', role: uid === 'gm' ? 'admin' : 'member' })
    await setDoc(doc(db, 'groups/revisioned-store/campaigns/lubec'), { system: 'lubec', gmUserId: 'gm' })
    await setDoc(doc(db, path), raw())
  })
})
afterEach(async () => {
  release(); connection.mode = 'normal'; cleanup()
  for (let round = 0; round < 4; round += 1) { await Promise.all([...connection.active]); await Promise.resolve(); await Promise.resolve() }
})
afterAll(async () => env.cleanup())

describe('real revisioned hook stores', () => {
  it('keeps journals user-scoped after changing campaigns in the same mounted store', async () => {
    const secondPath = path.replace('/lubec/', '/second/')
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups/revisioned-store/campaigns/second'), { system: 'lubec', gmUserId: 'gm' })
      await setDoc(doc(context.firestore(), secondPath), { ...raw(), name: 'Second campaign' })
    })
    const store = renderHook(({ campaignId }) => useCharacterStore({ ruleSet: lubecCharacterStore, groupId: scope.groupId, campaignId, userId: 'owner', role: 'player', gmUserId: 'gm', setError: vi.fn(), enabled: true }), { initialProps: { campaignId: 'lubec' } })
    await ready(store)
    store.rerender({ campaignId: 'second' })
    await waitFor(() => expect(store.result.current.characters[0]?.name).toBe('Second campaign'))
    connection.mode = 'offline'
    act(() => store.result.current.updateCharacterNow('hero', { name: 'Retained in second' }))
    await waitFor(() => expect(store.result.current.saveControls('hero')?.entries[0]?.error).toContain('retained'))
    expect(sessionStorage.getItem(`tablekeep-sheet-edits:owner:${secondPath}`)).toContain('Retained in second')
    expect(sessionStorage.getItem(`tablekeep-sheet-edits::${secondPath}`)).toBeNull()
    expect(JSON.parse(sessionStorage.getItem(`tablekeep-sheet-edits:owner:${path}`)!)).toEqual([])
  })
  it('edits a legacy partial sheet without persisting unchanged parser defaults', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const legacy = { ...fixture.data, ownerUserId: 'owner', schemaWrittenAt: new Date(123) } as Record<string, unknown>
      delete legacy.gear
      const lubec = { ...(legacy.lubec as Record<string, unknown>) }
      delete lubec.gear
      delete lubec.counters
      await setDoc(doc(context.firestore(), path), { ...legacy, lubec })
    })
    const store = hook(); await ready(store)
    const before = store.result.current.characters[0]
    const item = { id: 'first-pickup', kind: 'thing' as const, name: 'Stone', qty: 1, size: 1, weight: 'normal' as const, note: '', carrier: 'hands', slot: 0 }
    act(() => store.result.current.updateCharacterNow('hero', { lubec: { ...before.lubec, gear: { ...before.lubec.gear, items: [item] } } }, before))
    await waitFor(async () => expect(await read()).toMatchObject({ sheetRevision: 1, lubec: { gear: { items: [{ id: 'first-pickup' }] } } }))
    expect((await read()).lubec).not.toHaveProperty('counters')
    expect(store.result.current.saveControls('hero')?.entries.some((entry) => entry.error)).toBe(false)
  })
  it('shows an acknowledged wound and pickup in two open hooks while an unrelated player save waits', async () => {
    const first = hook(), second = hook()
    await ready(first); await ready(second)
    hold('hold-before')
    act(() => first.result.current.updateCharacterNow('hero', { name: 'Ada M' }))
    await waitFor(() => expect(connection.started).toBe(true))
    const acknowledged = await gmEdit('combat-surrogate', [
      { kind: 'delta', path: ['lubec', 'counters', 'trauma'], base: 1, amount: 2 },
      { kind: 'insert', path: ['lubec', 'effects'], record: { id: 'wound', name: 'Dazed', steps: [], cause: 'Combat', activeStep: 0 } },
      { kind: 'insert', path: ['lubec', 'gear', 'items'], record: { id: 'pickup', kind: 'thing', name: 'Dodgeball', qty: 1, size: 1, weight: 'normal', note: '', carrier: 'hands', slot: 0 } },
    ])
    expect(acknowledged).toMatchObject({ status: 'committed' })
    await waitFor(() => {
      for (const view of [first, second]) {
        expect(view.result.current.characters[0].lubec.counters.trauma, JSON.stringify(view.result.current.saveControls('hero'))).toBe(3)
        expect(view.result.current.characters[0].lubec.effects.map((entry) => entry.id)).toContain('wound')
        expect(view.result.current.characters[0].lubec.gear.items.map((entry) => entry.id)).toContain('pickup')
      }
      expect(first.result.current.characters[0].name).toBe('Ada M')
    })
    release()
    await waitFor(async () => expect(await read()).toMatchObject({ name: 'Ada M', sheetRevision: 2, lubec: { counters: { trauma: 3 } } }))
    await waitFor(() => expect(second.result.current.characters[0].name).toBe('Ada M'))
  })

  it('captures a delayed rendered base without turning newer remote fields into replacement edits', async () => {
    const store = hook(); await ready(store)
    const old = store.result.current.characters[0]
    await gmEdit('wound', [{ kind: 'delta', path: ['lubec', 'counters', 'trauma'], base: 1, amount: 2 }])
    await waitFor(() => expect(store.result.current.characters[0].lubec.counters.trauma).toBe(3))
    act(() => store.result.current.updateCharacterNow('hero', { lubec: { ...old.lubec, counters: { ...old.lubec.counters, stress: 5 } } }, old))
    await waitFor(async () => expect(await read()).toMatchObject({ sheetRevision: 2, lubec: { counters: { stress: 5, trauma: 3 } } }))
    await waitFor(() => expect(store.result.current.characters[0].lubec.counters).toMatchObject({ stress: 5, trauma: 3 }))
  })

  it('does not replay a committed delta while its acknowledgement is delayed, and a lost acknowledgement retries once', async () => {
    const store = hook(); await ready(store)
    hold('hold-after')
    const before = store.result.current.characters[0]
    act(() => store.result.current.updateCharacterNow('hero', { lubec: { ...before.lubec, counters: { ...before.lubec.counters, stress: 5 } } }, before))
    await waitFor(async () => expect((await read()).sheetRevision, JSON.stringify(store.result.current.saveControls('hero'))).toBe(1))
    await waitFor(() => {
      expect(store.result.current.characters[0].lubec.counters.stress).toBe(5)
      expect(store.result.current.saveControls('hero')?.entries).toHaveLength(0)
    })
    release(); connection.mode = 'lost-ack'
    const next = store.result.current.characters[0]
    act(() => store.result.current.updateCharacterNow('hero', { lubec: { ...next.lubec, counters: { ...next.lubec.counters, stress: 6 } } }, next))
    await waitFor(async () => expect(await read()).toMatchObject({ sheetRevision: 2, lubec: { counters: { stress: 6 } } }))
    await waitFor(() => expect(store.result.current.saveControls('hero')?.entries).toHaveLength(0))
    act(() => store.result.current.saveControls('hero')?.retry())
    expect(await read()).toMatchObject({ sheetRevision: 2, lubec: { counters: { stress: 6 } } })
  })

  it('retains conflicting edits in the journal and keeps the current server value visible for explicit repair', async () => {
    const store = hook(); await ready(store)
    hold('hold-before')
    act(() => store.result.current.updateCharacterNow('hero', { name: 'Mine' }))
    await gmEdit('rename', [{ kind: 'set', path: ['name'], base: { exists: true, value: 'Ada Mitchell' }, value: 'Other device' }])
    await waitFor(() => {
      expect(store.result.current.characters[0].name).toBe('Other device')
      expect(store.result.current.saveControls('hero')?.entries[0].error).toContain('Another device changed')
    })
    release()
    await waitFor(() => expect(store.result.current.hasPendingWrite('hero')).toBe(false))
    expect(sessionStorage.getItem(`tablekeep-sheet-edits:owner:${path}`)).toContain('Mine')
    act(() => store.result.current.saveControls('hero')?.discard())
    expect(store.result.current.saveControls('hero')?.entries).toHaveLength(0)
    expect((await read()).name).toBe('Other device')
  })

  it('retains offline intentions and retries the same delta without discarding the edit', async () => {
    const store = hook(); await ready(store)
    connection.mode = 'offline'
    const before = store.result.current.characters[0]
    act(() => store.result.current.updateCharacterNow('hero', { lubec: { ...before.lubec, counters: { ...before.lubec.counters, stress: 5 } } }, before))
    await waitFor(() => expect(store.result.current.saveControls('hero')?.entries[0].error).toContain('Retry when connected'))
    const id = store.result.current.saveControls('hero')?.entries[0].intention.operationId
    connection.mode = 'normal'
    act(() => store.result.current.saveControls('hero')?.retry())
    await waitFor(async () => expect(await read()).toMatchObject({ sheetRevision: 1, lubec: { counters: { stress: 5 } } }))
    expect((await getDoc(doc(gm, path, 'writeReceipts', id!))).exists()).toBe(true)
  })
})

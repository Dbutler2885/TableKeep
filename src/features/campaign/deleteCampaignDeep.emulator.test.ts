/**
 * The browser's campaign deep delete, run against the real `firestore.rules`:
 * a group admin and a campaign GM who is not an admin each remove the
 * campaign's fight control, its fights with their logs and command receipts,
 * and the write receipts under its characters and NPC sheets, along with the
 * descendants it already removed. A save that lands on a sheet while the
 * campaign is being deleted leaves no receipt behind.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { saveSheetIntention } from '../character/characterStore/sheetIntentionTransaction'
import { deleteCampaignDeep } from './deleteCampaignDeep'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'
import { firestoreRules } from '../../../vitest.firestoreRules'

// Runs once, right after the deep delete lists one collection by path suffix.
const listing = vi.hoisted(() => ({ suffix: '', after: null as null | (() => Promise<void>) }))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  const getDocs: typeof actual.getDocs = async (query) => {
    const result = await actual.getDocs(query)
    const after = listing.after
    if (after && 'path' in query && String(query.path).endsWith(listing.suffix)) {
      listing.after = null
      await after()
    }
    return result
  }
  return { ...actual, getDocs }
})

const projectId = 'homeboyshouse-campaign-deep-delete-tests'
const groupId = 'deep-delete-group'
const campaignId = 'deep-delete-campaign'
const adminUid = 'deep-delete-admin'
const campaignGmUid = 'deep-delete-campaign-gm'
const playerUid = 'deep-delete-player'

const campaignPath = `groups/${groupId}/campaigns/${campaignId}`

const sheet = (ownerUserId: string) => ({
  system: 'lubec', ownerUserId, schemaVersion: 1, sheetRevision: 0,
  lubec: { counters: { stress: 2, minimumStress: 2, trauma: 0 }, gear: { items: [], carriers: [], overrides: [], supplies: [], backpackArt: 'teal' } },
})
const receipt = (operationId: string) => ({ outcome: { status: 'committed', operationId, revision: 0 } })

/** Every descendant the campaign holds, by path under the campaign. */
const DESCENDANTS: Record<string, object> = {
  'characters/wayne': sheet(playerUid),
  'characters/wayne/hiddenCarriers/stash': { name: 'Stash', items: [] },
  'characters/wayne/writeReceipts/create-wayne': receipt('create-wayne'),
  'characters/wayne/writeReceipts/op-1': receipt('op-1'),
  'npcSheets/ferryman': sheet(campaignGmUid),
  'npcSheets/ferryman/writeReceipts/create-ferryman': receipt('create-ferryman'),
  'npcs/ferryman': { name: 'Ferryman', visibleToPlayers: false },
  'combatControl/current': { activeFightId: 'fight-1' },
  'combats/fight-1': { status: 'live', participantUserIds: [playerUid], state: {} },
  'combats/fight-1/log/entry-1': { text: 'Wayne throws.' },
  'combats/fight-1/commands/command-1': { outcome: { status: 'committed' } },
  'combats/fight-0': { status: 'ended', participantUserIds: [playerUid], state: {} },
  'combats/fight-0/log/entry-1': { text: 'Over.' },
  'combats/fight-0/commands/command-1': { outcome: { status: 'committed' } },
  'maps/ford': { name: 'Ford' },
  'maps/ford/tokens/t1': { x: 1 },
  'tables/wandering': { name: 'Wandering' },
  'tables/wandering/history/h1': { roll: 7 },
  'gmItems/anvil': { name: 'Anvil' },
}

describe('deleting a campaign deeply', () => {
  let testEnv: RulesTestEnvironment
  const as = (uid: string) => testEnv.authenticatedContext(uid).firestore() as unknown as Firestore

  const withoutRules = async <T>(read: (db: Firestore) => Promise<T>): Promise<T> => {
    let result: T | undefined
    await testEnv.withSecurityRulesDisabled(async (context) => {
      result = await read(context.firestore() as unknown as Firestore)
    })
    return result as T
  }

  /** The descendants still stored, by path, out of `paths`. */
  const remaining = (paths: string[]) => withoutRules(async (db) => {
    const found: string[] = []
    for (const path of paths) {
      if ((await getDoc(doc(db, `${campaignPath}/${path}`))).exists()) found.push(path)
    }
    return found
  })
  const receiptCount = (sheetPath: string) =>
    withoutRules(async (db) => (await getDocs(collection(db, `${campaignPath}/${sheetPath}/writeReceipts`))).size)

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { host: '127.0.0.1', port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080), rules: firestoreRules() },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  afterEach(() => {
    listing.after = null
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await withoutRules(async (db) => {
      await setDoc(doc(db, 'groups', groupId), { createdBy: adminUid })
      const members: [string, string][] = [[adminUid, 'admin'], [campaignGmUid, 'member'], [playerUid, 'member']]
      for (const [uid, role] of members) {
        await setDoc(doc(db, 'groups', groupId, 'members', uid), { userId: uid, role, status: 'active' })
      }
      await setDoc(doc(db, campaignPath), { createdBy: campaignGmUid, gmUserId: campaignGmUid, system: 'lubec' })
      for (const [path, data] of Object.entries(DESCENDANTS)) await setDoc(doc(db, `${campaignPath}/${path}`), data)
    })
  })

  it('removes every descendant, combat and sheet receipts included, for a group admin and for the campaign GM', async () => {
    for (const uid of [adminUid, campaignGmUid]) {
      await deleteCampaignDeep(as(uid), groupId, campaignId)

      expect(await remaining(Object.keys(DESCENDANTS))).toEqual([])
      expect(await withoutRules(async (db) => (await getDoc(doc(db, campaignPath))).exists())).toBe(false)
      await withoutRules(async (db) => {
        await setDoc(doc(db, campaignPath), { createdBy: campaignGmUid, gmUserId: campaignGmUid, system: 'lubec' })
        for (const [path, data] of Object.entries(DESCENDANTS)) await setDoc(doc(db, `${campaignPath}/${path}`), data)
      })
    }
  })

  it('removes the receipt of a save that lands after the sheet\'s receipts were swept', async () => {
    listing.suffix = '/characters/wayne/writeReceipts'
    listing.after = async () => {
      const db = as(playerUid)
      const save = await saveSheetIntention(db, doc(db, `${campaignPath}/characters/wayne`), {
        operationId: 'raced-save', baseRevision: 0, edits: [{ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 2, amount: 1 }],
      })
      expect(save).toMatchObject({ status: 'committed' })
    }

    await deleteCampaignDeep(as(campaignGmUid), groupId, campaignId)

    expect(listing.after).toBeNull()
    expect(await remaining(['characters/wayne'])).toEqual([])
    expect(await receiptCount('characters/wayne')).toBe(0)
  })

  it('refuses a player, leaving the fights and receipts in place', async () => {
    await expect(deleteCampaignDeep(as(playerUid), groupId, campaignId)).rejects.toMatchObject({ code: 'permission-denied' })

    expect(await remaining(['combatControl/current', 'combats/fight-1/commands/command-1', 'npcSheets/ferryman/writeReceipts/create-ferryman']))
      .toEqual(['combatControl/current', 'combats/fight-1/commands/command-1', 'npcSheets/ferryman/writeReceipts/create-ferryman'])
    expect(await receiptCount('characters/wayne')).toBe(2)
  })
})

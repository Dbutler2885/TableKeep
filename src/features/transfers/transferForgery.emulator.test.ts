import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { doc, setDoc } from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

const projectId = 'homeboyshouse-transfer-forgery-tests'

const groupId = 'transfer-forgery-group'
const campaignId = 'transfer-forgery-campaign'
const attackerUid = 'attacker-uid'
const victimUid = 'victim-uid'
const attackerCharacterId = 'attacker-character'
const victimCharacterId = 'victim-character'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080),
    },
  })

  await testEnv.clearFirestore()

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, `campaigns/${campaignId}/members/${attackerUid}`), {
      userId: attackerUid,
      role: 'player',
      status: 'active',
    })
    await setDoc(doc(db, `campaigns/${campaignId}/members/${victimUid}`), {
      userId: victimUid,
      role: 'player',
      status: 'active',
    })
    await setDoc(doc(db, `campaigns/${campaignId}/characters/${attackerCharacterId}`), {
      ownerUserId: attackerUid,
      name: 'Attacker PC',
      details: { inventory: [] },
    })
    await setDoc(doc(db, `campaigns/${campaignId}/characters/${victimCharacterId}`), {
      ownerUserId: victimUid,
      name: 'Victim PC',
      details: {
        inventory: [{ id: 'sword-1', kind: 'weapon', equipped: false, qty: 1 }],
      },
    })
    await setDoc(doc(db, `groups/${groupId}/members/${attackerUid}`), {
      userId: attackerUid,
      role: 'member',
      status: 'active',
    })
    await setDoc(doc(db, `groups/${groupId}/members/${victimUid}`), {
      userId: victimUid,
      role: 'member',
      status: 'active',
    })
    await setDoc(
      doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${attackerCharacterId}`),
      {
        ownerUserId: attackerUid,
        name: 'Attacker PC',
        details: { inventory: [] },
      },
    )
    await setDoc(
      doc(db, `groups/${groupId}/campaigns/${campaignId}/characters/${victimCharacterId}`),
      {
        ownerUserId: victimUid,
        name: 'Victim PC',
        details: {
          inventory: [{ id: 'sword-1', kind: 'weapon', equipped: false, qty: 1 }],
        },
      },
    )
  })
})

describe('nested pending transfer source authorization', () => {
  it('rejects a transfer from a character the caller does not own', async () => {
    const attackerDb = testEnv.authenticatedContext(attackerUid).firestore()
    const forgedTransfer = {
      id: 'nested-forged-transfer',
      itemSnapshot: { id: 'sword-1', kind: 'weapon', equipped: false, qty: 1 },
      itemId: 'sword-1',
      itemKind: 'weapon',
      itemName: "Victim's Sword",
      fromCharacterId: victimCharacterId,
      fromCharacterName: 'Victim PC',
      fromUserId: attackerUid,
      toCharacterId: attackerCharacterId,
      toCharacterName: 'Attacker PC',
      toUserId: attackerUid,
      createdAt: new Date(),
    }

    await assertFails(
      setDoc(
        doc(
          attackerDb,
          `groups/${groupId}/campaigns/${campaignId}/pendingTransfers/nested-forged-transfer`,
        ),
        forgedTransfer,
      ),
    )
  })

  it('allows a transfer from a character the caller owns', async () => {
    const victimDb = testEnv.authenticatedContext(victimUid).firestore()
    const legitimateTransfer = {
      id: 'nested-legitimate-transfer',
      itemSnapshot: { id: 'sword-1', kind: 'weapon', equipped: false, qty: 1 },
      itemId: 'sword-1',
      itemKind: 'weapon',
      itemName: "Victim's Sword",
      fromCharacterId: victimCharacterId,
      fromCharacterName: 'Victim PC',
      fromUserId: victimUid,
      toCharacterId: attackerCharacterId,
      toCharacterName: 'Attacker PC',
      toUserId: attackerUid,
      createdAt: new Date(),
    }

    await assertSucceeds(
      setDoc(
        doc(
          victimDb,
          `groups/${groupId}/campaigns/${campaignId}/pendingTransfers/nested-legitimate-transfer`,
        ),
        legitimateTransfer,
      ),
    )
  })
})

describe('legacy pending transfer source authorization', () => {
  it('rejects a transfer from a character the caller does not own', async () => {
    const attackerDb = testEnv.authenticatedContext(attackerUid).firestore()
    const forgedTransfer = {
      id: 'forged-transfer',
      itemSnapshot: { id: 'sword-1', kind: 'weapon', equipped: false, qty: 1 },
      itemId: 'sword-1',
      itemKind: 'weapon',
      itemName: "Victim's Sword",
      fromCharacterId: victimCharacterId,
      fromCharacterName: 'Victim PC',
      fromUserId: attackerUid,
      toCharacterId: attackerCharacterId,
      toCharacterName: 'Attacker PC',
      toUserId: attackerUid,
      createdAt: new Date(),
    }

    await assertFails(
      setDoc(
        doc(attackerDb, `campaigns/${campaignId}/pendingTransfers/forged-transfer`),
        forgedTransfer,
      ),
    )
  })

  it('allows a transfer from a character the caller owns', async () => {
    const victimDb = testEnv.authenticatedContext(victimUid).firestore()
    const legitimateTransfer = {
      id: 'legitimate-transfer',
      itemSnapshot: { id: 'sword-1', kind: 'weapon', equipped: false, qty: 1 },
      itemId: 'sword-1',
      itemKind: 'weapon',
      itemName: "Victim's Sword",
      fromCharacterId: victimCharacterId,
      fromCharacterName: 'Victim PC',
      fromUserId: victimUid,
      toCharacterId: attackerCharacterId,
      toCharacterName: 'Attacker PC',
      toUserId: attackerUid,
      createdAt: new Date(),
    }

    await assertSucceeds(
      setDoc(
        doc(victimDb, `campaigns/${campaignId}/pendingTransfers/legitimate-transfer`),
        legitimateTransfer,
      ),
    )
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import type {
  CharacterGoldItem,
  CharacterInventoryItem,
  CharacterRecord,
  CharacterSheetDetails,
} from '../../../types/app'
import { makeDroppedGoldCampaignItem } from '../inventoryOverflow'
import { amountForTarget } from './grantPlanning'
import { applyGrantToCharacter, type ApplyGrantToCharacterParams } from './grantTransaction'
import { emulatorPort } from '../../../../vitest.emulatorEndpoint'

const projectId = 'homeboyshouse-grant-tools-tests'
const groupId = 'grant-group'
const campaignId = 'grant-campaign'
const gmUid = 'grant-gm'
const ownerUid = 'grant-owner'
const otherMemberUid = 'grant-other-member'
const campaignPath = ['groups', groupId, 'campaigns', campaignId] as const

const abilityScores = { STR: '10', INT: '10', WIS: '10', DEX: '10', CON: '10', CHA: '10' }

const makeTarget = (id: string, ownerUserId = ownerUid): CharacterRecord => ({
  id,
  name: id === 'character-1' ? 'Ada' : 'Borin',
  ownerUserId,
  ownerUsername: ownerUserId,
  creationMode: 'new',
  creationModeExplicit: true,
  creationStatus: 'active',
  className: 'Fighter',
  level: 1,
  hpCurrent: 6,
  hpMax: 6,
  ac: 10,
  xp: 0,
  portraitPath: '',
  portraitUrl: null,
  portraitFocusX: 50,
  portraitFocusY: 50,
  tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
})

const details = (inventory: CharacterInventoryItem[] = []): Partial<CharacterSheetDetails> => ({
  abilityScores,
  inventory,
})

const ropeEntry = {
  key: 'gear-rope',
  name: 'Rope',
  costGp: 1,
  qty: 1,
  kind: 'general' as const,
}

const inventoryFrom = async (db: Firestore, characterId: string) => {
  const snapshot = await getDoc(doc(db, ...campaignPath, 'characters', characterId))
  return (snapshot.data()?.details?.inventory ?? []) as CharacterInventoryItem[]
}

const goldTotal = (inventory: CharacterInventoryItem[]) => inventory
  .filter((item): item is CharacterGoldItem => item.kind === 'gold')
  .reduce((sum, item) => sum + item.qty, 0)

describe('grant transaction on Firestore emulator', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: emulatorPort('FIRESTORE_EMULATOR_HOST', 8080),
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'groups', groupId), { createdBy: gmUid })
      await setDoc(doc(db, 'groups', groupId, 'members', gmUid), {
        userId: gmUid,
        role: 'admin',
        status: 'active',
      })
      await setDoc(doc(db, 'groups', groupId, 'members', ownerUid), {
        userId: ownerUid,
        role: 'member',
        status: 'active',
      })
      await setDoc(doc(db, 'groups', groupId, 'members', otherMemberUid), {
        userId: otherMemberUid,
        role: 'member',
        status: 'active',
      })
      await setDoc(doc(db, ...campaignPath), {
        createdBy: gmUid,
        gmUserId: gmUid,
        status: 'active',
      })
      for (const target of [makeTarget('character-1'), makeTarget('character-2', otherMemberUid)]) {
        await setDoc(doc(db, ...campaignPath, 'characters', target.id), {
          ...target,
          details: details(),
        })
      }
    })
  })

  const grant = (
    db: Firestore,
    characterId: string,
    overrides: Partial<ApplyGrantToCharacterParams> = {},
  ) => {
    const target = makeTarget(characterId, characterId === 'character-2' ? otherMemberUid : ownerUid)
    const charRef = doc(db, ...campaignPath, 'characters', characterId)
    return runTransaction(db, (tx) => applyGrantToCharacter(tx, charRef, {
      target,
      xpAmount: 0,
      goldAmount: 0,
      campaignEntries: [],
      templateEntries: [],
      overflowGoldDocId: `overflow-gold-${characterId}`,
      ...overrides,
    }))
  }

  it('applies XP-only, gold-only, item-only, and combined grants', async () => {
    const db = testEnv.authenticatedContext(gmUid).firestore()

    await grant(db, 'character-1', { xpAmount: 25 })
    expect((await getDoc(doc(db, ...campaignPath, 'characters', 'character-1'))).data()?.xp).toBe(25)

    await grant(db, 'character-1', { goldAmount: 120 })
    expect(goldTotal(await inventoryFrom(db, 'character-1'))).toBe(120)

    await grant(db, 'character-1', { templateEntries: [ropeEntry] })
    expect(await inventoryFrom(db, 'character-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'general', name: 'Rope' }),
    ]))

    const authoredGold = { ...makeDroppedGoldCampaignItem(7, 'source', 'Source'), status: 'authored' as const }
    await grant(db, 'character-1', {
      xpAmount: 10,
      goldAmount: 3,
      campaignEntries: [{ entry: { itemId: authoredGold.id, name: 'Gold', qty: 1 }, item: authoredGold }],
      templateEntries: [{ ...ropeEntry, qty: 2 }],
    })
    const snapshot = await getDoc(doc(db, ...campaignPath, 'characters', 'character-1'))
    expect(snapshot.data()?.xp).toBe(35)
    expect(goldTotal((snapshot.data()?.details?.inventory ?? []) as CharacterInventoryItem[])).toBe(130)
    expect((snapshot.data()?.details?.inventory as CharacterInventoryItem[]).filter((item) => item.kind === 'general')).toHaveLength(3)
  })

  it('uses the same split and remainder amounts for multiple targets', async () => {
    const db = testEnv.authenticatedContext(gmUid).firestore()
    const targets = ['character-1', 'character-2']
    for (let index = 0; index < targets.length; index += 1) {
      await grant(db, targets[index], {
        xpAmount: amountForTarget(7, true, targets.length, index),
        goldAmount: amountForTarget(5, false, targets.length, index),
      })
    }

    expect((await getDoc(doc(db, ...campaignPath, 'characters', 'character-1'))).data()?.xp).toBe(4)
    expect((await getDoc(doc(db, ...campaignPath, 'characters', 'character-2'))).data()?.xp).toBe(3)
    expect(goldTotal(await inventoryFrom(db, 'character-1'))).toBe(5)
    expect(goldTotal(await inventoryFrom(db, 'character-2'))).toBe(5)
  })

  it('writes overflow items and gold to the nested campaign items collection', async () => {
    const db = testEnv.authenticatedContext(gmUid).firestore()
    const result = await grant(db, 'character-1', {
      goldAmount: 200,
      templateEntries: [{ ...ropeEntry, qty: 17 }],
    })

    expect(result.inventory.filter((item) => item.kind === 'general')).toHaveLength(16)
    expect(result.inventory.filter((item) => item.kind === 'gold')).toHaveLength(0)
    expect(result.overflowFeedback).toContain('Not all items fit')
    const dropped = (await getDocs(collection(db, ...campaignPath, 'items'))).docs.map((snapshot) => snapshot.data())
    expect(dropped).toHaveLength(2)
    expect(dropped).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'dropped', droppedByCharacterId: 'character-1', type: 'general' }),
      expect.objectContaining({ status: 'dropped', droppedByCharacterId: 'character-1', type: 'gold', goldAmount: 200 }),
    ]))
  })

  it('allows the campaign GM and denies a member writing another owner’s character', async () => {
    const gmDb = testEnv.authenticatedContext(gmUid).firestore()
    const memberDb = testEnv.authenticatedContext(ownerUid).firestore()

    await assertSucceeds(grant(gmDb, 'character-2', { xpAmount: 1 }))
    await assertFails(grant(memberDb, 'character-2', { xpAmount: 1 }))
  })
})

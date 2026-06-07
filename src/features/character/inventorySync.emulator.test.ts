import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, setDoc, waitForPendingWrites } from 'firebase/firestore'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type {
  CharacterAmmunitionItem,
  CharacterGoldItem,
  CharacterGeneralItem,
  CharacterInventoryItem,
  CharacterSheetDetails,
  PendingTransfer,
} from '../../types/app'
import { shouldAdoptIncomingInventory } from './inventorySync'
import { applyAcceptedTransfer } from '../transfers/transferResolution'
import { computeAvailablePackedSlots, computeOverflow, makeDroppedGoldCampaignItem, makeGoldItem } from './inventoryOverflow'
import { campaignGoldToInventoryChunks } from '../items/itemConversion'

const projectId = 'homeboyshouse-emulator-tests'
const campaignId = 'campaign-1'
const characterId = 'character-1'
const receiverCharacterId = 'character-2'
const gmUid = 'gm-user'
const playerUid = 'player-user'
const otherPlayerUid = 'other-player-user'

const makeGeneralItem = (id: string, name: string): CharacterGeneralItem => ({
  id,
  kind: 'general',
  typeId: id,
  typeName: name,
  name,
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 1,
  stack: { stackable: false },
})

const makeAmmoItem = (id: string, qty: number): CharacterAmmunitionItem => ({
  id,
  kind: 'ammunition',
  typeId: 'ammo-arrows',
  typeName: 'Arrows',
  name: 'Arrows',
  costGp: 0,
  equipped: false,
  notes: '',
  qty,
  stack: { stackable: true, maxStack: 20 },
})

const sumGold = (inventory: CharacterInventoryItem[]) =>
  inventory
    .filter((item): item is CharacterGoldItem => item.kind === 'gold')
    .reduce((sum, item) => sum + (item.qty ?? 0), 0)

const inventoryFromDetails = (details: CharacterSheetDetails | null) =>
  (details?.inventory ?? []) as CharacterInventoryItem[]

const detailsFromSnap = async (ref: Parameters<typeof getDoc>[0]) => {
  const snapshot = await getDoc(ref)
  return (snapshot.data()?.details ?? null) as CharacterSheetDetails | null
}

const adoptInventory = (
  incomingInventory: CharacterInventoryItem[],
  lastPersistedInventoryJson: string | undefined,
) => shouldAdoptIncomingInventory({
  hasPendingWrite: false,
  isLocallyDirtyInventory: false,
  incomingInventory,
  lastPersistedInventoryJson,
})

describe('inventory sync on Firestore emulator', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('keeps a GM-added inventory item when the player later persists unrelated dirty details', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'campaigns', campaignId), { createdBy: gmUid, status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', gmUid), {
        userId: gmUid,
        role: 'gm',
        status: 'active',
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', playerUid), {
        userId: playerUid,
        role: 'player',
        status: 'active',
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', otherPlayerUid), {
        userId: otherPlayerUid,
        role: 'player',
        status: 'active',
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId), {
        ownerUserId: playerUid,
        name: 'Test Character',
        details: {
          inventory: [makeGeneralItem('rope', 'Rope')],
          otherNotesText: '',
        },
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', receiverCharacterId), {
        ownerUserId: otherPlayerUid,
        name: 'Receiver Character',
        details: {
          inventory: [],
          otherNotesText: '',
        },
      })
    })

    const gmDb = testEnv.authenticatedContext(gmUid).firestore()
    const playerDb = testEnv.authenticatedContext(playerUid).firestore()
    const playerCharacterRef = doc(playerDb, 'campaigns', campaignId, 'characters', characterId)
    const gmCharacterRef = doc(gmDb, 'campaigns', campaignId, 'characters', characterId)

    let playerLocalInventory: CharacterInventoryItem[] = []
    let playerLastPersistedInventoryJson: string | undefined
    let playerNotesDraft = ''

    const initialPlayerSnap = await getDoc(playerCharacterRef)
    {
      const details = (initialPlayerSnap.data()?.details ?? null) as CharacterSheetDetails | null
      const incomingInventory = inventoryFromDetails(details)
      const decision = shouldAdoptIncomingInventory({
        hasPendingWrite: false,
        isLocallyDirtyInventory: false,
        incomingInventory,
        lastPersistedInventoryJson: playerLastPersistedInventoryJson,
      })
      if (decision.shouldAdopt || playerLastPersistedInventoryJson === undefined) {
        playerLocalInventory = incomingInventory
        playerLastPersistedInventoryJson = decision.incomingInventoryJson
      }
    }
    expect(playerLocalInventory.map((item) => item.id)).toEqual(['rope'])

    playerNotesDraft = 'Dirty local notes from player client'

    await setDoc(gmCharacterRef, {
      details: {
        inventory: [makeGeneralItem('rope', 'Rope'), makeGeneralItem('torch', 'Torch')],
        otherNotesText: '',
      },
    }, { merge: true })
    await waitForPendingWrites(gmDb)

    const remotePlayerSnap = await getDoc(playerCharacterRef)
    {
      const details = (remotePlayerSnap.data()?.details ?? null) as CharacterSheetDetails | null
      const incomingInventory = inventoryFromDetails(details)
      const decision = shouldAdoptIncomingInventory({
        hasPendingWrite: false,
        isLocallyDirtyInventory: false,
        incomingInventory,
        lastPersistedInventoryJson: playerLastPersistedInventoryJson,
      })
      if (decision.shouldAdopt) {
        playerLocalInventory = incomingInventory
        playerLastPersistedInventoryJson = decision.incomingInventoryJson
      }
    }

    expect(playerLocalInventory.map((item) => item.id)).toEqual(['rope', 'torch'])

    await setDoc(playerCharacterRef, {
      details: {
        inventory: playerLocalInventory,
        otherNotesText: playerNotesDraft,
      },
    }, { merge: true })
    await waitForPendingWrites(playerDb)

    let finalInventoryIds: string[] = []
    let finalNotes = ''
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      const snapshot = await getDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId))
      const details = (snapshot.data()?.details ?? null) as CharacterSheetDetails | null
      finalInventoryIds = inventoryFromDetails(details).map((item) => item.id)
      finalNotes = typeof details?.otherNotesText === 'string' ? details.otherNotesText : ''
    })

    expect(finalInventoryIds).toEqual(['rope', 'torch'])
    expect(finalNotes).toBe(playerNotesDraft)
  })

  it('keeps the item with the giver while a give offer is pending, then moves it on acceptance', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'campaigns', campaignId), { createdBy: gmUid, status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', gmUid), {
        userId: gmUid,
        role: 'gm',
        status: 'active',
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', playerUid), {
        userId: playerUid,
        role: 'player',
        status: 'active',
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', otherPlayerUid), {
        userId: otherPlayerUid,
        role: 'player',
        status: 'active',
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId), {
        ownerUserId: playerUid,
        name: 'Giver Character',
        details: {
          inventory: [makeAmmoItem('arrows-1', 10)],
          otherNotesText: '',
        },
      })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', receiverCharacterId), {
        ownerUserId: otherPlayerUid,
        name: 'Receiver Character',
        details: {
          inventory: [],
          otherNotesText: '',
        },
      })
    })

    const giverDb = testEnv.authenticatedContext(playerUid).firestore()
    const receiverDb = testEnv.authenticatedContext(otherPlayerUid).firestore()
    const giverRef = doc(giverDb, 'campaigns', campaignId, 'characters', characterId)
    const receiverRef = doc(receiverDb, 'campaigns', campaignId, 'characters', receiverCharacterId)
    const pendingTransferRef = doc(giverDb, 'campaigns', campaignId, 'pendingTransfers', 'transfer-1')

    const offeredSnapshot = makeAmmoItem('split-offer-1', 4)
    const pendingTransfer: PendingTransfer = {
      id: 'transfer-1',
      itemSnapshot: offeredSnapshot,
      itemId: 'arrows-1',
      itemKind: offeredSnapshot.kind,
      itemName: offeredSnapshot.name ?? offeredSnapshot.typeName,
      fromCharacterId: characterId,
      fromCharacterName: 'Giver Character',
      fromUserId: playerUid,
      toCharacterId: receiverCharacterId,
      toCharacterName: 'Receiver Character',
      toUserId: otherPlayerUid,
      createdAt: new Date().toISOString(),
    }

    await setDoc(pendingTransferRef, pendingTransfer)
    await waitForPendingWrites(giverDb)

    const pendingGiverDetails = await detailsFromSnap(giverRef)
    const pendingReceiverDetails = await detailsFromSnap(receiverRef)
    expect(inventoryFromDetails(pendingGiverDetails).map((item) => `${item.id}:${item.qty}`)).toEqual(['arrows-1:10'])
    expect(inventoryFromDetails(pendingReceiverDetails)).toEqual([])

    const acceptResult = applyAcceptedTransfer({
      senderInventory: inventoryFromDetails(pendingGiverDetails),
      receiverInventory: inventoryFromDetails(pendingReceiverDetails),
      transfer: {
        itemId: pendingTransfer.itemId,
        itemSnapshot: pendingTransfer.itemSnapshot,
      },
      packedAllowed: 20,
    })

    expect(acceptResult.ok).toBe(true)
    if (!acceptResult.ok) return

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId), {
        details: {
          inventory: acceptResult.senderInventory,
        },
      }, { merge: true })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', receiverCharacterId), {
        details: {
          inventory: acceptResult.receiverInventory,
        },
      }, { merge: true })
    })

    const finalGiverDetails = await detailsFromSnap(giverRef)
    const finalReceiverDetails = await detailsFromSnap(receiverRef)
    expect(inventoryFromDetails(finalGiverDetails).map((item) => `${item.id}:${item.qty}`)).toEqual(['arrows-1:6'])
    expect(inventoryFromDetails(finalReceiverDetails).map((item) => `${item.id}:${item.qty}`)).toEqual(['split-offer-1:4'])
  })

  it('keeps a direct GM gold grant when the player later persists unrelated dirty details', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'campaigns', campaignId), { createdBy: gmUid, status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', gmUid), { userId: gmUid, role: 'gm', status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', playerUid), { userId: playerUid, role: 'player', status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId), {
        ownerUserId: playerUid,
        name: 'Gold Target',
        details: {
          abilityScores: { STR: '10' },
          inventory: [],
          otherNotesText: '',
        },
      })
    })

    const gmDb = testEnv.authenticatedContext(gmUid).firestore()
    const playerDb = testEnv.authenticatedContext(playerUid).firestore()
    const gmCharacterRef = doc(gmDb, 'campaigns', campaignId, 'characters', characterId)
    const playerCharacterRef = doc(playerDb, 'campaigns', campaignId, 'characters', characterId)

    let playerLocalInventory: CharacterInventoryItem[] = []
    let playerLastPersistedInventoryJson: string | undefined
    const initialDetails = await detailsFromSnap(playerCharacterRef)
    {
      const decision = adoptInventory(inventoryFromDetails(initialDetails), playerLastPersistedInventoryJson)
      playerLocalInventory = inventoryFromDetails(initialDetails)
      playerLastPersistedInventoryJson = decision.incomingInventoryJson
    }

    const grantedGold = campaignGoldToInventoryChunks(175)
    await setDoc(gmCharacterRef, {
      details: {
        abilityScores: { STR: '10' },
        inventory: grantedGold,
        otherNotesText: '',
      },
    }, { merge: true })
    await waitForPendingWrites(gmDb)

    const remoteDetails = await detailsFromSnap(playerCharacterRef)
    {
      const incomingInventory = inventoryFromDetails(remoteDetails)
      const decision = adoptInventory(incomingInventory, playerLastPersistedInventoryJson)
      if (decision.shouldAdopt) {
        playerLocalInventory = incomingInventory
        playerLastPersistedInventoryJson = decision.incomingInventoryJson
      }
    }

    expect(sumGold(playerLocalInventory)).toBe(175)

    await setDoc(playerCharacterRef, {
      details: {
        abilityScores: { STR: '10' },
        inventory: playerLocalInventory,
        otherNotesText: 'player dirty notes',
      },
    }, { merge: true })
    await waitForPendingWrites(playerDb)

    const finalDetails = await detailsFromSnap(playerCharacterRef)
    expect(sumGold(inventoryFromDetails(finalDetails))).toBe(175)
    expect(finalDetails?.otherNotesText).toBe('player dirty notes')
  })

  it('grants dropped gold to a player and removes the world gold doc when fully consumed', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'campaigns', campaignId), { createdBy: gmUid, status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', gmUid), { userId: gmUid, role: 'gm', status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', playerUid), { userId: playerUid, role: 'player', status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId), {
        ownerUserId: playerUid,
        name: 'Gold Target',
        details: {
          abilityScores: { STR: '12' },
          inventory: [],
          otherNotesText: '',
        },
      })
      const droppedGold = makeDroppedGoldCampaignItem(90, 'dropper-1', 'Dropper', 'dropped-gold-1')
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'items', droppedGold.id), droppedGold)
    })

    const playerDb = testEnv.authenticatedContext(playerUid).firestore()
    const targetRef = doc(playerDb, 'campaigns', campaignId, 'characters', characterId)
    const droppedGoldRef = doc(playerDb, 'campaigns', campaignId, 'items', 'dropped-gold-1')

    const beforeDetails = await detailsFromSnap(targetRef)
    const currentInventory = inventoryFromDetails(beforeDetails)
    const availableSlots = computeAvailablePackedSlots(12)
    const candidateInventory = [...currentInventory, ...campaignGoldToInventoryChunks(90)]
    const overflow = computeOverflow(candidateInventory, availableSlots, characterId, 'Gold Target')
    const existingGoldBeforeGrant = sumGold(currentInventory)
    const keptGoldTotal = sumGold(overflow.keptInventory)
    const acceptedFromSource = Math.max(0, Math.min(90, keptGoldTotal - existingGoldBeforeGrant))
    const sourceRemainder = Math.max(0, 90 - acceptedFromSource)

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(targetRef, {
        details: {
          ...(beforeDetails ?? {}),
          inventory: overflow.keptInventory,
        },
      }, { merge: true })
      if (sourceRemainder <= 0) {
        await deleteDoc(doc(adminDb, 'campaigns', campaignId, 'items', 'dropped-gold-1'))
      } else {
        await setDoc(doc(adminDb, 'campaigns', campaignId, 'items', 'dropped-gold-1'), { goldAmount: sourceRemainder }, { merge: true })
      }
    })

    const finalDetails = await detailsFromSnap(targetRef)
    const finalDroppedGoldSnap = await getDoc(droppedGoldRef)
    expect(sumGold(inventoryFromDetails(finalDetails))).toBe(90)
    expect(finalDroppedGoldSnap.exists()).toBe(false)
  })

  it('keeps spent gold after another client later persists unrelated dirty details', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'campaigns', campaignId), { createdBy: gmUid, status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', gmUid), { userId: gmUid, role: 'gm', status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'members', playerUid), { userId: playerUid, role: 'player', status: 'active' })
      await setDoc(doc(adminDb, 'campaigns', campaignId, 'characters', characterId), {
        ownerUserId: playerUid,
        name: 'Spender',
        details: {
          abilityScores: { STR: '10' },
          inventory: [makeGoldItem(100), makeGoldItem(50)],
          otherNotesText: '',
        },
      })
    })

    const gmDb = testEnv.authenticatedContext(gmUid).firestore()
    const playerDb = testEnv.authenticatedContext(playerUid).firestore()
    const gmCharacterRef = doc(gmDb, 'campaigns', campaignId, 'characters', characterId)
    const playerCharacterRef = doc(playerDb, 'campaigns', campaignId, 'characters', characterId)

    let gmLocalInventory: CharacterInventoryItem[] = []
    let gmLastPersistedInventoryJson: string | undefined
    const gmInitialDetails = await detailsFromSnap(gmCharacterRef)
    {
      const incomingInventory = inventoryFromDetails(gmInitialDetails)
      const decision = adoptInventory(incomingInventory, gmLastPersistedInventoryJson)
      gmLocalInventory = incomingInventory
      gmLastPersistedInventoryJson = decision.incomingInventoryJson
    }

    const playerDetails = await detailsFromSnap(playerCharacterRef)
    const playerCurrentInventory = inventoryFromDetails(playerDetails)
    const playerSpentGold = [...playerCurrentInventory.filter((item) => item.kind !== 'gold'), ...campaignGoldToInventoryChunks(120)]
    await setDoc(playerCharacterRef, {
      details: {
        ...(playerDetails ?? {}),
        inventory: playerSpentGold,
        otherNotesText: '',
      },
    }, { merge: true })
    await waitForPendingWrites(playerDb)

    const gmRemoteDetails = await detailsFromSnap(gmCharacterRef)
    {
      const incomingInventory = inventoryFromDetails(gmRemoteDetails)
      const decision = adoptInventory(incomingInventory, gmLastPersistedInventoryJson)
      if (decision.shouldAdopt) {
        gmLocalInventory = incomingInventory
        gmLastPersistedInventoryJson = decision.incomingInventoryJson
      }
    }

    expect(sumGold(gmLocalInventory)).toBe(120)

    await setDoc(gmCharacterRef, {
      details: {
        ...(gmRemoteDetails ?? {}),
        inventory: gmLocalInventory,
        otherNotesText: 'gm dirty notes',
      },
    }, { merge: true })
    await waitForPendingWrites(gmDb)

    const finalDetails = await detailsFromSnap(playerCharacterRef)
    expect(sumGold(inventoryFromDetails(finalDetails))).toBe(120)
    expect(finalDetails?.otherNotesText).toBe('gm dirty notes')
  })
})

describe('nested group/campaign security rules', () => {
  let testEnv: RulesTestEnvironment

  const groupId = 'group-1'
  const cid = 'campaign-1'
  // gmUid is the group admin and the campaign gmUserId.
  // memberUid is a non-admin active group member (a "player").
  // outsiderUid has no group membership.
  const outsiderUid = 'outsider-user'

  // Path segments for groups/{groupId}/campaigns/{cid}
  const CC = ['groups', groupId, 'campaigns', cid] as const

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeAll(async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'groups', groupId), { createdBy: gmUid })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', gmUid), {
        userId: gmUid, role: 'admin', status: 'active',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'members', playerUid), {
        userId: playerUid, role: 'member', status: 'active',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', cid), {
        createdBy: gmUid, gmUserId: gmUid, status: 'active',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', cid, 'characters', characterId), {
        ownerUserId: playerUid, name: 'Player Character', details: { inventory: [] },
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', cid, 'sharedNotes', 'note-1'), {
        body: 'session note',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', cid, 'tables', 'table-1'), {
        name: 'Loot Table',
      })
      await setDoc(doc(adminDb, 'groups', groupId, 'campaigns', cid, 'userState', playerUid), {
        currentCharacterId: characterId,
      })
    })
  })

  it('userState is owner-only for active group members', async () => {
    const playerDb = testEnv.authenticatedContext(playerUid).firestore()
    const outsiderDb = testEnv.authenticatedContext(outsiderUid).firestore()

    // Owner (active group member) can read + write their own userState.
    await assertSucceeds(getDoc(doc(playerDb, ...CC, 'userState', playerUid)))
    await assertSucceeds(
      setDoc(doc(playerDb, ...CC, 'userState', playerUid), { currentCharacterId: characterId }),
    )

    // Member cannot read or write another user's userState.
    await assertFails(getDoc(doc(playerDb, ...CC, 'userState', gmUid)))
    await assertFails(
      setDoc(doc(playerDb, ...CC, 'userState', gmUid), { currentCharacterId: 'x' }),
    )

    // A non-group-member cannot touch their own userState here.
    await assertFails(
      setDoc(doc(outsiderDb, ...CC, 'userState', outsiderUid), { currentCharacterId: 'x' }),
    )
  })

  it('GM-only collections reject non-GM members and accept the campaign GM', async () => {
    const gmDb = testEnv.authenticatedContext(gmUid).firestore()
    const playerDb = testEnv.authenticatedContext(playerUid).firestore()

    // Campaign GM (also group admin) can write a GM-only `tables` doc.
    await assertSucceeds(
      setDoc(doc(gmDb, ...CC, 'tables', 'table-1'), { name: 'Loot Table v2' }),
    )

    // Non-GM member can neither read nor write GM-only `tables`.
    await assertFails(getDoc(doc(playerDb, ...CC, 'tables', 'table-1')))
    await assertFails(
      setDoc(doc(playerDb, ...CC, 'tables', 'table-1'), { name: 'hacked' }),
    )
  })

  it('group members can read campaign characters and notes; outsiders cannot', async () => {
    const playerDb = testEnv.authenticatedContext(playerUid).firestore()
    const outsiderDb = testEnv.authenticatedContext(outsiderUid).firestore()

    await assertSucceeds(getDoc(doc(playerDb, ...CC, 'characters', characterId)))
    await assertSucceeds(getDoc(doc(playerDb, ...CC, 'sharedNotes', 'note-1')))

    await assertFails(getDoc(doc(outsiderDb, ...CC, 'characters', characterId)))
    await assertFails(getDoc(doc(outsiderDb, ...CC, 'sharedNotes', 'note-1')))
  })
})

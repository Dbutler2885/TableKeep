import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

const projectId = 'homeboyshouse-legacy-campaign-access-tests'
const campaignId = 'legacy-campaign'
const gmUid = 'legacy-gm'
const memberUid = 'legacy-member'
const outsiderUid = 'legacy-outsider'
const anonymousUid = 'legacy-anonymous'

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
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'campaigns', campaignId), {
      name: 'Legacy Campaign',
      status: 'active',
      createdBy: gmUid,
      gmUserId: gmUid,
    })
    await setDoc(doc(db, 'campaigns', campaignId, 'members', gmUid), {
      userId: gmUid,
      role: 'gm',
      status: 'active',
    })
    await setDoc(doc(db, 'campaigns', campaignId, 'members', memberUid), {
      userId: memberUid,
      role: 'player',
      status: 'active',
    })
  })
})

describe('legacy campaign access', () => {
  it('denies the campaign document to an authenticated non-member', async () => {
    const db = testEnv.authenticatedContext(outsiderUid).firestore()

    await assertFails(getDoc(doc(db, 'campaigns', campaignId)))
  })

  it('denies the campaign document to an anonymous demo user', async () => {
    const db = testEnv.authenticatedContext(anonymousUid, {
      firebase: { sign_in_provider: 'anonymous' },
    }).firestore()

    await assertFails(getDoc(doc(db, 'campaigns', campaignId)))
  })

  it('allows an active legacy campaign member to read the campaign document', async () => {
    const db = testEnv.authenticatedContext(memberUid).firestore()

    await assertSucceeds(getDoc(doc(db, 'campaigns', campaignId)))
  })
})

describe('legacy character creation', () => {
  it('denies an owned character from an authenticated non-member', async () => {
    const db = testEnv.authenticatedContext(outsiderUid).firestore()

    await assertFails(
      setDoc(doc(db, 'campaigns', campaignId, 'characters', 'outsider-character'), {
        ownerUserId: outsiderUid,
        name: 'Outsider Character',
        details: {},
      }),
    )
  })

  it('denies an owned character from an anonymous demo user', async () => {
    const db = testEnv.authenticatedContext(anonymousUid, {
      firebase: { sign_in_provider: 'anonymous' },
    }).firestore()

    await assertFails(
      setDoc(doc(db, 'campaigns', campaignId, 'characters', 'anonymous-character'), {
        ownerUserId: anonymousUid,
        name: 'Anonymous Character',
        details: {},
      }),
    )
  })

  it('allows an active legacy campaign member to create a character they own', async () => {
    const db = testEnv.authenticatedContext(memberUid).firestore()

    await assertSucceeds(
      setDoc(doc(db, 'campaigns', campaignId, 'characters', 'member-character'), {
        ownerUserId: memberUid,
        name: 'Member Character',
        details: {},
      }),
    )
  })

  it('denies a legacy campaign member creating a character for another user', async () => {
    const db = testEnv.authenticatedContext(memberUid).firestore()

    await assertFails(
      setDoc(doc(db, 'campaigns', campaignId, 'characters', 'forged-owner-character'), {
        ownerUserId: outsiderUid,
        name: 'Forged Owner Character',
        details: {},
      }),
    )
  })

  it('allows the legacy campaign GM to create a character for another user', async () => {
    const db = testEnv.authenticatedContext(gmUid).firestore()

    await assertSucceeds(
      setDoc(doc(db, 'campaigns', campaignId, 'characters', 'gm-created-character'), {
        ownerUserId: memberUid,
        name: 'GM-Created Character',
        details: {},
      }),
    )
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

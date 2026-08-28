import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { claimUsername, isClaimUsernameError } from './claimUsername'
import { emulatorPort } from '../../../vitest.emulatorEndpoint'

const projectId = 'homeboyshouse-claim-username-tests'
const userUid = 'user-1'
const otherUid = 'user-2'
const username = 'Player1'

describe('claimUsername on Firestore emulator', () => {
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
    await testEnv?.cleanup()
  })

  it('claims a free username', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()

      await claimUsername(userUid, username, adminDb)

      const usernameSnap = await getDoc(doc(adminDb, 'usernames', username))
      const userSnap = await getDoc(doc(adminDb, 'users', userUid))

      expect(usernameSnap.data()?.uid).toBe(userUid)
      expect(userSnap.data()?.username).toBe(username)
    })
  })

  it('refuses to overwrite an existing username on the same user', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users', userUid), { username: 'Other01' })

      await expect(claimUsername(userUid, username, adminDb)).rejects.toSatisfy(
        (error: unknown) => isClaimUsernameError(error, 'user-already-has-username'),
      )
    })
  })

  it('refuses to claim a username owned by another uid', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'usernames', username), { uid: otherUid })

      await expect(claimUsername(userUid, username, adminDb)).rejects.toSatisfy(
        (error: unknown) => isClaimUsernameError(error, 'username-taken'),
      )
    })
  })

  it('is idempotent when the owning uid re-claims the same username', async () => {
    await testEnv.clearFirestore()

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'usernames', username), { uid: userUid })
      await setDoc(doc(adminDb, 'users', userUid), { username })

      await claimUsername(userUid, username, adminDb)

      const usernameSnap = await getDoc(doc(adminDb, 'usernames', username))
      const userSnap = await getDoc(doc(adminDb, 'users', userUid))

      expect(usernameSnap.data()?.uid).toBe(userUid)
      expect(userSnap.data()?.username).toBe(username)
    })
  })
})

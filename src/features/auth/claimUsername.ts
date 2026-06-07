import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'

export type ClaimUsernameErrorCode = 'username-taken' | 'user-already-has-username'

export class ClaimUsernameError extends Error {
  code: ClaimUsernameErrorCode

  constructor(code: ClaimUsernameErrorCode, message: string) {
    super(message)
    this.name = 'ClaimUsernameError'
    this.code = code
  }
}

export function isClaimUsernameError(
  error: unknown,
  code?: ClaimUsernameErrorCode,
): error is ClaimUsernameError {
  if (!(error instanceof ClaimUsernameError)) {
    return false
  }

  return code === undefined || error.code === code
}

export async function claimUsername(uid: string, username: string, firestore: Firestore) {
  await runTransaction(firestore, async (tx) => {
    const userRef = doc(firestore, 'users', uid)
    const usernameRef = doc(firestore, 'usernames', username)

    const [userSnap, usernameSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(usernameRef),
    ])

    const existingUsername = userSnap.exists() ? userSnap.data().username : null
    if (
      typeof existingUsername === 'string'
      && existingUsername.length > 0
      && existingUsername !== username
    ) {
      throw new ClaimUsernameError(
        'user-already-has-username',
        'Username is already set for this account.',
      )
    }

    if (usernameSnap.exists()) {
      const ownerUid = usernameSnap.data().uid
      if (ownerUid !== uid) {
        throw new ClaimUsernameError('username-taken', 'That username is already taken.')
      }
    } else {
      tx.set(usernameRef, {
        uid,
        createdAt: serverTimestamp(),
      })
    }

    tx.set(
      userRef,
      {
        username,
        usernameSetAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

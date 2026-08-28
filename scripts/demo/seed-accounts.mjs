// Seeds the two demo accounts directly against the emulator's admin surface.
//
// The app puts two one-time gates in front of the first screen: an
// email-verification gate (`src/features/auth/VerifyEmailGate.tsx`) and a
// username claim (`src/features/auth/UsernameSetup.tsx`). Both are cleared
// here, so signing in with the documented demo credentials lands straight in
// the app. `scripts/browser-smoke.mjs` walks the same two gates through the
// UI; this does the equivalent writes without a browser.
//
// Every write is idempotent, and every uid is pinned, so this can run against
// a freshly imported snapshot without disturbing the campaign it carries.

import process from 'node:process'
import {
  apiKey,
  authEmulatorUrl,
  demoAccounts,
  firestoreEmulatorUrl,
  projectId,
} from './config.mjs'

const ownerHeaders = {
  'authorization': 'Bearer owner',
  'content-type': 'application/json',
}

const documentsUrl = `${firestoreEmulatorUrl}/v1/projects/${projectId}/databases/(default)/documents`
const adminAuthUrl = `${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/projects/${projectId}`

async function requestJson(url, init) {
  const response = await fetch(url, init)
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed (${response.status}): ${body}`)
  }

  return body ? JSON.parse(body) : null
}

async function findAuthUser(uid) {
  const payload = await requestJson(`${adminAuthUrl}/accounts:lookup`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ localId: [uid] }),
  })

  return payload?.users?.[0] ?? null
}

async function ensureAuthUser(account) {
  const existing = await findAuthUser(account.uid)

  if (!existing) {
    await requestJson(`${adminAuthUrl}/accounts`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        localId: account.uid,
        email: account.email,
        password: account.password,
        displayName: account.displayName,
        emailVerified: true,
      }),
    })

    return 'created'
  }

  if (existing.emailVerified && existing.email === account.email) {
    return 'unchanged'
  }

  // An imported snapshot could carry an older, unverified version of the
  // account. Repair it rather than leaving the visitor stuck at the gate.
  await requestJson(`${adminAuthUrl}/accounts:update`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({
      localId: account.uid,
      email: account.email,
      password: account.password,
      displayName: account.displayName,
      emailVerified: true,
    }),
  })

  return 'repaired'
}

async function readDocument(documentPath) {
  const response = await fetch(`${documentsUrl}/${documentPath}`, { headers: ownerHeaders })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`GET ${documentPath} failed (${response.status}): ${await response.text()}`)
  }

  return response.json()
}

async function patchDocument(documentPath, fields) {
  const mask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&')

  await requestJson(`${documentsUrl}/${documentPath}?${mask}`, {
    method: 'PATCH',
    headers: ownerHeaders,
    body: JSON.stringify({ fields }),
  })
}

async function ensureUserProfile(account, now) {
  const existing = await readDocument(`users/${account.uid}`)

  if (existing?.fields?.username?.stringValue === account.username) {
    return 'unchanged'
  }

  await patchDocument(`users/${account.uid}`, {
    username: { stringValue: account.username },
    email: { stringValue: account.email },
    displayName: { stringValue: account.displayName },
    usernameSetAt: { timestampValue: now },
    createdAt: { timestampValue: now },
    updatedAt: { timestampValue: now },
  })

  return existing ? 'repaired' : 'created'
}

async function ensureUsernameClaim(account, now) {
  const existing = await readDocument(`usernames/${account.username}`)

  if (existing?.fields?.uid?.stringValue === account.uid) {
    return 'unchanged'
  }

  if (existing) {
    throw new Error(
      `usernames/${account.username} is already claimed by ${existing.fields?.uid?.stringValue ?? 'an unknown uid'}, `
      + `not by the demo account ${account.uid}. The snapshot in ./emulator-data is inconsistent with scripts/demo/config.mjs.`,
    )
  }

  await patchDocument(`usernames/${account.username}`, {
    uid: { stringValue: account.uid },
    createdAt: { timestampValue: now },
  })

  return 'created'
}

/**
 * Brings both demo accounts to the state the app expects: an auth user with a
 * pinned uid and a verified email, a `users/{uid}` profile carrying the
 * username, and the matching `usernames/{username}` claim.
 *
 * Returns one summary line per account for the caller to log.
 */
export async function seedDemoAccounts() {
  const now = new Date().toISOString()
  const summaries = []

  for (const account of demoAccounts) {
    const auth = await ensureAuthUser(account)
    const profile = await ensureUserProfile(account, now)
    const claim = await ensureUsernameClaim(account, now)

    const outcome = [auth, profile, claim].every((step) => step === 'unchanged')
      ? 'already seeded'
      : `auth ${auth}, profile ${profile}, username ${claim}`

    summaries.push(`${account.role} <${account.email}> as @${account.username}: ${outcome}`)
  }

  return summaries
}

/** Signs in as a demo account, proving the credentials work end to end. */
export async function verifyDemoSignIn(account) {
  const payload = await requestJson(
    `${authEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        returnSecureToken: true,
      }),
    },
  )

  if (payload.localId !== account.uid) {
    throw new Error(
      `Signing in as ${account.email} returned uid ${payload.localId}, expected ${account.uid}.`,
    )
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  for (const summary of await seedDemoAccounts()) {
    console.log(`seeded ${summary}`)
  }
  for (const account of demoAccounts) {
    await verifyDemoSignIn(account)
  }
  console.log('Demo accounts are ready.')
}

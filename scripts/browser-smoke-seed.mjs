// Seeds Firestore documents for the browser smoke, straight into the emulator.
//
// Every write goes through the emulator's REST API as `Bearer owner`, which
// bypasses `firestore.rules`, so a case can seed any shape it needs - old
// formats the app no longer writes included. Values are plain JavaScript:
// strings, numbers, booleans, null, Dates, arrays and plain objects. A key
// whose value is `undefined` is left out of the document.
//
// The app reads a group's campaigns once, when its group list loads, so seed
// first and then `page.goto` the page that should show the data:
//
//   const campaignId = await seedCampaign({ groupId, gmUserId: uid, fields: { system: 'vtm' } })
//   await seedCharacter({ groupId, campaignId, fields: { name: 'Old Shape', ownerUserId: uid } })
//   await page.goto(`${APP_URL}/groups/${groupId}/campaigns/${campaignId}/character`)
//
// `seedCampaign` fills in what the app's own campaign creation writes (a private
// draft owned by `gmUserId`) and lets `fields` replace any of it. `seedCharacter`
// writes exactly `fields` and nothing else, because a character's shape is what
// the cases that seed one are testing.

import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { FIRESTORE_EMULATOR_URL } from './browser-smoke-errors.mjs'

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'

const documentsUrl = `${FIRESTORE_EMULATOR_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents`

function unsupported(value) {
  return new Error(`Cannot seed a value of type ${typeof value}: ${String(value)}.`)
}

function numberValue(value) {
  if (!Number.isFinite(value)) throw new Error(`Cannot seed the non-finite number ${value}.`)
  return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
}

function objectValue(value) {
  if (value === null) return { nullValue: null }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return { mapValue: { fields: toFirestoreFields(value) } }
  }
  throw unsupported(value)
}

const encodersByType = {
  string: (value) => ({ stringValue: value }),
  boolean: (value) => ({ booleanValue: value }),
  number: numberValue,
  object: objectValue,
}

export function toFirestoreValue(value) {
  const encode = encodersByType[typeof value]
  if (!encode) throw unsupported(value)
  return encode(value)
}

export function toFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)]),
  )
}

// Creates the document at `path`, or replaces it whole if it already exists.
export async function seedDocument(path, data) {
  const response = await fetch(`${documentsUrl}/${path}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (!response.ok) {
    throw new Error(`Seeding ${path} failed (${response.status}): ${await response.text()}`)
  }
}

function newDocumentId() {
  return randomUUID().replaceAll('-', '').slice(0, 20)
}

export async function seedCampaign({ groupId, gmUserId, campaignId = newDocumentId(), fields = {} }) {
  const now = new Date()
  await seedDocument(`groups/${groupId}/campaigns/${campaignId}`, {
    groupId,
    name: 'Seeded Campaign',
    slug: `seeded-campaign-${campaignId}`,
    system: 'ose',
    status: 'draft',
    createdBy: gmUserId,
    gmUserId,
    createdAt: now,
    updatedAt: now,
    ...fields,
  })
  return campaignId
}

export async function seedCharacter({ groupId, campaignId, characterId = newDocumentId(), fields }) {
  await seedDocument(`groups/${groupId}/campaigns/${campaignId}/characters/${characterId}`, fields)
  return characterId
}

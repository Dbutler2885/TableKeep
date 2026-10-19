// The walk and the per-document transaction, over a small in-memory stand-in
// for the admin SDK. The same code runs against the real emulator in
// `src/features/ruleSets/migrateCharacters.emulator.test.ts`.
import { describe, expect, it } from 'vitest'
import { migrateStoredCharacter, planStoredCharacter, walkCharacters } from './run.mjs'

/** Documents by path, with the listing, reading and transaction calls the walk uses. */
function memoryFirestore(documents) {
  const store = new Map(Object.entries(documents))
  const writes = []
  const childIds = (path) => [...new Set([...store.keys()]
    .filter((key) => key.startsWith(`${path}/`))
    .map((key) => key.slice(path.length + 1).split('/')[0]))].sort()
  const snapshotOf = (ref) => ({
    id: ref.id,
    ref,
    data: () => store.get(ref.path),
    get: (field) => store.get(ref.path)?.[field],
  })
  const doc = (path) => ({ id: path.split('/').at(-1), path, get: async () => snapshotOf(doc(path)), collection: (name) => collection(`${path}/${name}`) })
  // A listing includes a document that has only subcollections, as Firestore's does.
  const collection = (path) => ({
    listDocuments: async () => childIds(path).map((id) => doc(`${path}/${id}`)),
    get: async () => ({ docs: childIds(path).filter((id) => store.has(`${path}/${id}`)).map((id) => snapshotOf(doc(`${path}/${id}`))) }),
  })
  const transaction = {
    get: async (ref) => snapshotOf(ref),
    set: (ref, data) => {
      writes.push(ref.path)
      store.set(ref.path, data)
    },
  }
  return { store, writes, collection, runTransaction: (update) => update(transaction) }
}

const documents = () => ({
  'groups/g1': {},
  'groups/g1/campaigns/ose': { system: 'ose' },
  'groups/g1/campaigns/ose/characters/old': { class: 'Fighter', details: { weapons: [] } },
  'groups/g1/campaigns/ose/characters/current': { class: 'Fighter', schemaVersion: 1 },
  'groups/g1/campaigns/vtm': { system: 'vtm' },
  'groups/g1/campaigns/vtm/characters/stray': { class: 'Fighter' },
  'groups/g2/campaigns/blank/characters/old': { details: {} },
  'campaigns/flat/characters/old': { details: { weapons: [] } },
})

async function walk(db, visit) {
  const seen = { campaigns: [], characters: [] }
  await walkCharacters(db, {
    visit,
    onCampaign: (campaign) => seen.campaigns.push([campaign.ref.path, campaign.ruleSetId, campaign.implicit]),
    onCharacter: (path, plan) => seen.characters.push([path, plan.status]),
  })
  return seen
}

describe('walking the characters', () => {
  it('visits every grouped campaign, even one with no document, and never the flat legacy tree', async () => {
    const db = memoryFirestore(documents())
    const seen = await walk(db, planStoredCharacter)
    expect(seen.campaigns).toEqual([
      ['groups/g1/campaigns/ose', 'ose', null],
      ['groups/g1/campaigns/vtm', 'vtm', null],
      ['groups/g2/campaigns/blank', 'ose', 'missing'],
    ])
    expect(seen.characters).toEqual([
      ['groups/g1/campaigns/ose/characters/current', 'current'],
      ['groups/g1/campaigns/ose/characters/old', 'migrate'],
      ['groups/g1/campaigns/vtm/characters/stray', 'flagged'],
      ['groups/g2/campaigns/blank/characters/old', 'migrate'],
    ])
    expect(db.writes).toEqual([])
  })

  it('writes, in a transaction, only the characters to be migrated', async () => {
    const db = memoryFirestore(documents())
    const seen = await walk(db, (snapshot, ruleSetId) => migrateStoredCharacter(db, snapshot.ref, ruleSetId))
    expect(seen.characters.map(([, status]) => status)).toEqual(['current', 'migrate', 'flagged', 'migrate'])
    expect(db.writes).toEqual(['groups/g1/campaigns/ose/characters/old', 'groups/g2/campaigns/blank/characters/old'])
    expect(db.store.get('groups/g1/campaigns/ose/characters/old')).toEqual({ class: 'Fighter', details: { inventory: [] }, schemaVersion: 1 })
    expect(db.store.get('campaigns/flat/characters/old')).toEqual({ details: { weapons: [] } })
  })

  it('writes nothing for a character deleted after it was listed', async () => {
    const db = memoryFirestore({})
    const ref = { id: 'gone', path: 'groups/g1/campaigns/c1/characters/gone' }
    expect(await migrateStoredCharacter(db, ref, 'ose')).toEqual({ status: 'gone', ruleSetId: 'ose' })
    expect(db.writes).toEqual([])
  })
})

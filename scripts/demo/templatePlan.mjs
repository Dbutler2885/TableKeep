// The pure half of seeding the hosted demo template.
//
// `seed-template.mjs` reads the committed `emulator-data/` snapshot out of a
// running emulator and writes the same campaign into a target project as the
// one pristine template every visitor's sandbox is cloned from. This module
// holds the part of that with no I/O in it: which collections travel, where
// each document and each Storage object lands, and what has to be rewritten on
// the way. `templatePlan.test.mjs` covers it.
//
// Documents stay in the Firestore REST `fields` representation from end to end.
// Converting them to plain JavaScript and back would have to re-derive every
// value's type, and a campaign carries integers, timestamps, nested maps and
// arrays; leaving them typed means nothing can be lost in translation.

/**
 * The template's fixed identity. Written out here as well because a `.mjs`
 * script cannot import the TypeScript constants; `templatePlan.test.mjs` checks
 * these against `functions/src/demoConstants.ts`.
 */
export const TEMPLATE_GROUP_ID = 'demo-template'
export const TEMPLATE_CAMPAIGN_ID = 'demo-campaign'

/**
 * The campaign subcollections the template carries.
 *
 * Same set as `DEMO_CLONED_SUBCOLLECTIONS` in `functions/src/demoClone.ts`, and
 * for the same reason: `userState`, `itemApprovals` and `pendingTransfers` are
 * one person's scratch or an in-flight request between two players, neither of
 * which means anything in a template. The test pins the two lists together.
 */
export const TEMPLATE_SUBCOLLECTIONS = [
  { name: 'characters' },
  { name: 'maps', children: [{ name: 'tokens' }, { name: 'annotations' }, { name: 'fogChunks' }] },
  { name: 'tokenAssets' },
  { name: 'monsters' },
  { name: 'npcs' },
  { name: 'npcPrivate' },
  { name: 'items' },
  { name: 'tables', children: [{ name: 'history' }] },
  { name: 'images' },
  { name: 'referenceDocs' },
  { name: 'sessionSummaries' },
  { name: 'sharedNotes' },
]

/**
 * Cached Firebase download URLs, which do not survive the move.
 *
 * They embed the source object's percent-encoded path and a per-object download
 * token, so a copy in another bucket cannot be reached through them. Blanking
 * them is safe rather than merely tidy: `useMapData` re-resolves any map whose
 * `imagePath` is set but whose `imageUrl` is empty, and `useCharacters` and the
 * NPC editor do the same for portraits, so the app repairs them on first read.
 */
export const DOWNLOAD_URL_FIELDS = new Set([
  'imageUrl',
  'fogImageUrl',
  'visionBlockImageUrl',
  'portraitUrl',
  'customImageUrl',
])

/** The Storage prefix swap the move performs, as a from/to pair. */
export function storagePrefixes({ groupId, campaignId }) {
  return {
    from: `groups/${groupId}/campaigns/${campaignId}/`,
    to: `groups/${TEMPLATE_GROUP_ID}/campaigns/${TEMPLATE_CAMPAIGN_ID}/`,
  }
}

/** Where a source Storage object lands in the template, or null if it is outside the campaign. */
export function rewriteStoragePath(path, prefixes) {
  if (typeof path !== 'string' || !path.startsWith(prefixes.from)) return null
  return prefixes.to + path.slice(prefixes.from.length)
}

/**
 * Rewrites one document's REST `fields` for the template.
 *
 * Two transformations, applied at any depth so nested maps like `tokenIcon`
 * and arrays of tokens are covered: every string that names an object inside the
 * source campaign's Storage prefix is re-pointed at the template's, and every
 * cached download URL is blanked.
 */
export function rewriteFields(fields, prefixes) {
  if (!fields || typeof fields !== 'object') return fields

  const rewritten = {}
  for (const [key, value] of Object.entries(fields)) {
    if (DOWNLOAD_URL_FIELDS.has(key) && value && 'stringValue' in value) {
      rewritten[key] = { stringValue: '' }
      continue
    }
    rewritten[key] = rewriteValue(value, prefixes)
  }
  return rewritten
}

function rewriteValue(value, prefixes) {
  if (!value || typeof value !== 'object') return value

  if (typeof value.stringValue === 'string') {
    const moved = rewriteStoragePath(value.stringValue, prefixes)
    return moved ? { stringValue: moved } : value
  }
  if (value.mapValue) {
    return { mapValue: { fields: rewriteFields(value.mapValue.fields ?? {}, prefixes) } }
  }
  if (value.arrayValue) {
    return {
      arrayValue: { values: (value.arrayValue.values ?? []).map((entry) => rewriteValue(entry, prefixes)) },
    }
  }
  return value
}

/**
 * Every Storage object a set of rewritten documents refers to, as from/to pairs.
 *
 * Derived from what the documents actually name rather than by listing the
 * bucket, so an orphan left behind by a deleted map does not travel with the
 * template - and so the set is exactly what a visitor's clone will try to read.
 */
export function collectStorageObjects(documents, prefixes) {
  const moves = new Map()

  const walk = (value) => {
    if (!value || typeof value !== 'object') return
    if (typeof value.stringValue === 'string') {
      const to = rewriteStoragePath(value.stringValue, prefixes)
      if (to) moves.set(value.stringValue, to)
      return
    }
    if (value.mapValue) Object.values(value.mapValue.fields ?? {}).forEach(walk)
    if (value.arrayValue) (value.arrayValue.values ?? []).forEach(walk)
  }

  for (const document of documents) {
    Object.values(document.fields ?? {}).forEach(walk)
  }

  return [...moves].map(([from, to]) => ({ from, to })).sort((a, b) => a.from.localeCompare(b.from))
}

/**
 * The template's group document.
 *
 * Deliberately thin. It keeps the campaign's name so a visitor's sandbox reads
 * like a real table, and it carries no `createdBy` and gets no `members`
 * subcollection - which is what makes every write rule under this group false
 * for every account, including the one that seeded it.
 */
export function templateGroupDoc(sourceGroupFields) {
  return {
    name: sourceGroupFields?.name ?? { stringValue: 'Demo table' },
    slug: { stringValue: TEMPLATE_GROUP_ID },
    activeCampaignId: { stringValue: TEMPLATE_CAMPAIGN_ID },
    currentCampaignId: { stringValue: TEMPLATE_CAMPAIGN_ID },
    isDemoTemplate: { booleanValue: true },
  }
}

/**
 * The template's campaign document.
 *
 * `gmUserId` and `createdBy` are emptied rather than carried over: no account
 * should be able to claim GM rights on the template, and every clone overwrites
 * both with the visitor's uid anyway.
 */
export function templateCampaignDoc(sourceCampaignFields, prefixes) {
  return {
    ...rewriteFields(sourceCampaignFields ?? {}, prefixes),
    groupId: { stringValue: TEMPLATE_GROUP_ID },
    status: { stringValue: 'active' },
    gmUserId: { stringValue: '' },
    createdBy: { stringValue: '' },
    isDemoTemplate: { booleanValue: true },
  }
}

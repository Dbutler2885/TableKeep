// The character migration's database side, through the admin SDK. It walks
// `groups/*/campaigns/*/characters` only: the flat legacy `campaigns/` tree is
// kept as a read-gate for old Storage paths and is never touched.

import { campaignRuleSet, planCharacter } from './plan.mjs'

async function readCampaign(ref) {
  const snapshot = await ref.get()
  return { ref, ...campaignRuleSet(snapshot.get('system')) }
}

/** Every campaign under every group, with the rule set its stored `system` resolves to. */
export async function listCampaigns(db) {
  const groups = await db.collection('groups').listDocuments()
  const campaigns = await Promise.all(groups.map((group) => group.collection('campaigns').listDocuments()))
  return Promise.all(campaigns.flat().map(readCampaign))
}

/** The dry run's view of one character: its plan, read outside any transaction. */
export const planStoredCharacter = async (snapshot, ruleSetId) => planCharacter(snapshot.id, snapshot.data(), ruleSetId)

/**
 * Migrates one character in its own transaction: reads it again, runs the
 * steps, and writes the whole result only when it is to be migrated. A current
 * or flagged document is not written, so its `updatedAt` and everything else
 * stay as stored.
 */
export function migrateStoredCharacter(db, ref, ruleSetId) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const plan = planCharacter(ref.id, snapshot.data(), ruleSetId)
    if (plan.status === 'migrate') transaction.set(ref, plan.document)
    return plan
  })
}

async function walkCampaign(campaign, { visit, onCharacter }) {
  const characters = await campaign.ref.collection('characters').get()
  for (const snapshot of characters.docs) onCharacter(snapshot.ref.path, await visit(snapshot, campaign.ruleSetId))
}

/**
 * Visits every character of every campaign in turn, one at a time. `visit`
 * returns the character's plan; `onCampaign` and `onCharacter` hear about each.
 */
export async function walkCharacters(db, handlers) {
  for (const campaign of await listCampaigns(db)) {
    handlers.onCampaign(campaign)
    await walkCampaign(campaign, handlers)
  }
}

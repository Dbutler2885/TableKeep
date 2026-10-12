/**
 * Sets the emulators up for trying the bot in a real Discord server, without
 * going through the app: links a server to a group with a current campaign,
 * and connects a Discord account to a member of it.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/dev-link.ts <discord server id> <discord user id>
 *
 * It only ever writes to the emulators.
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const [serverId, discordUserId] = process.argv.slice(2)
if (!serverId || !discordUserId) throw new Error('Usage: dev-link.ts <discord server id> <discord user id>')
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set: this only writes to the emulators.')

const db = getFirestore(initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev' }))
const groupId = 'dev-group'
const campaignId = 'dev-campaign'
const uid = 'dev-user'

await db.doc(`groups/${groupId}`).set({ name: 'Dev Group', activeCampaignId: campaignId }, { merge: true })
await db.doc(`groups/${groupId}/campaigns/${campaignId}`).set({ name: 'Dev Campaign' }, { merge: true })
await db.doc(`groups/${groupId}/members/${uid}`).set({ status: 'active', role: 'admin' }, { merge: true })
await db.doc(`discordServers/${serverId}`).set({ groupId }, { merge: true })
await db.doc(`discordAccounts/${discordUserId}`).set({ uid }, { merge: true })
console.log(`Server ${serverId} is linked to ${groupId}, and Discord user ${discordUserId} is a member of it.`)

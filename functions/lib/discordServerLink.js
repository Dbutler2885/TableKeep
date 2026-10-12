/**
 * Linking a Discord server to a group.
 *
 * The session recorder bot files a recording under whichever group its Discord
 * server is linked to. A group's admin makes the link by adding the bot to a
 * server, which Discord only lets someone do who manages that server.
 *
 *   discordServers/{guildId}                the link, by server; one group per server
 *   groups/{groupId}/integrations/discord   the same link, by group, readable by
 *                                           the group's members; one server per group
 *
 * Both are written only here. Like `discordConnect.ts`, everything takes its
 * Firestore handle, its clock and its way of asking Discord as arguments.
 */
import { randomBytes } from 'node:crypto';
import { DISCORD_CONNECT_STATES_COLLECTION, DISCORD_CONNECT_STATE_TTL_MS, isWellFormedDiscordState, } from './discordConnect.js';
import { groupMemberPath } from './firestorePaths.js';
export const DISCORD_SERVERS_COLLECTION = 'discordServers';
export const GROUP_DISCORD_INTEGRATION_ID = 'discord';
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke';
/**
 * What the bot is allowed to do in a server it is added to: see channels, send
 * messages (its status message), and connect and speak in voice (to record,
 * and to say "now recording").
 */
export const DISCORD_BOT_PERMISSIONS = String(1024 + 2048 + 1_048_576 + 2_097_152);
function groupIntegrationPath(groupId) {
    return ['groups', groupId, 'integrations', GROUP_DISCORD_INTEGRATION_ID].join('/');
}
/** Whether `uid` is an active admin of the group, which mirrors `isGroupAdmin` in firestore.rules. */
export async function isActiveGroupAdmin(db, groupId, uid) {
    const snap = await db.doc(groupMemberPath(groupId, uid)).get();
    return snap.exists && snap.data()?.status === 'active' && snap.data()?.role === 'admin';
}
/** Starts a link for `groupId` on behalf of `uid`, who must be one of its admins. */
export async function beginDiscordServerLink(db, input, nowMs) {
    if (!(await isActiveGroupAdmin(db, input.groupId, input.uid)))
        return null;
    const state = randomBytes(32).toString('base64url');
    await db.collection(DISCORD_CONNECT_STATES_COLLECTION).doc(state).set({
        kind: 'server',
        uid: input.uid,
        groupId: input.groupId,
        createdAt: new Date(nowMs),
        expiresAt: new Date(nowMs + DISCORD_CONNECT_STATE_TTL_MS),
    });
    return state;
}
/** The Discord page that asks someone to choose a server and add the bot to it. */
export function discordServerLinkUrl(config, state) {
    const query = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        scope: 'bot applications.commands',
        permissions: DISCORD_BOT_PERMISSIONS,
        redirect_uri: config.redirectUri,
        state,
    });
    return `${DISCORD_AUTHORIZE_URL}?${query}`;
}
/**
 * Asks Discord which server the bot was just added to.
 *
 * The server's id also arrives in the return address, where anyone could have
 * typed it. Only the answer to the authorization code is Discord's own word.
 */
export async function fetchLinkedDiscordServer(config, code, fetchImpl = fetch) {
    const credentials = { client_id: config.clientId, client_secret: config.clientSecret };
    const form = { 'content-type': 'application/x-www-form-urlencoded' };
    const response = await fetchImpl(DISCORD_TOKEN_URL, {
        method: 'POST',
        headers: form,
        body: new URLSearchParams({ ...credentials, grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
    });
    if (!response.ok)
        throw new Error(`Discord refused the authorization code (${response.status}).`);
    const body = (await response.json());
    // The token itself is never used: the bot acts as itself, not as the person who added it.
    if (body.access_token) {
        await fetchImpl(DISCORD_REVOKE_URL, {
            method: 'POST',
            headers: form,
            body: new URLSearchParams({ ...credentials, token: body.access_token }),
        }).catch(() => undefined);
    }
    if (!body.guild?.id)
        throw new Error('Discord did not say which server the bot was added to.');
    return { id: body.guild.id, name: body.guild.name ?? '' };
}
/** Finishes a link once Discord has sent the person back. */
export async function completeDiscordServerLink(db, input) {
    if (!isWellFormedDiscordState(input.state))
        return { outcome: 'invalid_state' };
    const stateRef = db.collection(DISCORD_CONNECT_STATES_COLLECTION).doc(input.state);
    const pending = await db.runTransaction(async (tx) => {
        const snap = await tx.get(stateRef);
        if (!snap.exists)
            return null;
        const data = snap.data();
        if (data.kind !== 'server')
            return null;
        tx.delete(stateRef);
        return { uid: data.uid, groupId: data.groupId, expiresAtMs: data.expiresAt.toMillis() };
    });
    if (!pending)
        return { outcome: 'invalid_state' };
    const { uid, groupId } = pending;
    if (pending.expiresAtMs <= input.nowMs)
        return { outcome: 'expired', groupId };
    let server;
    try {
        server = await input.resolveServer(input.code);
    }
    catch {
        return { outcome: 'discord_error', groupId };
    }
    const serverRef = db.collection(DISCORD_SERVERS_COLLECTION).doc(server.id);
    const integrationRef = db.doc(groupIntegrationPath(groupId));
    const memberRef = db.doc(groupMemberPath(groupId, uid));
    const outcome = await db.runTransaction(async (tx) => {
        const [memberSnap, serverSnap, integrationSnap] = await Promise.all([
            tx.get(memberRef),
            tx.get(serverRef),
            tx.get(integrationRef),
        ]);
        // Checked again here, not only when the link was started: admin rights can be removed in between.
        if (!memberSnap.exists || memberSnap.data()?.status !== 'active' || memberSnap.data()?.role !== 'admin') {
            return 'not_group_admin';
        }
        const holderGroupId = serverSnap.data()?.groupId;
        if (holderGroupId && holderGroupId !== groupId) {
            // A group that has since been deleted no longer holds its server.
            const holderSnap = await tx.get(db.collection('groups').doc(holderGroupId));
            if (holderSnap.exists)
                return 'server_taken';
        }
        // Linking a different server replaces the group's old one, and frees it for another group.
        const previousServerId = integrationSnap.data()?.guildId;
        if (previousServerId && previousServerId !== server.id) {
            tx.delete(db.collection(DISCORD_SERVERS_COLLECTION).doc(previousServerId));
        }
        const linkedAt = new Date(input.nowMs);
        tx.set(serverRef, { groupId, guildName: server.name, linkedBy: uid, linkedAt });
        tx.set(integrationRef, { guildId: server.id, guildName: server.name, linkedBy: uid, linkedAt });
        return 'server_linked';
    });
    return { outcome, groupId };
}
/** Removes a group's server link, if it has one. The caller must already be known to be its admin. */
export async function unlinkDiscordServer(db, groupId) {
    const integrationRef = db.doc(groupIntegrationPath(groupId));
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(integrationRef);
        if (!snap.exists)
            return;
        const guildId = snap.data()?.guildId;
        if (guildId)
            tx.delete(db.collection(DISCORD_SERVERS_COLLECTION).doc(guildId));
        tx.delete(integrationRef);
    });
}

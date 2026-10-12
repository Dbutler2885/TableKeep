/**
 * Connecting a Discord account to a Table Keep account.
 *
 * The session recorder bot sees people by their Discord account and Table Keep
 * knows them by their own. A connection stores a person's permanent Discord ID
 * against their Table Keep uid, so the bot can tell who is speaking and who
 * typed a command, however they rename themselves on Discord.
 *
 * The connection lives in two server-only collections, never on the `users`
 * document: a user may write their own `users` document, and a Discord ID
 * anyone could type in would let them speak as someone else.
 *
 *   discordLinks/{uid}           the account's connection, readable by its owner
 *   discordAccounts/{discordId}  the reverse index, which keeps one Discord
 *                                account from being connected twice
 *   discordConnectStates/{state} a connection in progress, good for one use;
 *                                shared with server links, told apart by `kind`
 *
 * Everything here takes its Firestore handle, its clock and its way of asking
 * Discord who someone is as arguments, so the emulator suite can drive the real
 * logic without importing `index.ts` and without reaching Discord.
 */
import { randomBytes } from 'node:crypto';
export const DISCORD_LINKS_COLLECTION = 'discordLinks';
export const DISCORD_ACCOUNTS_COLLECTION = 'discordAccounts';
export const DISCORD_CONNECT_STATES_COLLECTION = 'discordConnectStates';
/** How long someone has to approve the connection on Discord once they start. */
export const DISCORD_CONNECT_STATE_TTL_MS = 10 * 60 * 1000;
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';
/**
 * Starts a connection for `uid` and returns the one-time value that ties
 * Discord's answer back to them.
 */
export async function beginDiscordConnect(db, uid, nowMs) {
    const state = randomBytes(32).toString('base64url');
    await db.collection(DISCORD_CONNECT_STATES_COLLECTION).doc(state).set({
        kind: 'account',
        uid,
        createdAt: new Date(nowMs),
        expiresAt: new Date(nowMs + DISCORD_CONNECT_STATE_TTL_MS),
    });
    return state;
}
/** The Discord page that asks someone to approve the connection. */
export function discordAuthorizeUrl(config, state) {
    const query = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        // `identify` reveals who the account is and nothing else: no email, no servers.
        scope: 'identify',
        redirect_uri: config.redirectUri,
        state,
        prompt: 'consent',
    });
    return `${DISCORD_AUTHORIZE_URL}?${query}`;
}
/**
 * Asks Discord who approved the connection.
 *
 * The access token is used for that one question and then revoked: nothing
 * else is ever done on the person's behalf, so there is nothing to keep.
 */
export async function fetchDiscordIdentity(config, code, fetchImpl = fetch) {
    const credentials = { client_id: config.clientId, client_secret: config.clientSecret };
    const form = { 'content-type': 'application/x-www-form-urlencoded' };
    const tokenResponse = await fetchImpl(DISCORD_TOKEN_URL, {
        method: 'POST',
        headers: form,
        body: new URLSearchParams({
            ...credentials,
            grant_type: 'authorization_code',
            code,
            redirect_uri: config.redirectUri,
        }),
    });
    if (!tokenResponse.ok)
        throw new Error(`Discord refused the authorization code (${tokenResponse.status}).`);
    const { access_token: accessToken } = (await tokenResponse.json());
    if (!accessToken)
        throw new Error('Discord returned no access token.');
    try {
        const meResponse = await fetchImpl(DISCORD_ME_URL, { headers: { authorization: `Bearer ${accessToken}` } });
        if (!meResponse.ok)
            throw new Error(`Discord would not identify the account (${meResponse.status}).`);
        const me = (await meResponse.json());
        if (!me.id || !me.username)
            throw new Error('Discord returned an incomplete account.');
        return { id: me.id, username: me.username, displayName: me.global_name || me.username };
    }
    finally {
        // Best effort: a token that outlives this call can still only read the account's name.
        await fetchImpl(DISCORD_REVOKE_URL, {
            method: 'POST',
            headers: form,
            body: new URLSearchParams({ ...credentials, token: accessToken }),
        }).catch(() => undefined);
    }
}
/** Whether `state` could be a document id this app issued. Anything else was never issued here. */
export function isWellFormedDiscordState(state) {
    return /^[A-Za-z0-9_-]{20,128}$/.test(state);
}
/**
 * Finishes a connection once Discord has sent the person back.
 *
 * The state is spent before Discord is asked anything, so a link that is
 * replayed, or raced from two tabs, connects at most once.
 */
export async function completeDiscordConnect(db, input) {
    if (!isWellFormedDiscordState(input.state))
        return { outcome: 'invalid_state' };
    const stateRef = db.collection(DISCORD_CONNECT_STATES_COLLECTION).doc(input.state);
    const pending = await db.runTransaction(async (tx) => {
        const snap = await tx.get(stateRef);
        if (!snap.exists)
            return null;
        const data = snap.data();
        // A state issued for linking a server is not one for connecting an account.
        if (data.kind !== 'account')
            return null;
        tx.delete(stateRef);
        return { uid: data.uid, expiresAtMs: data.expiresAt.toMillis() };
    });
    if (!pending)
        return { outcome: 'invalid_state' };
    if (pending.expiresAtMs <= input.nowMs)
        return { outcome: 'expired', uid: pending.uid };
    let identity;
    try {
        identity = await input.identify(input.code);
    }
    catch {
        return { outcome: 'discord_error', uid: pending.uid };
    }
    const { uid } = pending;
    const linkRef = db.collection(DISCORD_LINKS_COLLECTION).doc(uid);
    const accountRef = db.collection(DISCORD_ACCOUNTS_COLLECTION).doc(identity.id);
    const outcome = await db.runTransaction(async (tx) => {
        const [linkSnap, accountSnap] = await Promise.all([tx.get(linkRef), tx.get(accountRef)]);
        if (accountSnap.exists && accountSnap.data()?.uid !== uid)
            return 'already_linked';
        // Connecting a different Discord account replaces the old one, and frees it for someone else.
        const previousDiscordId = linkSnap.data()?.discordId;
        if (previousDiscordId && previousDiscordId !== identity.id) {
            tx.delete(db.collection(DISCORD_ACCOUNTS_COLLECTION).doc(previousDiscordId));
        }
        const linkedAt = new Date(input.nowMs);
        tx.set(accountRef, { uid, linkedAt });
        tx.set(linkRef, {
            discordId: identity.id,
            // Shown in settings so the person can see which account they connected.
            // The bot never matches on these; a rename on Discord leaves the connection intact.
            username: identity.username,
            displayName: identity.displayName,
            linkedAt,
        });
        return 'connected';
    });
    return { outcome, uid };
}
/** Removes `uid`'s connection, if they have one. */
export async function disconnectDiscord(db, uid) {
    const linkRef = db.collection(DISCORD_LINKS_COLLECTION).doc(uid);
    await db.runTransaction(async (tx) => {
        const linkSnap = await tx.get(linkRef);
        if (!linkSnap.exists)
            return;
        const discordId = linkSnap.data()?.discordId;
        if (discordId)
            tx.delete(db.collection(DISCORD_ACCOUNTS_COLLECTION).doc(discordId));
        tx.delete(linkRef);
    });
}

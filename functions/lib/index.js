import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
initializeApp();
const db = getFirestore();
const sessionSummaryApiKey = defineSecret('SESSION_SUMMARY_API_KEY');
function isAuthorized(req) {
    const incoming = req.get('x-internal-api-key');
    const expected = sessionSummaryApiKey.value();
    return Boolean(incoming) && Boolean(expected) && incoming === expected;
}
export const health = onRequest({ region: 'us-central1' }, (_req, res) => {
    res.status(200).json({ ok: true, service: 'homeboyshouse-functions' });
});
export const postSessionSummary = onRequest({ region: 'us-central1', secrets: [sessionSummaryApiKey] }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }
    if (!isAuthorized(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    const { campaignId, title, summaryMarkdown, sessionNumber } = req.body ?? {};
    if (typeof campaignId !== 'string' ||
        typeof title !== 'string' ||
        typeof summaryMarkdown !== 'string' ||
        title.trim().length === 0 ||
        summaryMarkdown.trim().length === 0) {
        res.status(400).json({ error: 'invalid_payload' });
        return;
    }
    const summaryRef = db.collection('campaigns').doc(campaignId).collection('sessionSummaries').doc();
    await summaryRef.set({
        title: title.trim(),
        summaryMarkdown,
        sessionNumber: typeof sessionNumber === 'number' ? sessionNumber : null,
        sourceType: 'api',
        postedBy: 'api',
        createdAt: Timestamp.now(),
    });
    res.status(201).json({ ok: true, id: summaryRef.id });
});

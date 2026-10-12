/**
 * Saving a generated session summary: linking its NPCs to the campaign's own
 * and writing the document the app's Notes tab reads.
 *
 * Two things produce summaries: the HTTP endpoint the old drop-folder pipeline
 * posts to, and the recap writer that works from a recorded session. Both save
 * through here, so a summary looks the same to the app whichever made it.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { campaignPath } from '../firestorePaths.js';
/**
 * Matches each mentioned NPC to the campaign's NPC of the same name, and
 * creates one for any the GM has not entered yet.
 *
 * A name shared by two NPCs matches neither, since there is no telling which
 * was meant. Returns the mentions with `linkedNpcId` filled in.
 */
export async function linkNpcMentions(db, groupId, campaignId, mentions) {
    if (mentions.length === 0)
        return mentions;
    const npcsCollection = db.collection(campaignPath(groupId, campaignId, 'npcs'));
    const npcPrivateCollection = db.collection(campaignPath(groupId, campaignId, 'npcPrivate'));
    const npcsSnap = await npcsCollection.get();
    const npcLookup = new Map();
    const ambiguous = new Set();
    npcsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (typeof data.name !== 'string')
            return;
        const key = data.name.toLowerCase().trim();
        if (ambiguous.has(key))
            return;
        if (npcLookup.has(key)) {
            npcLookup.delete(key);
            ambiguous.add(key);
        }
        else {
            npcLookup.set(key, docSnap.id);
        }
    });
    const batch = db.batch();
    let created = 0;
    const linked = mentions.map((mention) => {
        const key = mention.name.toLowerCase().trim();
        if (!key)
            return mention;
        const matchId = npcLookup.get(key);
        if (matchId)
            return { ...mention, linkedNpcId: matchId };
        // No existing NPC: create a stub the model owns (its facts surface as Auto-Notes).
        // Transcript NPCs have been met, so they're visible to players by default.
        const newRef = npcsCollection.doc();
        batch.set(newRef, {
            id: newRef.id,
            name: mention.name,
            title: mention.title,
            visibleToPlayers: true,
            tags: [],
            portraitPath: '',
            portraitUrl: null,
            portraitFocusX: 50,
            portraitFocusY: 50,
            tokenIcon: { icon: 'pawn', color: '#2f5bbf', size: 34 },
            playerDescription: '',
            playerNotes: '',
            createdBy: 'api',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        batch.set(npcPrivateCollection.doc(newRef.id), {
            id: newRef.id,
            gmNotes: '',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        npcLookup.set(key, newRef.id);
        created += 1;
        return { ...mention, linkedNpcId: newRef.id };
    });
    if (created > 0)
        await batch.commit();
    return linked;
}
/**
 * Links a summary's NPCs and writes it to the campaign's session summaries.
 *
 * `summaryId` makes the write repeatable: saving the same summary under the
 * same id twice leaves one document. `extra` carries anything the producer
 * wants recorded alongside, such as which session and model it came from.
 */
export async function saveGeneratedSummary(db, groupId, campaignId, summary, options = {}) {
    const npcMentions = await linkNpcMentions(db, groupId, campaignId, summary.npcMentions);
    const summaries = db.collection(campaignPath(groupId, campaignId, 'sessionSummaries'));
    const summaryRef = options.summaryId ? summaries.doc(options.summaryId) : summaries.doc();
    const content = {
        title: summary.title,
        summaryMarkdown: summary.summaryMarkdown,
        overallSummary: summary.overallSummary,
        scenes: summary.scenes,
        npcMentions,
        cliffhangers: summary.cliffhangers,
        calendar: summary.calendar,
    };
    await summaryRef.set({
        ...content,
        sessionNumber: summary.sessionNumber,
        sourceType: 'api',
        postedBy: 'api',
        // What was generated, kept apart from what is shown, so that a GM's edits can always be told from it.
        generatedSnapshot: content,
        hasHumanEdits: false,
        editedAt: null,
        editedBy: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ...options.extra,
    });
    return summaryRef.id;
}

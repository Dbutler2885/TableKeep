/**
 * The shape of a session recap, as the model is required to return it.
 *
 * The model answers by calling one function, `session_recap`, whose parameters
 * are this schema. The descriptions are instructions to the model as much as
 * documentation, and are carried over word for word from the Python
 * summarizer this replaces.
 */
export const RECAP_SECTIONS = ['overall_summary', 'scenes', 'npcs', 'cliffhangers', 'calendar'];
const PROPERTIES = {
    overall_summary: {
        type: 'string',
        description: "A few paragraphs covering what session's story events at a high level",
    },
    scenes: {
        type: 'array',
        description: 'Key scenes/locations from the session, in chronological order',
        items: {
            type: 'object',
            properties: {
                name: { type: 'string', description: "Short scene name like 'The Clumsy Fox' or 'Warwick's Smithy'" },
                summary: { type: 'string', description: 'One-line summary of what happened in this scene' },
                details: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Bullet-point details, revealed when the scene is expanded',
                },
            },
            required: ['name', 'summary', 'details'],
        },
    },
    npcs: {
        type: 'array',
        description: 'NPCs only (no player characters). Each NPC has a stable key that persists across sessions.',
        items: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'Stable unique key like npc_warwick, npc_george. Reuse existing keys for returning NPCs.',
                },
                name: { type: 'string', description: 'NPC display name' },
                title: { type: 'string', description: "Short descriptor like 'Blacksmith' or 'Town Reeve'" },
                action: {
                    type: 'string',
                    enum: ['new', 'update'],
                    description: "'new' for first encounter, 'update' to add facts to an existing NPC",
                },
                facts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: "For 'new': all facts learned. For 'update': only NEW facts learned this session.",
                },
            },
            required: ['key', 'name', 'action', 'facts'],
        },
    },
    cliffhangers: {
        type: 'array',
        items: { type: 'string' },
        description: "Dramatic teases in the classic 'previously on' cliffhanger style. Each one states a tension and then poses a choice or consequence. Pattern: dramatic fact + 'Will the party X, or Y?' or 'Can they X before Y?' - the kind of thing a narrator reads at the end of an episode to make you come back next week. No parentheticals, no slashes, no dry bookkeeping. Keep them short - two sentences max each. IMPORTANT: Only reference what was actually said or revealed in the session. Do not speculate about connections between plot threads or editorialize about what might be behind a mystery. Let the tone match the actual vibe - if something was presented as funny or weird, don't make it sound sinister. Preserve the tone the GM set.",
    },
    calendar: {
        type: 'array',
        description: 'Notable in-game events from THIS session in chronological order. Each event marks whether it begins a new in-game day. Day numbering is assigned downstream -- do NOT write day numbers.',
        items: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: "Short one-line event. If the transcript explicitly states a time of day (e.g. '10am', 'around midnight', 'at dusk'), weave that stated time into this line. Never invent a time.",
                },
                starts_new_day: {
                    type: 'boolean',
                    description: 'True ONLY if this event is the first event of a NEW in-game day -- i.e. immediately before it the party slept through a night and woke, or the fiction skipped ahead a day or more. In-game days often span multiple sessions, so MOST events are false. When unsure, false.',
                },
            },
            required: ['text', 'starts_new_day'],
        },
    },
};
/** What each section asks for when the campaign's recaps are to be plain and factual. */
const FLAT_DESCRIPTIONS = {
    overall_summary: 'A detailed, chronological, matter-of-fact account of in-game events only. Preserve concrete details without literary narration or editorial commentary.',
    scenes: 'In-game locations or situations in chronological order. Exclude pre-game, post-game, rules, technical, and other out-of-character discussion.',
    npcs: 'NPCs encountered, mentioned, or fed on in the game fiction. Do not include player characters or people mentioned only in out-of-character conversation.',
    cliffhangers: 'Brief factual statements of unresolved in-game tasks, questions, threats, promises, or consequences. No dramatic teases, speculation, or rhetorical questions.',
    calendar: 'Notable in-game events from this session in chronological order. Exclude all out-of-character conversation. Day numbering is assigned downstream.',
};
/** The recap schema limited to the sections a campaign wants, in the style it wants. */
export function recapToolSchema(sections, style = 'default') {
    const wanted = RECAP_SECTIONS.filter((section) => sections.includes(section));
    const properties = {};
    for (const section of wanted) {
        properties[section] =
            style === 'flat' ? { ...PROPERTIES[section], description: FLAT_DESCRIPTIONS[section] } : structuredClone(PROPERTIES[section]);
    }
    return {
        type: 'function',
        name: 'session_recap',
        description: 'Structured session recap with scenes, character knowledge, calendar, and cliffhangers',
        parameters: { type: 'object', properties, required: [...wanted] },
    };
}
/** Reads the recap out of a model response, which must contain the required function call. */
export function extractRecap(response) {
    for (const item of response.output ?? []) {
        if (item.type === 'function_call' && item.name === 'session_recap' && typeof item.arguments === 'string') {
            return JSON.parse(item.arguments);
        }
    }
    throw new Error('The model did not return the required session_recap function call');
}

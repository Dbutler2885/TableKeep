import { RECAP_SECTIONS } from './recapSchema.js';
export const RECAP_SETTINGS_COLLECTION = 'recapSettings';
export const RECAP_SETTINGS_ID = 'main';
/** What a campaign with no settings of its own gets. */
export const DEFAULT_RECAP_SETTINGS = {
    glossary: {},
    promptHeader: null,
    style: 'default',
    sections: [...RECAP_SECTIONS],
    model: 'gpt-5.6-luna',
    reasoningEffort: 'high',
};
/** Fills in anything a stored settings document leaves out. */
export function resolveRecapSettings(stored) {
    return {
        glossary: stored?.glossary ?? DEFAULT_RECAP_SETTINGS.glossary,
        promptHeader: stored?.promptHeader || null,
        style: stored?.style === 'flat' ? 'flat' : 'default',
        sections: Array.isArray(stored?.sections) && stored.sections.length > 0 ? stored.sections : DEFAULT_RECAP_SETTINGS.sections,
        model: stored?.model || DEFAULT_RECAP_SETTINGS.model,
        reasoningEffort: stored?.reasoningEffort || DEFAULT_RECAP_SETTINGS.reasoningEffort,
    };
}
/**
 * A group's recap settings as the old pipeline would have resolved them:
 * the group's own model settings over the global ones, and the prompt named in
 * the config over the `prompt.md` in the group's folder.
 */
export function recapSettingsFromLegacyConfig(config, groupName, files) {
    const group = config.groups?.[groupName] ?? {};
    const summary = { ...config.summary, ...group.summary };
    return resolveRecapSettings({
        glossary: files.glossary,
        promptHeader: (group.summary?.prompt_path ? files.configuredPrompt : null) ?? files.groupPrompt,
        style: group.summary_style === 'flat' ? 'flat' : 'default',
        sections: group.sections,
        model: summary.model,
        reasoningEffort: summary.reasoning_effort,
    });
}

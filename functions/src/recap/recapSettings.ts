/**
 * A campaign's settings for its session recaps: the names to know, the voice
 * to write in, and the model to ask.
 *
 * They used to live in files on one person's laptop. They are stored on the
 * campaign, at `recapSettings/main`, where only the backend can write them.
 */
import type { RecapGlossary } from './recapPrompt.js'
import { RECAP_SECTIONS, type RecapStyle } from './recapSchema.js'

export const RECAP_SETTINGS_COLLECTION = 'recapSettings'
export const RECAP_SETTINGS_ID = 'main'

export type RecapSettings = {
  glossary: RecapGlossary
  /** The campaign's own opening instructions, or null to use the default. */
  promptHeader: string | null
  style: RecapStyle
  sections: string[]
  model: string
  reasoningEffort: string
}

/** What a campaign with no settings of its own gets. */
export const DEFAULT_RECAP_SETTINGS: RecapSettings = {
  glossary: {},
  promptHeader: null,
  style: 'default',
  sections: [...RECAP_SECTIONS],
  model: 'gpt-5.6-luna',
  reasoningEffort: 'high',
}

/** Fills in anything a stored settings document leaves out. */
export function resolveRecapSettings(stored: Partial<RecapSettings> | undefined): RecapSettings {
  return {
    glossary: stored?.glossary ?? DEFAULT_RECAP_SETTINGS.glossary,
    promptHeader: stored?.promptHeader || null,
    style: stored?.style === 'flat' ? 'flat' : 'default',
    sections: Array.isArray(stored?.sections) && stored.sections.length > 0 ? stored.sections : DEFAULT_RECAP_SETTINGS.sections,
    model: stored?.model || DEFAULT_RECAP_SETTINGS.model,
    reasoningEffort: stored?.reasoningEffort || DEFAULT_RECAP_SETTINGS.reasoningEffort,
  }
}

/** The old pipeline's `config.json`, as far as recaps are concerned. */
export type LegacyConfig = {
  summary?: { model?: string; reasoning_effort?: string }
  groups?: Record<
    string,
    {
      group_id?: string
      campaign_id?: string
      summary_style?: string
      sections?: string[]
      summary?: { model?: string; reasoning_effort?: string; prompt_path?: string }
    }
  >
}

/**
 * A group's recap settings as the old pipeline would have resolved them:
 * the group's own model settings over the global ones, and the prompt named in
 * the config over the `prompt.md` in the group's folder.
 */
export function recapSettingsFromLegacyConfig(
  config: LegacyConfig,
  groupName: string,
  files: { glossary: RecapGlossary; configuredPrompt: string | null; groupPrompt: string | null },
): RecapSettings {
  const group = config.groups?.[groupName] ?? {}
  const summary = { ...config.summary, ...group.summary }
  return resolveRecapSettings({
    glossary: files.glossary,
    promptHeader: (group.summary?.prompt_path ? files.configuredPrompt : null) ?? files.groupPrompt,
    style: group.summary_style === 'flat' ? 'flat' : 'default',
    sections: group.sections,
    model: summary.model,
    reasoningEffort: summary.reasoning_effort,
  })
}

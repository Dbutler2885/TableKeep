// Reading the old drop-folder pipeline's files: its config, and each group's
// glossary, prompt, transcripts and recaps.
//
// The folder lives outside this repository and holds the groups' real
// conversations. Nothing read from it is ever written into the repository.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { recapSettingsFromLegacyConfig } from '../../functions/lib/recap/recapSettings.js'

const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null)

/** The old pipeline's config, and for each group what its recaps need. */
export function readLegacyFolder(folder) {
  const config = readJson(path.join(folder, 'config.json'))
  if (!config) throw new Error(`No config.json in ${folder}`)

  const groups = Object.entries(config.groups ?? {}).map(([name, group]) => {
    const promptPath = group.summary?.prompt_path
    const settings = recapSettingsFromLegacyConfig(config, name, {
      glossary: readJson(path.join(folder, name, 'glossary.json')) ?? {},
      configuredPrompt: promptPath ? readText(path.isAbsolute(promptPath) ? promptPath : path.join(folder, promptPath)) : null,
      groupPrompt: readText(path.join(folder, name, 'prompt.md')),
    })
    return {
      name,
      groupId: group.group_id ?? null,
      campaignId: group.campaign_id ?? null,
      // Folder numbers run ahead of session numbers where an earlier game occupies the low folders.
      sessionOffset: group.session_offset ?? 0,
      settings,
    }
  })
  return { config, groups }
}

/** One archived session's transcript and the recap on record for it, if any. */
export function readLegacySession(folder, groupName, folderNumber) {
  const dir = path.join(folder, groupName, String(folderNumber), 'Transcript')
  return {
    transcript: readText(path.join(dir, 'transcript.txt')),
    recap: readJson(path.join(dir, 'recap.json')),
    recapMeta: readJson(path.join(dir, 'recap-meta.json')),
  }
}

/** A recap in the old pipeline's file format, as a session summary document's fields. */
export function legacyRecapAsSummary(recap, sessionNumber) {
  return {
    title: `Session ${sessionNumber}`,
    sessionNumber,
    overallSummary: recap.overall_summary ?? '',
    scenes: recap.scenes ?? [],
    cliffhangers: recap.cliffhangers ?? [],
    npcMentions: (recap.npcs ?? []).map((npc) => ({
      npcKey: npc.key,
      name: npc.name,
      title: npc.title ?? '',
      action: npc.action === 'update' ? 'update' : 'new',
      facts: npc.facts ?? npc.new_facts ?? [],
      linkedNpcId: null,
    })),
    calendar: (recap.calendar ?? []).map((day) => ({
      key: day.key,
      action: day.action === 'update' ? 'update' : 'new',
      label: day.label ?? '',
      dayComplete: day.day_complete === true,
      entries: day.entries ?? [],
    })),
  }
}

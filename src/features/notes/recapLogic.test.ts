/**
 * The session recap's pure logic: the schema the model must answer in, the
 * instructions it is given, and the numbering of in-game days.
 *
 * These carry over the contract tests of the Python summarizer this code
 * replaces, case for case, and add to them.
 */
import { describe, expect, it } from 'vitest'
import { calendarState, eventsToDayObjects } from '../../../functions/src/recap/recapCalendar'
import { buildRecapPrompt } from '../../../functions/src/recap/recapPrompt'
import { extractRecap, recapToolSchema } from '../../../functions/src/recap/recapSchema'

describe('numbering in-game days', () => {
  it('keeps the numbering in the pipeline: events carry on the open day until one starts a new day', () => {
    const calendar = eventsToDayObjects(
      [
        { text: 'The coterie visits the mansion.', starts_new_day: false },
        { text: 'They wake the next evening.', starts_new_day: true },
      ],
      2,
    )

    expect(calendar.map((day) => day.key)).toEqual(['day_002', 'day_003'])
    expect(calendar.map((day) => day.action)).toEqual(['update', 'new'])
    expect(calendar[0]!.day_complete).toBe(true)
    expect(calendar[1]!.day_complete).toBe(false)
  })

  it('opens day one with the first event of a campaign, whether or not the model marked it', () => {
    const calendar = eventsToDayObjects([{ text: 'The party meets in a tavern.', starts_new_day: false }, { text: 'They set out.' }], 0)

    expect(calendar).toEqual([
      { key: 'day_001', action: 'new', entries: ['The party meets in a tavern.', 'They set out.'], day_complete: false },
    ])
  })

  it('closes out the open day when a session begins on a new one without adding to it', () => {
    const calendar = eventsToDayObjects([{ text: 'They wake at dusk.', starts_new_day: true }], 4)

    expect(calendar).toEqual([
      { key: 'day_004', action: 'update', entries: [], day_complete: true },
      { key: 'day_005', action: 'new', entries: ['They wake at dusk.'], day_complete: false },
    ])
  })

  it('makes no calendar from no events', () => {
    expect(eventsToDayObjects([], 3)).toEqual([])
  })

  it('reads where a stored calendar leaves off', () => {
    expect(
      calendarState([
        { key: 'day_003', entries: ['Dawn.'] },
        { key: 'day_004', entries: ['Twilight.', 'The mansion.'] },
      ]),
    ).toEqual({ lastDay: 4, tail: ['Twilight.', 'The mansion.'] })
    expect(calendarState([])).toEqual({ lastDay: 0, tail: [] })
  })
})

describe('the schema the model must answer in', () => {
  it('asks for plain, in-game, factual content when the campaign wants a flat recap', () => {
    const { properties } = recapToolSchema(['overall_summary', 'scenes', 'cliffhangers'], 'flat').parameters

    expect(properties.overall_summary!.description).toContain('matter-of-fact')
    expect(properties.scenes!.description).toContain('out-of-character')
    expect(properties.cliffhangers!.description).toContain('No dramatic teases')
  })

  it('includes and requires only the sections the campaign asks for', () => {
    const { properties, required } = recapToolSchema(['scenes', 'overall_summary']).parameters

    expect(Object.keys(properties)).toEqual(['overall_summary', 'scenes'])
    expect(required).toEqual(['overall_summary', 'scenes'])
  })

  it('keeps the dramatic cliffhanger instructions for the default style, and the item shapes in either', () => {
    const narrative = recapToolSchema(['cliffhangers', 'npcs'])
    const flat = recapToolSchema(['cliffhangers', 'npcs'], 'flat')

    expect(narrative.parameters.properties.cliffhangers!.description).toContain("'previously on'")
    expect(flat.parameters.properties.npcs!.items).toEqual(narrative.parameters.properties.npcs!.items)
  })

  it('reads the recap out of the function call the model was required to make', () => {
    const expected = { overall_summary: 'The coterie received an assignment.' }

    expect(
      extractRecap({ output: [{ type: 'reasoning' }, { type: 'function_call', name: 'session_recap', arguments: JSON.stringify(expected) }] }),
    ).toEqual(expected)
  })

  it('refuses a response with no recap in it', () => {
    expect(() => extractRecap({ output: [{ type: 'message' }] })).toThrow(/session_recap/)
  })
})

describe('the instructions given to the model', () => {
  const glossary = {
    gm: 'David',
    players: {
      conor3240: { player: 'Conor', character: 'Victorf', race: 'human', background: 'magic-user' },
      acorn69: { player: 'Brendan', character: 'Purist', race: 'human' },
      someone: { character: 'Nail' },
    },
    corrections: { 'brandons ford': 'Brandonsford' },
  }

  it('names the GM, each character with their player, and the corrections to apply', () => {
    const prompt = buildRecapPrompt({ glossary })

    expect(prompt).toContain('\nGM: David\n')
    expect(prompt).toContain('- **Victorf**, played by Conor, (human, magic-user)\n')
    expect(prompt).toContain('- **Purist**, played by Brendan, (human)\n')
    expect(prompt).toContain('- **Nail**\n')
    expect(prompt).toContain('- "brandons ford" should be "Brandonsford"\n')
  })

  it('gives the campaign\'s NPC names as the spellings to use', () => {
    const prompt = buildRecapPrompt({ glossary, npcRoster: [{ name: 'Eric', title: 'Town Reeve' }, { name: 'Farmer Gill' }] })

    expect(prompt).toContain('## Canonical NPCs already on record')
    expect(prompt).toContain('- Eric - Town Reeve\n- Farmer Gill\n')
  })

  it('opens day one for a campaign with no calendar yet', () => {
    const prompt = buildRecapPrompt({ glossary })

    expect(prompt).toContain('This is the first session on the calendar')
    expect(prompt).toContain('## Rules for the calendar')
  })

  it('tells the model what happened last session, which NPC keys to reuse, and what day it is', () => {
    const prompt = buildRecapPrompt({
      glossary,
      previous: {
        overall_summary: 'The party reached Brandonsford.',
        cliffhangers: ['Will they face the wyrm?'],
        npcs: [{ key: 'npc_eric', name: 'Eric', title: 'Town Reeve', facts: ['a', 'b', 'c', 'd', 'e', 'f'] }],
        calendar: [{ key: 'day_002', entries: ['one', 'two', 'three', 'four'] }],
      },
    })

    expect(prompt).toContain('## Previously on (last session recap)\n\nThe party reached Brandonsford.\n')
    expect(prompt).toContain('- Will they face the wyrm?\n')
    // Only the first five facts, as a reminder and not the whole history.
    expect(prompt).toContain('- key="npc_eric", **Eric** (Town Reeve): a; b; c; d; e\n')
    expect(prompt).toContain('the party is currently in in-game Day 2.')
    expect(prompt).toContain('Recent events on that day:\n  - two\n  - three\n  - four\n')
    expect(prompt).not.toContain('This is the first session on the calendar')
  })

  it('leaves the calendar out entirely for a campaign that does not keep one', () => {
    const prompt = buildRecapPrompt({ glossary, includeCalendar: false, previous: { calendar: [{ key: 'day_002', entries: ['x'] }] } })

    expect(prompt).not.toContain('in-game time')
    expect(prompt).not.toContain('Rules for the calendar')
  })

  it('uses the default rules, and tells the model to ignore the trolling, when the campaign has no prompt of its own', () => {
    const prompt = buildRecapPrompt({ glossary })

    expect(prompt.startsWith('You are summarizing a recorded tabletop roleplaying game')).toBe(true)
    expect(prompt).toContain('## Important rules for NPCs')
    expect(prompt.endsWith('this will be read before the next session. Ignore the trolling completely.')).toBe(true)
  })

  it('lets a campaign\'s own prompt replace the default header and its NPC rules', () => {
    const prompt = buildRecapPrompt({ glossary, header: 'Write in a restrained 1992 goth voice.\n' })

    expect(prompt.startsWith('Write in a restrained 1992 goth voice.\n\n## Players and characters\n')).toBe(true)
    expect(prompt).not.toContain('## Important rules for NPCs')
    expect(prompt).not.toContain('Ignore the trolling')
    expect(prompt.endsWith('this will be read before the next session.')).toBe(true)
  })
})

describe('carrying a group\'s settings over from the old pipeline', () => {
  const config = {
    summary: { model: 'gpt-5.6-luna', reasoning_effort: 'high' },
    groups: {
      'OG Group': {
        summary_style: 'default',
        summary: { model: 'gpt-5.6-sol', reasoning_effort: 'high', prompt_path: 'prompts/og-group-goth-1992-reconstructed.md' },
        sections: ['overall_summary', 'scenes', 'npcs', 'cliffhangers', 'calendar'],
      },
      'Home Boys': {},
    },
  }
  const glossary = { gm: 'Peter' }

  it('gives the OG Group its narrative prompt and the Sol model at high effort', async () => {
    const { recapSettingsFromLegacyConfig } = await import('../../../functions/src/recap/recapSettings')

    const settings = recapSettingsFromLegacyConfig(config, 'OG Group', {
      glossary,
      configuredPrompt: 'the 1992 goth prompt',
      groupPrompt: 'an older prompt.md',
    })

    expect(settings).toEqual({
      glossary,
      promptHeader: 'the 1992 goth prompt',
      style: 'default',
      sections: ['overall_summary', 'scenes', 'npcs', 'cliffhangers', 'calendar'],
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
    })
  })

  it('falls back to the global model, every section, and the default prompt for a group that sets nothing', async () => {
    const { recapSettingsFromLegacyConfig } = await import('../../../functions/src/recap/recapSettings')

    const settings = recapSettingsFromLegacyConfig(config, 'Home Boys', { glossary: {}, configuredPrompt: null, groupPrompt: null })

    expect(settings).toMatchObject({ promptHeader: null, style: 'default', model: 'gpt-5.6-luna', reasoningEffort: 'high' })
    expect(settings.sections).toEqual(['overall_summary', 'scenes', 'npcs', 'cliffhangers', 'calendar'])
  })

  it('uses the prompt.md in the group\'s folder when the config names no prompt', async () => {
    const { recapSettingsFromLegacyConfig } = await import('../../../functions/src/recap/recapSettings')

    const settings = recapSettingsFromLegacyConfig(config, 'Home Boys', { glossary: {}, configuredPrompt: null, groupPrompt: 'a folder prompt' })

    expect(settings.promptHeader).toBe('a folder prompt')
  })
})

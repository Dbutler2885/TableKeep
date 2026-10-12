/**
 * Writing a session's recap, run for real against a live Firestore emulator:
 * the actual gathering, numbering, NPC linking and saving, with a stand-in for
 * the model and for the stored transcript.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminFirestore } from '../../../functions/src/adminApp'
import {
  writeSessionRecap,
  type RecapModelRequest,
  type RecapModelResponse,
} from '../../../functions/src/recap/writeRecap'

const groupId = 'write-recap-group'
const campaignId = 'write-recap-campaign'
const session = { groupId, campaignId, sessionId: 'session-3' }

type AdminFirestore = ReturnType<typeof adminFirestore>
let db: AdminFirestore

const campaign = () => db.collection('groups').doc(groupId).collection('campaigns').doc(campaignId)
const summaries = async () => (await campaign().collection('sessionSummaries').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const npcNames = async () => (await campaign().collection('npcs').get()).docs.map((doc) => doc.data().name as string).sort()

const TRANSCRIPT = '[00:01] Jem: I ask the reeve about the wyrm.\n[00:09] David: Eric frowns and points north.'

const modelRecap = {
  overall_summary: 'The party questioned the reeve and resolved to hunt the wyrm.',
  scenes: [{ name: "The Reeve's Hall", summary: 'Eric tells them where the wyrm lairs.', details: ['It lairs to the north.'] }],
  npcs: [
    { key: 'npc_eric', name: 'Eric', title: 'Town Reeve', action: 'update', facts: ['Knows where the wyrm lairs.'] },
    { key: 'npc_malcolm', name: 'Malcolm', title: 'Hermit', action: 'new', facts: ['Lives by the northern road.'] },
  ],
  cliffhangers: ['The wyrm waits to the north. Will the party reach it before nightfall?'],
  calendar: [
    { text: 'The party questions the reeve.', starts_new_day: false },
    { text: 'At dawn they set out north.', starts_new_day: true },
  ],
}

/** A model that answers with a fixed recap and remembers what it was asked. */
function fakeModel(recap: unknown = modelRecap) {
  const requests: RecapModelRequest[] = []
  return {
    requests,
    callModel: async (request: RecapModelRequest): Promise<RecapModelResponse> => {
      requests.push(request)
      return {
        id: 'resp_123',
        output: [{ type: 'function_call', name: 'session_recap', arguments: JSON.stringify(recap) }],
        usage: { input_tokens: 1200, output_tokens: 300 },
      }
    },
  }
}

const dependencies = (model = fakeModel(), transcript = TRANSCRIPT) => ({
  callModel: model.callModel,
  readTranscript: async () => transcript,
  nowMs: () => 1_800_000_000_000,
})

beforeAll(() => {
  db = adminFirestore()
})

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(groupId))
  await campaign().set({ name: 'The Black Wyrm of Brandonsford' })
  await campaign().collection('sessions').doc('session-3').set({ number: 3, state: 'ended', transcriptRevision: 'live' })
  await campaign().collection('npcs').doc('eric-id').set({ name: 'Eric', title: 'Town Reeve' })
  await campaign().collection('npcs').doc('nameless').set({ name: '   ' })
  await campaign().collection('recapSettings').doc('main').set({
    glossary: { gm: 'David', players: { mapman: { player: 'Jem', character: 'William' } }, corrections: { 'brandons ford': 'Brandonsford' } },
    model: 'gpt-5.6-sol',
    reasoningEffort: 'high',
  })
  await campaign().collection('sessionSummaries').doc('previous').set({
    sessionNumber: 2,
    overallSummary: 'The party reached Brandonsford.',
    cliffhangers: ['What stalks the northern road?'],
    npcMentions: [{ npcKey: 'npc_eric', name: 'Eric', title: 'Town Reeve', facts: ['Runs the town.'] }],
    calendar: [{ key: 'day_002', entries: ['The party arrives in Brandonsford.'], dayComplete: false }],
    createdAt: new Date(1_700_000_000_000),
  })
})

describe('writing a session recap', () => {
  it('saves the recap as the session\'s summary, in the form the Notes tab reads', async () => {
    const result = await writeSessionRecap(db, session, dependencies())

    expect(result.sessionNumber).toBe(3)
    const saved = (await summaries()).find((summary) => summary.id === result.summaryId) as Record<string, unknown>
    expect(saved).toMatchObject({
      title: 'Session 3',
      sessionNumber: 3,
      sessionId: 'session-3',
      sourceType: 'api',
      overallSummary: modelRecap.overall_summary,
      scenes: modelRecap.scenes,
      cliffhangers: modelRecap.cliffhangers,
      hasHumanEdits: false,
      editedBy: null,
    })
    expect(saved.generatedSnapshot).toMatchObject({ overallSummary: modelRecap.overall_summary, title: 'Session 3' })
  })

  it('asks the campaign\'s model, at its effort, for exactly the sections it wants', async () => {
    const model = fakeModel()
    await writeSessionRecap(db, session, dependencies(model))

    const [request] = model.requests
    expect(request!.model).toBe('gpt-5.6-sol')
    expect(request!.reasoning).toEqual({ effort: 'high' })
    expect(request!.tool_choice).toEqual({ type: 'function', name: 'session_recap' })
    expect(request!.tools[0].parameters.required).toEqual(['overall_summary', 'scenes', 'npcs', 'cliffhangers', 'calendar'])
    expect(request!.input).toBe(`Here is the session transcript:\n\n${TRANSCRIPT}`)
  })

  it('tells the model the names to know, the campaign\'s NPCs, and what happened last session', async () => {
    const model = fakeModel()
    await writeSessionRecap(db, session, dependencies(model))

    const { instructions } = model.requests[0]!
    expect(instructions).toContain('GM: David')
    expect(instructions).toContain('- **William**, played by Jem')
    expect(instructions).toContain('- "brandons ford" should be "Brandonsford"')
    expect(instructions).toContain('- Eric - Town Reeve\n')
    expect(instructions).toContain('The party reached Brandonsford.')
    expect(instructions).toContain('- key="npc_eric", **Eric** (Town Reeve): Runs the town.')
    expect(instructions).toContain('the party is currently in in-game Day 2.')
  })

  it('numbers the in-game days on from where the last session left off', async () => {
    const { summaryId } = await writeSessionRecap(db, session, dependencies())

    const saved = (await summaries()).find((summary) => summary.id === summaryId) as { calendar: unknown[] }
    expect(saved.calendar).toEqual([
      { key: 'day_002', action: 'update', label: '', dayComplete: true, entries: ['The party questions the reeve.'] },
      { key: 'day_003', action: 'new', label: '', dayComplete: false, entries: ['At dawn they set out north.'] },
    ])
  })

  it('links an NPC the campaign already has, and adds one it has not', async () => {
    const { summaryId } = await writeSessionRecap(db, session, dependencies())

    const saved = (await summaries()).find((summary) => summary.id === summaryId) as {
      npcMentions: { name: string; npcKey: string; linkedNpcId: string }[]
    }
    const [eric, malcolm] = saved.npcMentions
    expect(eric).toMatchObject({ name: 'Eric', npcKey: 'npc_eric', linkedNpcId: 'eric-id' })
    expect(await npcNames()).toEqual(['   ', 'Eric', 'Malcolm'])
    const created = await campaign().collection('npcs').doc(malcolm!.linkedNpcId).get()
    expect(created.data()).toMatchObject({ name: 'Malcolm', title: 'Hermit', visibleToPlayers: true, createdBy: 'api' })
    expect((await campaign().collection('npcPrivate').doc(malcolm!.linkedNpcId).get()).exists).toBe(true)
  })

  it('records what produced the recap, so it can be told apart and produced again', async () => {
    const { summaryId } = await writeSessionRecap(db, session, dependencies())

    const saved = (await summaries()).find((summary) => summary.id === summaryId) as { generation: Record<string, unknown> }
    expect(saved.generation).toMatchObject({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
      style: 'default',
      transcriptRevision: 'live',
      responseId: 'resp_123',
      usage: { input_tokens: 1200, output_tokens: 300 },
    })
    expect(saved.generation.instructionsSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(saved.generation.transcriptSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('writing the same recap again under the same name leaves one summary and no second NPC', async () => {
    await writeSessionRecap(db, session, dependencies(), { summaryId: 'recap-session-3' })
    await writeSessionRecap(db, session, dependencies(), { summaryId: 'recap-session-3' })

    expect((await summaries()).map((summary) => summary.id).sort()).toEqual(['previous', 'recap-session-3'])
    expect(await npcNames()).toEqual(['   ', 'Eric', 'Malcolm'])
  })

  it('can be asked for a different model or voice without changing the campaign\'s settings', async () => {
    const model = fakeModel()
    await writeSessionRecap(db, session, dependencies(model), {
      overrides: { model: 'gpt-5.6-luna', reasoningEffort: 'medium', promptHeader: 'Write it plainly.\n', style: 'flat' },
    })

    const [request] = model.requests
    expect(request!.model).toBe('gpt-5.6-luna')
    expect(request!.reasoning).toEqual({ effort: 'medium' })
    expect(request!.instructions.startsWith('Write it plainly.\n')).toBe(true)
    expect(request!.tools[0].parameters.properties.overall_summary!.description).toContain('matter-of-fact')
    expect((await campaign().collection('recapSettings').doc('main').get()).data()?.model).toBe('gpt-5.6-sol')
  })

  it('uses the defaults for a campaign with no settings, and opens the calendar for one with no history', async () => {
    await campaign().collection('recapSettings').doc('main').delete()
    await campaign().collection('sessionSummaries').doc('previous').delete()
    const model = fakeModel()

    const { summaryId } = await writeSessionRecap(db, session, dependencies(model))

    expect(model.requests[0]!.model).toBe('gpt-5.6-luna')
    expect(model.requests[0]!.instructions).toContain('This is the first session on the calendar')
    const saved = (await summaries()).find((summary) => summary.id === summaryId) as { calendar: { key: string }[] }
    expect(saved.calendar.map((day) => day.key)).toEqual(['day_001', 'day_002'])
  })

  it('leaves out the sections a campaign does not want', async () => {
    await campaign().collection('recapSettings').doc('main').update({ sections: ['overall_summary', 'scenes'] })
    const model = fakeModel({ overall_summary: 'Short.', scenes: [] })

    const { summaryId } = await writeSessionRecap(db, session, dependencies(model))

    expect(model.requests[0]!.tools[0].parameters.required).toEqual(['overall_summary', 'scenes'])
    expect(model.requests[0]!.instructions).not.toContain('Canonical NPCs')
    expect(model.requests[0]!.instructions).not.toContain('Rules for the calendar')
    const saved = (await summaries()).find((summary) => summary.id === summaryId) as Record<string, unknown>
    expect(saved).toMatchObject({ overallSummary: 'Short.', npcMentions: [], calendar: [], cliffhangers: [] })
  })

  it('refuses to write a recap from an empty transcript, and asks the model nothing', async () => {
    const model = fakeModel()

    await expect(writeSessionRecap(db, session, dependencies(model, '  \n'))).rejects.toThrow(/no transcript/)
    expect(model.requests).toEqual([])
    expect((await summaries()).map((summary) => summary.id)).toEqual(['previous'])
  })

  it('refuses a session that does not exist', async () => {
    await expect(writeSessionRecap(db, { ...session, sessionId: 'nope' }, dependencies())).rejects.toThrow(/does not exist/)
  })

  it('saves nothing when the model does not return a recap', async () => {
    const broken = { callModel: async () => ({ output: [{ type: 'message' }] }), readTranscript: async () => TRANSCRIPT }

    await expect(writeSessionRecap(db, session, broken)).rejects.toThrow(/session_recap/)
    expect((await summaries()).map((summary) => summary.id)).toEqual(['previous'])
  })
})

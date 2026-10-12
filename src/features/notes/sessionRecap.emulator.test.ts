/**
 * A session's recap being written when the session ends, run for real against
 * a live Firestore emulator with a stand-in for the model: that it is written
 * once however often it is asked for, picks up where a dead run left off, and
 * never writes over a recap that is already there.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminFirestore } from '../../../functions/src/adminApp'
import { requestRecapRerun, runSessionRecap, sessionRecapSummaryId } from '../../../functions/src/recap/sessionRecap'
import { linkNpcMentions } from '../../../functions/src/recap/sessionSummaries'
import { draftSessionRecap, type RecapModelRequest, type RecapModelResponse } from '../../../functions/src/recap/writeRecap'

const groupId = 'session-recap-group'
const campaignId = 'session-recap-campaign'
const session = { groupId, campaignId, sessionId: 'session-3' }
const NOW = 1_800_000_000_000

type AdminFirestore = ReturnType<typeof adminFirestore>
let db: AdminFirestore

const campaign = () => db.collection('groups').doc(groupId).collection('campaigns').doc(campaignId)
const sessionRef = () => campaign().collection('sessions').doc(session.sessionId)
const sessionData = async () => (await sessionRef().get()).data()!
const summaries = async () => (await campaign().collection('sessionSummaries').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const npcNames = async () => (await campaign().collection('npcs').get()).docs.map((doc) => doc.data().name as string).sort()

const recapOf = (summary: string) => ({
  overall_summary: summary,
  scenes: [{ name: "The Reeve's Hall", summary: 'Eric tells them where the wyrm lairs.', details: [] }],
  npcs: [
    { key: 'npc_eric', name: 'Eric', title: 'Town Reeve', action: 'update', facts: ['Knows where the wyrm lairs.'] },
    { key: 'npc_malcolm', name: 'Malcolm', title: 'Hermit', action: 'new', facts: ['Lives by the northern road.'] },
  ],
  cliffhangers: ['Will the party reach the wyrm before nightfall?'],
  calendar: [{ text: 'The party questions the reeve.', starts_new_day: true }],
})

/** A model that answers with a fixed recap, counts how often it is asked, and can be made to fail. */
function fakeModel(summary = 'The party questioned the reeve.') {
  const model = {
    requests: [] as RecapModelRequest[],
    down: false,
    callModel: async (request: RecapModelRequest): Promise<RecapModelResponse> => {
      model.requests.push(request)
      if (model.down) throw new Error('The model request failed (503): overloaded')
      // Long enough for a second run started at the same moment to overlap with this one.
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { id: 'resp_123', output: [{ type: 'function_call', name: 'session_recap', arguments: JSON.stringify(recapOf(summary)) }] }
    },
  }
  return model
}

const dependencies = (model = fakeModel(), nowMs = NOW) => ({
  callModel: model.callModel,
  readTranscript: async () => '[00:01] Jem: I ask the reeve about the wyrm.',
  nowMs: () => nowMs,
})

beforeAll(() => {
  db = adminFirestore()
})

beforeEach(async () => {
  await db.recursiveDelete(db.collection('groups').doc(groupId))
  await campaign().set({ name: 'The Black Wyrm of Brandonsford' })
  await sessionRef().set({ number: 3, state: 'ended', transcriptComplete: true, transcriptRevision: 'live', recapStatus: 'pending' })
  await campaign().collection('npcs').doc('eric-id').set({ name: 'Eric', title: 'Town Reeve' })
})

describe('the recap of a session that has ended', () => {
  it('is written without anyone asking, and the session says it is ready and where it is', async () => {
    const outcome = await runSessionRecap(db, session, dependencies())

    expect(outcome).toBe('written')
    const summaryId = sessionRecapSummaryId(session.sessionId)
    expect(await sessionData()).toMatchObject({ recapStatus: 'ready', recapSummaryId: summaryId, recapError: null, recapClaimedAt: null })
    expect(await summaries()).toMatchObject([
      { id: summaryId, sessionId: 'session-3', sessionNumber: 3, overallSummary: 'The party questioned the reeve.', hasHumanEdits: false },
    ])
    expect(await npcNames()).toEqual(['Eric', 'Malcolm'])
  })

  it.each([
    ['is still being finished', { state: 'finalising', transcriptComplete: false, recapStatus: null }],
    ['has an incomplete transcript', { state: 'finalising', transcriptComplete: false, recapStatus: 'delayed' }],
    ['already has its recap', { recapStatus: 'ready' }],
  ])('is not written while the session %s', async (_, fields) => {
    await sessionRef().update(fields)
    const model = fakeModel()

    expect(await runSessionRecap(db, session, dependencies(model))).toBe('not-due')

    expect(model.requests).toHaveLength(0)
    expect(await summaries()).toEqual([])
    expect((await sessionData()).recapStatus).toBe(fields.recapStatus)
  })

  it('is written once when it is asked for twice at the same moment', async () => {
    const model = fakeModel()

    const outcomes = await Promise.all([runSessionRecap(db, session, dependencies(model)), runSessionRecap(db, session, dependencies(model))])
    // And once more after it is done, as a late repeat of the request would.
    const late = await runSessionRecap(db, session, dependencies(model))

    // The loser either finds the session claimed, or is held up until the recap is already there.
    expect(outcomes.filter((outcome) => outcome === 'written')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome === 'in-progress' || outcome === 'not-due')).toHaveLength(1)
    expect(late).toBe('not-due')
    expect(model.requests).toHaveLength(1)
    const saved = await summaries()
    expect(saved).toHaveLength(1)
    expect((saved[0] as { calendar: unknown[] }).calendar).toHaveLength(1)
    expect(await npcNames()).toEqual(['Eric', 'Malcolm'])
    // The emulator takes a few seconds to settle two transactions on one document.
  }, 20_000)

  it('is finished by a later run exactly as a run that died partway would have finished it', async () => {
    // A clean run, to compare with.
    await runSessionRecap(db, session, dependencies(fakeModel('What the model said the first time.')))
    const [clean] = (await summaries()) as Record<string, unknown>[]
    await db.recursiveDelete(campaign().collection('sessionSummaries'))
    await db.recursiveDelete(campaign().collection('npcs'))
    await campaign().collection('npcs').doc('eric-id').set({ name: 'Eric', title: 'Town Reeve' })
    await db.recursiveDelete(sessionRef().collection('recapRuns'))

    // A run that claimed the session, got the model's answer, made the NPC it mentions, and died.
    const draft = await draftSessionRecap(db, session, dependencies(fakeModel('What the model said the first time.')))
    await sessionRef().collection('recapRuns').doc('main').set(draft)
    await linkNpcMentions(db, groupId, campaignId, draft.summary.npcMentions)
    await sessionRef().update({ recapStatus: 'pending', recapClaimedAt: new Date(NOW) })

    // While its claim holds, nothing else touches the session. Once it has lapsed, the next run finishes the job.
    const otherAnswer = fakeModel('What the model would say if asked again.')
    const tooSoon = await runSessionRecap(db, session, dependencies(otherAnswer, NOW + 60_000))
    const later = await runSessionRecap(db, session, dependencies(otherAnswer, NOW + 11 * 60_000))

    expect([tooSoon, later]).toEqual(['in-progress', 'written'])
    expect(otherAnswer.requests).toHaveLength(0)
    const [finished] = (await summaries()) as Record<string, unknown>[]
    const comparable = ({ overallSummary, scenes, cliffhangers, calendar, npcMentions, generation }: Record<string, unknown>) => ({
      overallSummary,
      scenes,
      cliffhangers,
      calendar,
      generation,
      npcs: (npcMentions as { name: string; facts: string[] }[]).map(({ name, facts }) => ({ name, facts })),
    })
    expect(comparable(finished!)).toEqual(comparable(clean!))
    expect(await npcNames()).toEqual(['Eric', 'Malcolm'])
    expect((await sessionData()).recapStatus).toBe('ready')
  })

  it('never writes over a recap a GM has edited', async () => {
    await runSessionRecap(db, session, dependencies())
    const summaryRef = campaign().collection('sessionSummaries').doc(sessionRecapSummaryId(session.sessionId))
    await summaryRef.update({ overallSummary: 'What the GM wrote instead.', hasHumanEdits: true, editedBy: 'gm-uid' })
    // However the session comes to ask again.
    await sessionRef().update({ recapStatus: 'pending' })
    const model = fakeModel('Something else entirely.')

    expect(await runSessionRecap(db, session, dependencies(model))).toBe('already-written')

    expect(model.requests).toHaveLength(0)
    expect((await summaryRef.get()).data()).toMatchObject({ overallSummary: 'What the GM wrote instead.', hasHumanEdits: true })
    expect((await sessionData()).recapStatus).toBe('ready')
  })

  it('is marked failed with the reason when the model cannot write it, and a GM can ask for it again', async () => {
    const model = fakeModel()
    model.down = true

    expect(await runSessionRecap(db, session, dependencies(model))).toBe('failed')
    expect(await sessionData()).toMatchObject({ recapStatus: 'failed', recapError: 'The model request failed (503): overloaded', recapClaimedAt: null })
    expect(await summaries()).toEqual([])
    // Left alone, a failed recap stays failed: it is not retried on its own.
    expect(await runSessionRecap(db, session, dependencies(model))).toBe('not-due')

    model.down = false
    expect(await requestRecapRerun(db, session)).toBe('requested')
    expect(await sessionData()).toMatchObject({ recapStatus: 'pending', recapError: null })
    expect(await runSessionRecap(db, session, dependencies(model))).toBe('written')

    expect((await sessionData()).recapStatus).toBe('ready')
    expect(await summaries()).toHaveLength(1)
  })

  it('cannot be asked for again unless it failed', async () => {
    await runSessionRecap(db, session, dependencies())

    expect(await requestRecapRerun(db, session)).toBe('not-failed')
    expect(await requestRecapRerun(db, { ...session, sessionId: 'no-such-session' })).toBe('not-found')
    expect((await sessionData()).recapStatus).toBe('ready')
  })
})

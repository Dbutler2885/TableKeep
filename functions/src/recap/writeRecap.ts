/**
 * Writing the recap of a recorded session.
 *
 * It gathers what the model needs (the transcript, the campaign's settings,
 * its NPC list, and the recap before this one), asks the model for a
 * structured recap, numbers the in-game days, and saves the result as a
 * session summary linked to the session.
 *
 * The model and the transcript's storage are passed in, so an emulator suite
 * can run the whole thing with neither.
 */
import { createHash } from 'node:crypto'
import type { Firestore } from 'firebase-admin/firestore'
import { campaignPath } from '../firestorePaths.js'
import { calendarState, eventsToDayObjects } from './recapCalendar.js'
import { buildRecapPrompt, type NpcRosterEntry, type PreviousRecap } from './recapPrompt.js'
import { extractRecap, recapToolSchema, type RecapToolSchema } from './recapSchema.js'
import { RECAP_SETTINGS_COLLECTION, RECAP_SETTINGS_ID, resolveRecapSettings, type RecapSettings } from './recapSettings.js'
import { saveGeneratedSummary } from './sessionSummaries.js'

export type SessionRef = { groupId: string; campaignId: string; sessionId: string }

/** What is sent to the model. This is the OpenAI Responses request the Python summarizer made. */
export type RecapModelRequest = {
  model: string
  instructions: string
  input: string
  reasoning: { effort: string }
  text: { verbosity: 'low' }
  tools: [RecapToolSchema]
  tool_choice: { type: 'function'; name: 'session_recap' }
}

export type RecapModelResponse = {
  id?: string
  output?: { type?: string; name?: string; arguments?: string }[]
  usage?: Record<string, unknown>
}

export type RecapDependencies = {
  callModel: (request: RecapModelRequest) => Promise<RecapModelResponse>
  /** The session's transcript as text, one line per stretch of speech. */
  readTranscript: (session: SessionRef) => Promise<string>
  nowMs?: () => number
}

export type RecapOverrides = Partial<Pick<RecapSettings, 'model' | 'reasoningEffort' | 'promptHeader' | 'style'>>

export type WriteRecapResult = { summaryId: string; sessionNumber: number }

/** Where the bot saves a finished session's transcript as text. */
export function transcriptObjectPath(session: SessionRef): string {
  return `${campaignPath(session.groupId, session.campaignId, 'sessions', session.sessionId)}/transcript.txt`
}

/** The recap of the session before this one, in the form the prompt wants it. */
async function previousRecap(db: Firestore, session: SessionRef, sessionNumber: number): Promise<PreviousRecap | null> {
  const snap = await db
    .collection(campaignPath(session.groupId, session.campaignId, 'sessionSummaries'))
    .where('sessionNumber', '==', sessionNumber - 1)
    .get()
  if (snap.empty) return null
  // If the previous session somehow has two summaries, the later one is the one people have been reading.
  const latest = snap.docs
    .map((doc) => doc.data())
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0]!
  return {
    overall_summary: latest.overallSummary ?? '',
    cliffhangers: latest.cliffhangers ?? [],
    npcs: (latest.npcMentions ?? []).map((npc: { npcKey: string; name: string; title?: string; facts?: string[] }) => ({
      key: npc.npcKey,
      name: npc.name,
      title: npc.title,
      facts: npc.facts,
    })),
    calendar: latest.calendar ?? [],
  }
}

async function npcRoster(db: Firestore, session: SessionRef): Promise<NpcRosterEntry[]> {
  const snap = await db.collection(campaignPath(session.groupId, session.campaignId, 'npcs')).get()
  return snap.docs
    .map((doc) => {
      const data = doc.data() as { name?: string; title?: string }
      return { name: typeof data.name === 'string' ? data.name : '', title: typeof data.title === 'string' ? data.title : '' }
    })
    .filter((npc) => npc.name.trim().length > 0)
}

/**
 * Writes the recap for a session and saves it.
 *
 * `summaryId` names the summary document. Writing under the same id again
 * replaces that document and nothing else, which is what makes a retry safe.
 */
export async function writeSessionRecap(
  db: Firestore,
  session: SessionRef,
  dependencies: RecapDependencies,
  options: { summaryId?: string; overrides?: RecapOverrides } = {},
): Promise<WriteRecapResult> {
  const now = dependencies.nowMs ?? Date.now
  const sessionSnap = await db.doc(campaignPath(session.groupId, session.campaignId, 'sessions', session.sessionId)).get()
  if (!sessionSnap.exists) throw new Error('That session does not exist.')
  const sessionNumber = sessionSnap.data()?.number as number
  const transcriptRevision = (sessionSnap.data()?.transcriptRevision as string | undefined) ?? 'live'

  const settingsSnap = await db
    .doc(campaignPath(session.groupId, session.campaignId, RECAP_SETTINGS_COLLECTION, RECAP_SETTINGS_ID))
    .get()
  const settings = { ...resolveRecapSettings(settingsSnap.data() as Partial<RecapSettings> | undefined), ...options.overrides }
  const includeCalendar = settings.sections.includes('calendar')

  const [transcript, previous, roster] = await Promise.all([
    dependencies.readTranscript(session),
    previousRecap(db, session, sessionNumber),
    settings.sections.includes('npcs') ? npcRoster(db, session) : Promise.resolve([]),
  ])
  if (!transcript.trim()) throw new Error('That session has no transcript to write a recap from.')

  const instructions = buildRecapPrompt({
    glossary: settings.glossary,
    previous,
    header: settings.promptHeader,
    npcRoster: roster,
    includeCalendar,
  })
  const request: RecapModelRequest = {
    model: settings.model,
    instructions,
    input: `Here is the session transcript:\n\n${transcript}`,
    reasoning: { effort: settings.reasoningEffort },
    text: { verbosity: 'low' },
    tools: [recapToolSchema(settings.sections, settings.style)],
    tool_choice: { type: 'function', name: 'session_recap' },
  }

  const startedAt = now()
  const response = await dependencies.callModel(request)
  const elapsedSeconds = Math.round(now() - startedAt) / 1000
  const recap = extractRecap(response)

  // The model only marks where days begin; the numbering carries on from the previous session here.
  const previousLastDay = previous?.calendar?.length ? calendarState(previous.calendar).lastDay : 0
  const calendar = includeCalendar && Array.isArray(recap.calendar) ? eventsToDayObjects(recap.calendar, previousLastDay) : []

  const summaryId = await saveGeneratedSummary(
    db,
    session.groupId,
    session.campaignId,
    {
      title: `Session ${sessionNumber}`,
      summaryMarkdown: '',
      sessionNumber,
      overallSummary: recap.overall_summary ?? '',
      scenes: recap.scenes ?? [],
      npcMentions: (recap.npcs ?? []).map((npc) => ({
        npcKey: npc.key,
        name: npc.name,
        title: npc.title ?? '',
        action: npc.action === 'update' ? 'update' : 'new',
        facts: npc.facts ?? [],
        linkedNpcId: null,
      })),
      cliffhangers: recap.cliffhangers ?? [],
      calendar: calendar.map((day) => ({
        key: day.key,
        action: day.action,
        label: '',
        dayComplete: day.day_complete,
        entries: day.entries,
      })),
    },
    {
      summaryId: options.summaryId,
      extra: {
        sessionId: session.sessionId,
        // Enough to say afterwards what produced this recap, and to produce it again.
        generation: {
          model: settings.model,
          reasoningEffort: settings.reasoningEffort,
          style: settings.style,
          sections: settings.sections,
          transcriptRevision,
          instructionsSha256: createHash('sha256').update(instructions).digest('hex'),
          transcriptSha256: createHash('sha256').update(transcript).digest('hex'),
          responseId: response.id ?? null,
          elapsedSeconds,
          usage: response.usage ?? {},
        },
      },
    },
  )
  return { summaryId, sessionNumber }
}

/** Asks OpenAI's Responses API. A high-effort recap of a long session can take several minutes. */
export function callOpenAi(apiKey: string, fetchImpl: typeof fetch = fetch): RecapDependencies['callModel'] {
  return async (request) => {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    })
    if (!response.ok) throw new Error(`The model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`)
    return (await response.json()) as RecapModelResponse
  }
}

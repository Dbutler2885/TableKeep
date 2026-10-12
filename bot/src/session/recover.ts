/**
 * Picking up whatever a bot left behind when it last stopped running.
 *
 * Every journal still on the disk is a session with work outstanding. One
 * whose recording was stopped is finished; one that was still recording is
 * resumed. Run it when the bot starts, and again from time to time for the
 * sessions that could not be finished because a service was unavailable.
 */
import { readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { readJournal } from '../journal/journal.ts'
import { journalSession } from './engine.ts'
import { finaliseSession, type FinaliseResult } from './finalise.ts'
import { SessionRecorder, type RecorderOptions } from './recorder.ts'

export type RecoveredJournal = { journalPath: string } & (
  | { outcome: 'resumed'; recorder: SessionRecorder }
  | { outcome: 'finalised'; result: FinaliseResult }
  /** The journal was no longer needed and has been removed: its session had already ended, or was deleted. */
  | { outcome: 'discarded'; reason: string }
  | { outcome: 'left'; reason: string }
)

export type RecoverOptions = RecorderOptions & {
  /** Sessions this bot is recording right now, whose journals are not to be touched. */
  recording?: Set<string>
}

export async function recoverSessions(options: RecoverOptions, nowMs: number): Promise<RecoveredJournal[]> {
  const { store, journalDir } = options
  let names: string[]
  try {
    names = readdirSync(journalDir)
  } catch {
    return []
  }
  const recovered: RecoveredJournal[] = []
  for (const name of names.filter((entry) => entry.endsWith('.journal')).sort()) {
    const journalPath = path.join(journalDir, name)
    const { records } = readJournal(journalPath)
    const session = journalSession(records)
    if (!session) {
      recovered.push({ journalPath, outcome: 'left', reason: 'not a session journal' })
      continue
    }
    if (options.recording?.has(session.location.sessionId)) continue

    const state = await store.sessionState(session.location)
    if (state === null || state === 'ended') {
      // Finishing an ended session again would ask for its recap again.
      rmSync(journalPath, { force: true })
      recovered.push({ journalPath, outcome: 'discarded', reason: state ? 'the session had already ended' : 'the session no longer exists' })
      continue
    }

    const stopped = records.some((record) => record.type === 'event' && record.event.kind === 'session-stopped')
    if (stopped) {
      const result = await finaliseSession({
        store,
        journalPath,
        connectSpeech: options.connectSpeech,
        maxSegmentSeconds: options.maxSegmentSeconds,
        giveUpAfterMs: options.finaliseGiveUpAfterMs,
        nowMs,
      })
      recovered.push({ journalPath, outcome: 'finalised', result })
      continue
    }

    const result = await SessionRecorder.resume(journalPath, options, nowMs)
    recovered.push(
      result.status === 'resumed'
        ? { journalPath, outcome: 'resumed', recorder: result.recorder }
        : { journalPath, outcome: 'left', reason: result.reason },
    )
  }
  return recovered
}

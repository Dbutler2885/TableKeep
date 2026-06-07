import { useState } from 'react'
import type { NpcRecord, SessionCalendarEntry, SessionNote, SessionNpcMention, SessionScene } from '../../types/app'
import { getResolvedSessionNumber, sanitizeSessionTitle } from './sessionNoteUtils'

type SessionNoteImporterProps = {
  npcs: NpcRecord[]
  onImport: (note: SessionNote) => void
  onClose: () => void
}

type ParseResult =
  | { ok: true; note: SessionNote }
  | { ok: false; error: string }

function parseAndNormalize(raw: string, npcs: NpcRecord[]): ParseResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON object' }
  }

  const title = typeof parsed.title === 'string' ? parsed.title : ''
  if (!title) return { ok: false, error: 'Missing required field: title' }

  const sessionNumber = typeof parsed.session_number === 'number'
    ? parsed.session_number
    : typeof parsed.sessionNumber === 'number'
      ? parsed.sessionNumber
      : null

  const overallSummary = typeof parsed.overall_summary === 'string'
    ? parsed.overall_summary
    : typeof parsed.overallSummary === 'string'
      ? parsed.overallSummary
      : ''

  const summaryMarkdown = typeof parsed.summary_markdown === 'string'
    ? parsed.summary_markdown
    : typeof parsed.summaryMarkdown === 'string'
      ? parsed.summaryMarkdown
      : ''

  const scenes: SessionScene[] = Array.isArray(parsed.scenes)
    ? parsed.scenes.map((s: Record<string, unknown>) => ({
        name: typeof s.name === 'string' ? s.name : '',
        summary: typeof s.summary === 'string' ? s.summary : '',
        details: Array.isArray(s.details)
          ? s.details.filter((d): d is string => typeof d === 'string')
          : [],
      }))
    : []

  const npcLookup = new Map<string, string>()
  npcs.forEach((npc) => {
    const key = npc.name.toLowerCase().trim()
    if (npcLookup.has(key)) {
      npcLookup.delete(key)
    } else {
      npcLookup.set(key, npc.id)
    }
  })

  const rawNpcs = Array.isArray(parsed.npcs) ? parsed.npcs : []
  const npcMentions: SessionNpcMention[] = rawNpcs.map((n: Record<string, unknown>, i: number) => {
    const npcKey = typeof n.npc_key === 'string'
      ? n.npc_key
      : typeof n.npcKey === 'string'
        ? n.npcKey
        : `npc_${i}`
    const name = typeof n.name === 'string' ? n.name : ''
    const matchId = npcLookup.get(name.toLowerCase().trim()) ?? null
    return {
      npcKey,
      name,
      title: typeof n.title === 'string' ? n.title : '',
      action: n.action === 'update' ? 'update' : 'new' as const,
      facts: Array.isArray(n.facts)
        ? n.facts.filter((f): f is string => typeof f === 'string')
        : [],
      linkedNpcId: matchId,
    }
  })

  const rawCalendar = Array.isArray(parsed.calendar) ? parsed.calendar : []
  const calendar: SessionCalendarEntry[] = rawCalendar.map((c: Record<string, unknown>, i: number) => ({
    key: typeof c.key === 'string' ? c.key : `day_${String(i + 1).padStart(3, '0')}`,
    action: c.action === 'update' ? 'update' : 'new' as const,
    label: typeof c.label === 'string' ? c.label : '',
    dayComplete: c.day_complete === true || c.dayComplete === true,
    entries: Array.isArray(c.entries)
      ? c.entries.filter((e): e is string => typeof e === 'string')
      : [],
  }))

  const cliffhangers = Array.isArray(parsed.cliffhangers)
    ? parsed.cliffhangers.filter((c): c is string => typeof c === 'string')
    : []

  const resolvedSessionNumber = getResolvedSessionNumber({ title, sessionNumber })
  const note: SessionNote = {
    id: crypto.randomUUID(),
    title: sanitizeSessionTitle(title, resolvedSessionNumber),
    sessionNumber: resolvedSessionNumber,
    sourceType: 'api',
    createdAt: null,
    updatedAt: null,
    summaryMarkdown,
    overallSummary,
    scenes,
    npcMentions,
    cliffhangers,
    calendar,
    generatedSnapshot: {
      title,
      summaryMarkdown,
      overallSummary,
      scenes,
      npcMentions,
      cliffhangers,
      calendar,
    },
    hasHumanEdits: false,
    editedAt: null,
    editedBy: null,
  }

  return { ok: true, note }
}

export function SessionNoteImporter({ npcs, onImport, onClose }: SessionNoteImporterProps) {
  const [rawJson, setRawJson] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)

  const handleParse = () => {
    const result = parseAndNormalize(rawJson, npcs)
    setParseResult(result)
  }

  const handleConfirm = () => {
    if (parseResult?.ok) {
      onImport(parseResult.note)
    }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal session-importer-modal">
        <h3>Import Session Notes</h3>
        <p className="session-importer-hint">Paste the AI-generated JSON from your session summary.</p>

        <textarea
          className="session-importer-textarea"
          value={rawJson}
          onChange={(e) => {
            setRawJson(e.target.value)
            setParseResult(null)
          }}
          placeholder='{ "title": "Session 1: ...", ... }'
          rows={12}
        />

        {parseResult && !parseResult.ok ? (
          <p className="session-importer-error">{parseResult.error}</p>
        ) : null}

        {parseResult?.ok ? (
          <div className="session-importer-preview">
            <h4>Preview</h4>
            <p><strong>{parseResult.note.title}</strong></p>
            {parseResult.note.sessionNumber != null ? <p>Session #{parseResult.note.sessionNumber}</p> : null}
            <p>{parseResult.note.scenes.length} scene(s), {parseResult.note.npcMentions.length} NPC(s), {parseResult.note.cliffhangers.length} cliffhanger(s), {parseResult.note.calendar.length} calendar day(s)</p>
            {parseResult.note.npcMentions.filter((n) => n.linkedNpcId).length > 0 ? (
              <p className="session-importer-match-count">
                Auto-matched {parseResult.note.npcMentions.filter((n) => n.linkedNpcId).length} NPC(s) to existing records
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="confirm-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          {parseResult?.ok ? (
            <button type="button" onClick={handleConfirm}>Import</button>
          ) : (
            <button type="button" onClick={handleParse} disabled={!rawJson.trim()}>Parse</button>
          )}
        </div>
      </div>
    </div>
  )
}

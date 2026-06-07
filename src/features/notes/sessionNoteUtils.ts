import type { SessionNote } from '../../types/app'

const SESSION_TITLE_NUMBER_PATTERN = /\bsession\s+(\d+)\b/i
const SESSION_TITLE_PREFIX_PATTERN = /^session\s+(\d+)(?:\s*[:\-]\s*|\s+)?(.*)$/i

function normalizeSessionLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function getDefaultSessionLabel(sessionNumber: number): string {
  return `Session ${sessionNumber}`
}

export function getResolvedSessionNumber(note: Pick<SessionNote, 'sessionNumber' | 'title'>): number | null {
  if (typeof note.sessionNumber === 'number' && Number.isFinite(note.sessionNumber)) {
    return note.sessionNumber
  }

  const match = note.title.match(SESSION_TITLE_NUMBER_PATTERN)
  if (!match) return null

  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function sanitizeSessionTitle(title: string, sessionNumber: number | null): string {
  const trimmed = title.trim()
  if (!trimmed) return ''

  if (sessionNumber != null) {
    const defaultLabel = getDefaultSessionLabel(sessionNumber)
    if (normalizeSessionLabel(trimmed) === normalizeSessionLabel(defaultLabel)) return ''
  }

  const prefixMatch = trimmed.match(SESSION_TITLE_PREFIX_PATTERN)
  if (!prefixMatch) return trimmed

  const parsed = Number.parseInt(prefixMatch[1], 10)
  if (sessionNumber != null && parsed !== sessionNumber) return trimmed

  const remainder = prefixMatch[2]?.trim() ?? ''
  return remainder
}

export function getSessionCustomTitle(note: Pick<SessionNote, 'sessionNumber' | 'title'>): string {
  return sanitizeSessionTitle(note.title, getResolvedSessionNumber(note))
}

export function getSessionDisplayTitle(note: Pick<SessionNote, 'sessionNumber' | 'title'>): string {
  const sessionNumber = getResolvedSessionNumber(note)
  const customTitle = getSessionCustomTitle(note)

  if (customTitle) return customTitle
  if (sessionNumber != null) return getDefaultSessionLabel(sessionNumber)
  return note.title.trim() || 'Untitled Session'
}

export function getSessionCardSubtitle(note: Pick<SessionNote, 'sessionNumber' | 'title'>): string | null {
  const sessionNumber = getResolvedSessionNumber(note)
  if (sessionNumber == null) return null

  return getSessionCustomTitle(note) ? getDefaultSessionLabel(sessionNumber) : null
}

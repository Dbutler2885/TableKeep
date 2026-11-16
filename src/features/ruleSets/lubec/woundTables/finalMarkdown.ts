import type { LubecWoundSeverity } from './types'

// Reads a final wound table's Markdown into its rows, for the conformance test
// only: the app never parses Markdown. Each `##` or `###` heading names a
// location, each table row under it an Impact. A row's wound cell is the bold
// name and then the prose, kept exactly as the file prints it.

export type LubecFinalRow = {
  /** The location's body parts, as the app's hit parts name them. */
  parts: string[]
  heading: string
  impact: number
  orMore: boolean
  severity: LubecWoundSeverity
  trauma: number
  name: string
  prose: string
}

const PARTS: readonly [RegExp, string[]][] = [
  [/^head\b/i, ['head']],
  [/^neck\b/i, ['neck']],
  [/^torso\b/i, ['torso']],
  [/^waist\b/i, ['waist']],
  [/^groin\b/i, ['groin']],
  [/^upper arm\b/i, ['upperarm']],
  [/^forearm\b/i, ['forearm']],
  [/^hand\b/i, ['hand']],
  [/^thigh\b/i, ['thigh']],
  [/^shin and feet\b/i, ['shin', 'feet']],
  [/^shin\b/i, ['shin']],
  [/^foot\b/i, ['feet']],
]

const partsOf = (heading: string): string[] | null => PARTS.find(([pattern]) => pattern.test(heading))?.[1] ?? null

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())

const SEVERITIES: readonly LubecWoundSeverity[] = ['Minor', 'Serious', 'Severe', 'Critical', 'Catastrophic']

function severityOf(text: string): LubecWoundSeverity {
  const severity = SEVERITIES.find((name) => name === text.trim())
  if (!severity) throw new Error(`Unknown severity "${text}"`)
  return severity
}

const traumaOf = (text: string): number => Number(text.trim().replace('+', ''))

/** The bold name and the words after it; a cell that opens straight into a d2 has no name of its own. */
function woundOf(cell: string): { name: string; prose: string } {
  const match = /^\*\*([^*]+?)\.?\*\*\s*(.*)$/.exec(cell)
  if (!match || /^\d+ — /.test(match[1])) return { name: '', prose: cell }
  return { name: match[1].replace(/\.$/, ''), prose: match[2] }
}

type Columns = { severity: number; trauma: number | null; wound: number }

function columnsOf(header: string[]): Columns | null {
  const at = (name: RegExp) => header.findIndex((cell) => name.test(cell))
  if (!/^Impact$/i.test(header[0] ?? '')) return null
  const combined = at(/^Severity \/ Trauma$/i)
  if (combined >= 0) return { severity: combined, trauma: null, wound: at(/^Wound/i) }
  return { severity: at(/^Severity$/i), trauma: at(/^Trauma$/i), wound: at(/^Wound/i) }
}

function rowOf(parts: string[], heading: string, row: string[], columns: Columns): LubecFinalRow {
  const impact = /^(\d+)(\+?)$/.exec(row[0])
  if (!impact) throw new Error(`Unreadable Impact "${row[0]}" under ${heading}`)
  const [severityText, traumaText] = columns.trauma === null
    ? row[columns.severity].split('/').map((part) => part.trim())
    : [row[columns.severity], row[columns.trauma]]
  return { parts, heading, impact: Number(impact[1]), orMore: impact[2] === '+', severity: severityOf(severityText), trauma: traumaOf(traumaText), ...woundOf(row[columns.wound]) }
}

/** Every wound row of one final table file, in file order; headings that name no body location (bands, Heft) are skipped. */
export function readLubecFinalTable(markdown: string): LubecFinalRow[] {
  const rows: LubecFinalRow[] = []
  let heading = ''
  let parts: string[] | null = null
  let columns: Columns | null = null
  for (const line of markdown.split('\n')) {
    const title = /^#{2,3}\s+(.*)$/.exec(line)
    if (title) {
      heading = title[1].trim()
      parts = partsOf(heading)
      columns = null
      continue
    }
    if (!parts || !line.startsWith('|')) continue
    const row = cells(line)
    if (!columns) { columns = columnsOf(row); continue }
    if (/^:?-+:?$/.test(row[0])) continue
    rows.push(rowOf(parts, heading, row, columns))
  }
  return rows
}

/**
 * Comparing two transcripts of the same stretch of a session.
 *
 * Neither transcript is the truth. The figures here say how far they disagree,
 * and the listing puts them side by side for a person to judge.
 */

export type Line = { speaker: string; start: number; end: number; text: string }

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** The fewest word insertions, deletions and substitutions that turn one list into the other. */
export function editDistance(left: string[], right: string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1)
      current.push(Math.min(substitution, previous[column]! + 1, current[column - 1]! + 1))
    }
    previous = current
  }
  return previous[right.length]!
}

export type SpeakerComparison = { speaker: string; referenceWords: number; candidateWords: number; disagreement: number }

/**
 * How far the candidate's words differ from the reference's, per speaker.
 *
 * The session is compared in windows, since comparing a whole session's words
 * at once is too slow and a wrong word early on should not shift everything
 * after it.
 */
export function compareBySpeaker(reference: Line[], candidate: Line[], windowSeconds = 300): SpeakerComparison[] {
  const speakers = [...new Set([...reference, ...candidate].map((line) => line.speaker))].sort()
  return speakers.map((speaker) => {
    const bucket = (lines: Line[]) => {
      const buckets = new Map<number, string[]>()
      for (const line of lines) {
        if (line.speaker !== speaker) continue
        const key = Math.floor(line.start / windowSeconds)
        buckets.set(key, [...(buckets.get(key) ?? []), ...words(line.text)])
      }
      return buckets
    }
    const referenceBuckets = bucket(reference)
    const candidateBuckets = bucket(candidate)
    let distance = 0
    let referenceWords = 0
    let candidateWords = 0
    for (const key of new Set([...referenceBuckets.keys(), ...candidateBuckets.keys()])) {
      const left = referenceBuckets.get(key) ?? []
      const right = candidateBuckets.get(key) ?? []
      distance += editDistance(left, right)
      referenceWords += left.length
      candidateWords += right.length
    }
    return {
      speaker,
      referenceWords,
      candidateWords,
      disagreement: referenceWords === 0 ? 0 : distance / referenceWords,
    }
  })
}

/** How many times each term appears in a transcript, ignoring case. */
export function countTerms(lines: Line[], terms: string[]): Map<string, number> {
  const text = ` ${lines.map((line) => words(line.text).join(' ')).join(' ')} `
  return new Map(
    terms.map((term) => {
      const needle = ` ${words(term).join(' ')} `
      return [term, needle.trim() ? text.split(needle).length - 1 : 0]
    }),
  )
}

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = String(Math.floor((whole % 3600) / 60)).padStart(2, '0')
  const rest = String(whole % 60).padStart(2, '0')
  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`
}

/** The two transcripts interleaved minute by minute, as Markdown. */
export function sideBySide(reference: Line[], candidate: Line[], referenceName: string, candidateName: string): string {
  const minutes = new Set([...reference, ...candidate].map((line) => Math.floor(line.start / 60)))
  const out: string[] = []
  for (const minute of [...minutes].sort((a, b) => a - b)) {
    out.push(`### ${clock(minute * 60)}`, '')
    for (const [name, lines] of [
      [referenceName, reference],
      [candidateName, candidate],
    ] as const) {
      out.push(`**${name}**`, '')
      for (const line of lines) {
        if (Math.floor(line.start / 60) === minute) out.push(`- [${clock(line.start)}] ${line.speaker}: ${line.text}`)
      }
      out.push('')
    }
  }
  return out.join('\n')
}

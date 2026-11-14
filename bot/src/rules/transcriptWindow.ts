/**
 * The stretch of a live session's transcript that a rules question is looked
 * for in.
 *
 * Utterances arrive one speaker at a time, each as soon as that speaker has
 * paused, so they come out of order across speakers. They are kept in the
 * order they were said, and the window is the last stretch of them, measured
 * on the session's own timeline rather than by when they arrived. Anything
 * replayed from long ago, as after a restart, is therefore never in it.
 * Windows overlap: what keeps a question from being answered twice is the
 * bot's own recent answers, which are looked at alongside each window.
 */

/** Utterance times are counted in samples at this rate from the start of the session. */
export const SESSION_SAMPLE_RATE = 48_000

/** One person's stretch of speech, with the name the table knows them by. */
export type TranscriptLine = {
  speaker: string
  startSamples: number
  endSamples: number
  text: string
}

export type TranscriptWindowOptions = {
  /** How far back from now the window reaches. */
  windowSeconds: number
  /** The most text a window holds. When there is more, its oldest lines are left out. */
  maxChars: number
}

export class TranscriptWindow {
  #options: TranscriptWindowOptions
  #lines: TranscriptLine[] = []

  constructor(options: TranscriptWindowOptions) {
    this.#options = options
  }

  /** Takes in newly transcribed lines, wherever they fall on the timeline. */
  add(lines: readonly TranscriptLine[]): void {
    for (const line of lines) {
      if (!line.text.trim()) continue
      this.#lines.push(line)
    }
    this.#lines.sort((a, b) => a.startSamples - b.startSamples || a.endSamples - b.endSamples)
  }

  /** The lines of the last stretch of the session, oldest first. `nowSamples` is the session's current position. */
  at(nowSamples: number): TranscriptLine[] {
    const fromSamples = nowSamples - this.#options.windowSeconds * SESSION_SAMPLE_RATE
    // Anything that ended before the window could open can never be in one again.
    const lines = (this.#lines = this.#lines.filter((line) => line.endSamples >= fromSamples))
    let chars = 0
    let first = lines.length
    while (first > 0) {
      const line = lines[first - 1]!
      chars += line.speaker.length + line.text.length + 3
      // The latest line is always kept, however long it is: it is the likeliest to hold the question.
      if (chars > this.#options.maxChars && first < lines.length) break
      first -= 1
    }
    return lines.slice(first)
  }
}

/** A window as text, one line per stretch of speech: `Name: what they said`. */
export function transcriptText(window: readonly TranscriptLine[]): string {
  return window.map((line) => `${line.speaker}: ${line.text.trim()}`).join('\n')
}

/** A rules answer the bot has posted in this session: what was asked, by whom, and what it said. */
export type RecentAnswer = { askedBy: string; question: string; answer: string }

/** The bot's recent answers as text, oldest first, or a line saying there are none. */
export function recentAnswersText(answers: readonly RecentAnswer[]): string {
  if (answers.length === 0) return 'The bot has not answered any rules question in the last few minutes.'
  return answers.map((recent) => `${recent.askedBy || 'Someone'} asked: ${recent.question}\nThe bot answered: ${recent.answer}`).join('\n\n')
}

/**
 * The stretch of a live session's transcript that a rules question is looked
 * for in.
 *
 * Utterances arrive one speaker at a time, each as soon as that speaker has
 * paused, so they come out of order across speakers. They are kept in the
 * order they were said, and the window is the last stretch of them, measured
 * on the session's own timeline rather than by when they arrived. Anything
 * replayed from long ago, as after a restart, is therefore never in it.
 *
 * A window that has been answered is not looked at again: everything up to
 * its last line is behind a floor, and only what was said after it can raise
 * a new question.
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
  /** Lines that ended at or before this point have been dealt with. */
  #floorSamples = -Infinity

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

  /**
   * The lines of the last stretch of the session, oldest first, that are past
   * the floor. `nowSamples` is the session's current position.
   */
  at(nowSamples: number): TranscriptLine[] {
    const fromSamples = nowSamples - this.#options.windowSeconds * SESSION_SAMPLE_RATE
    // Anything that ended before the window could open can never be in one again.
    this.#lines = this.#lines.filter((line) => line.endSamples >= fromSamples)
    const lines = this.#lines.filter((line) => line.endSamples > this.#floorSamples)
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

  /** Marks everything up to the end of this window as dealt with. */
  settle(window: readonly TranscriptLine[]): void {
    const end = Math.max(...window.map((line) => line.endSamples))
    if (end > this.#floorSamples) this.#floorSamples = end
  }
}

/** A window as text, one line per stretch of speech: `Name: what they said`. */
export function transcriptText(window: readonly TranscriptLine[]): string {
  return window.map((line) => `${line.speaker}: ${line.text.trim()}`).join('\n')
}

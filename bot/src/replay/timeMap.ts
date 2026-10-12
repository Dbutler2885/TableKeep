/**
 * Translating the speech service's clock onto the session timeline.
 *
 * The service counts only the audio it was given. When it is sent speech and
 * not the silence between, its clock falls steadily behind the session. This
 * map remembers which stretch of the session each stretch of sent audio came
 * from, so a time the service reports can be placed back on the session.
 */

type Stretch = {
  /** Where this stretch begins on the service's clock, in seconds. */
  streamStart: number
  /** Where the same audio begins on the session timeline, in seconds. */
  sessionStart: number
  duration: number
}

export class TimeMap {
  #stretches: Stretch[] = []
  #streamEnd = 0

  /** Seconds of audio sent so far, which is where the service's clock stands. */
  get streamSeconds(): number {
    return this.#streamEnd
  }

  /** Records that `duration` seconds of audio, starting at `sessionStart`, were just sent. */
  append(sessionStart: number, duration: number): void {
    if (duration <= 0) return
    const last = this.#stretches.at(-1)
    // Audio that carries straight on from the previous send extends its stretch.
    if (last && Math.abs(last.sessionStart + last.duration - sessionStart) < 1e-6) {
      last.duration += duration
    } else {
      this.#stretches.push({ streamStart: this.#streamEnd, sessionStart, duration })
    }
    this.#streamEnd += duration
  }

  /**
   * The session time of a moment on the service's clock.
   *
   * A time exactly on the join between two stretches belongs to the earlier
   * one when `edge` is "end", so that a word ending as a burst ends is not
   * placed at the start of the next burst, seconds later.
   */
  toSession(streamTime: number, edge: 'start' | 'end' = 'start'): number {
    const stretches = this.#stretches
    if (stretches.length === 0) return streamTime

    let low = 0
    let high = stretches.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (stretches[middle]!.streamStart <= streamTime) low = middle
      else high = middle - 1
    }

    let stretch = stretches[low]!
    if (edge === 'end' && low > 0 && streamTime <= stretch.streamStart) {
      stretch = stretches[low - 1]!
    }
    const offset = Math.min(Math.max(streamTime - stretch.streamStart, 0), stretch.duration)
    return stretch.sessionStart + offset
  }

  /**
   * The session times of a word the service places between two moments on its clock.
   *
   * Where two bursts were sent back to back the service has no silence to
   * mark the join, and its timing for a word beside the join can stray a
   * little into the neighbouring burst. A word is taken to belong to the burst
   * that holds its middle, and its ends are kept inside that burst, so that a
   * word spoken after a long silence is never placed before it.
   */
  spanToSession(streamStart: number, streamEnd: number): { start: number; end: number } {
    const stretches = this.#stretches
    if (stretches.length === 0) return { start: streamStart, end: streamEnd }
    const middle = (streamStart + streamEnd) / 2
    const stretch =
      stretches.findLast((candidate) => candidate.streamStart <= middle) ?? stretches[0]!
    const within = (streamTime: number) =>
      stretch.sessionStart + Math.min(Math.max(streamTime - stretch.streamStart, 0), stretch.duration)
    return { start: within(streamStart), end: within(streamEnd) }
  }
}

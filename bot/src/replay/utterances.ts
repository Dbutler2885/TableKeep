/**
 * Turning the speech service's stream of results into finished utterances.
 *
 * The service sends a result for each fragment it settles on, and separately
 * signals when the speaker has paused. An utterance here is everything settled
 * between two pauses.
 */
import { TimeMap } from './timeMap.ts'

export type ServiceWord = { word: string; punctuated_word?: string; start: number; end: number }

/** The fields of a Deepgram `Results` message this module reads. */
export type ServiceResult = {
  type: 'Results'
  is_final?: boolean
  speech_final?: boolean
  from_finalize?: boolean
  channel?: { alternatives?: { transcript?: string; words?: ServiceWord[] }[] }
}

export type Utterance = { start: number; end: number; text: string }

export class UtteranceBuilder {
  #map: TimeMap
  #words: ServiceWord[] = []
  #finished: Utterance[] = []

  constructor(map: TimeMap) {
    this.#map = map
  }

  /** Takes one result from the service. Only settled fragments are kept. */
  accept(result: ServiceResult): void {
    if (!result.is_final) return
    const words = result.channel?.alternatives?.[0]?.words ?? []
    this.#words.push(...words)
    if (result.speech_final || result.from_finalize) this.close()
  }

  /** Ends the utterance in progress, as when the service reports the speaker paused. */
  close(): void {
    const first = this.#words[0]
    const last = this.#words.at(-1)
    if (!first || !last) return
    this.#finished.push({
      start: this.#map.toSession(first.start, 'start'),
      end: this.#map.toSession(last.end, 'end'),
      text: this.#words.map((word) => word.punctuated_word ?? word.word).join(' '),
    })
    this.#words = []
  }

  /** Every utterance finished so far, in the order the service produced them. */
  finished(): Utterance[] {
    return this.#finished
  }
}

/**
 * A transcript as text a person, or a language model, can read.
 *
 * The speech service ends an utterance at every pause, so one thought often
 * arrives in several pieces. Consecutive pieces from one speaker are joined
 * when the pause between them is short, as the old pipeline did.
 */
import { OPUS_SAMPLE_RATE } from '../audio/opus.ts'
import type { Utterance } from '../speech/transcriber.ts'

/** Pieces from one speaker closer together than this read as one line. */
const JOIN_WITHIN_SECONDS = 2

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = String(Math.floor((whole % 3600) / 60)).padStart(2, '0')
  const rest = String(whole % 60).padStart(2, '0')
  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`
}

/** One line per stretch of speech: `[mm:ss] Name: what they said`. */
export function renderTranscript(utterances: Utterance[], names: Map<string, string>): string {
  const ordered = [...utterances].sort((a, b) => a.startSamples - b.startSamples)
  const lines: { speakerId: string; startSamples: number; endSamples: number; text: string }[] = []
  for (const utterance of ordered) {
    const last = lines.at(-1)
    if (
      last &&
      last.speakerId === utterance.speakerId &&
      utterance.startSamples - last.endSamples < JOIN_WITHIN_SECONDS * OPUS_SAMPLE_RATE
    ) {
      last.text += ` ${utterance.text}`
      last.endSamples = Math.max(last.endSamples, utterance.endSamples)
    } else {
      lines.push({ ...utterance })
    }
  }
  return lines
    .map((line) => `[${clock(line.startSamples / OPUS_SAMPLE_RATE)}] ${names.get(line.speakerId) ?? line.speakerId}: ${line.text}`)
    .join('\n')
}

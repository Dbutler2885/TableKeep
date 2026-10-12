/**
 * Replays an archived session through the live speech service as if it were happening now.
 *
 * Each speaker's recording is sent over its own connection at the pace it was
 * spoken. The result is compared with the transcript already on record.
 *
 *   npm run replay -- <recording-folder> --start 600 --duration 600 --out <folder>
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { findBursts, totalSamples, type SampleRange } from './bursts.ts'
import { clock, compareBySpeaker, countTerms, sideBySide, type Line } from './compare.ts'
import { SpeechStream } from './speechStream.ts'
import { TimeMap } from './timeMap.ts'
import { UtteranceBuilder, type ServiceResult } from './utterances.ts'

const SAMPLE_RATE = 16_000
const TICK_MS = 20
/** A run of exact zeros this long means Discord sent nothing, as opposed to speech crossing zero. */
const BURST_GAP_SECONDS = 0.2
const KEEP_ALIVE_MS = 3_000

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    start: { type: 'string', default: '0' },
    duration: { type: 'string', default: '600' },
    /** "bursts" sends only what Discord transmitted; "continuous" sends the silence too. */
    mode: { type: 'string', default: 'bursts' },
    speed: { type: 'string', default: '1' },
    out: { type: 'string', default: 'replay-out' },
    reference: { type: 'string' },
    glossary: { type: 'string' },
    model: { type: 'string', default: 'nova-3' },
    endpointing: { type: 'string', default: '300' },
    /** With nothing arriving from a speaker for this long, ask the service to settle what it has. */
    'finalize-after': { type: 'string', default: '700' },
    only: { type: 'string' },
  },
})

const recordingDir = positionals[0]
if (!recordingDir) throw new Error('Usage: npm run replay -- <recording-folder> [options]')
const apiKey = process.env.DEEPGRAM_API_KEY
if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set. Put it in bot/.env.local.')

const startSeconds = Number(options.start)
const durationSeconds = Number(options.duration)
const speed = Number(options.speed)
const continuous = options.mode === 'continuous'
const finalizeAfterMs = Number(options['finalize-after'])
const outDir = path.resolve(options.out)
const referencePath = options.reference ?? path.join(recordingDir, '..', 'Transcript', 'transcript.json')
const glossaryPath = options.glossary ?? path.join(recordingDir, '..', '..', 'glossary.json')

/** The names worth telling the speech service about, from the group's glossary. */
function readKeyterms(): string[] {
  if (!existsSync(glossaryPath)) return []
  const glossary = JSON.parse(readFileSync(glossaryPath, 'utf8')) as {
    gm?: string
    players?: Record<string, { player?: string; character?: string }>
    corrections?: Record<string, string>
  }
  const terms = [
    glossary.gm,
    ...Object.values(glossary.players ?? {}).flatMap((player) => [player.player, player.character]),
    ...Object.values(glossary.corrections ?? {}),
  ]
  return [...new Set(terms.filter((term): term is string => Boolean(term)))]
}

function decode(file: string): Int16Array {
  const result = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-ss', String(startSeconds), '-t', String(durationSeconds), '-i', file, '-ar', String(SAMPLE_RATE), '-ac', '1', '-f', 's16le', '-'],
    { maxBuffer: 2 ** 31 - 1 },
  )
  if (result.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${result.stderr}`)
  const bytes = result.stdout
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!
}

class Speaker {
  readonly name: string
  readonly samples: Int16Array
  readonly ranges: SampleRange[]
  readonly map = new TimeMap()
  readonly builder = new UtteranceBuilder(this.map)
  readonly stream: SpeechStream
  /** What was sent and when, for studying the run afterwards. */
  readonly sent: { at: number; kind: string; sessionStart?: number; duration?: number }[] = []
  readonly latenciesMs: number[] = []
  readonly counts: Record<string, number> = {}
  metadata: Record<string, unknown> | null = null
  #rangeIndex = 0
  #cursor = 0
  #lastAudioAt = 0
  #lastSignalAt = Date.now()
  #settled = true
  /** When each point on the service's clock was sent, to measure how long results take. */
  #sentAt: { streamSeconds: number; at: number }[] = []

  constructor(name: string, samples: Int16Array, keyterms: string[]) {
    this.name = name
    this.samples = samples
    this.ranges = continuous
      ? [{ start: 0, end: samples.length }]
      : findBursts(samples, BURST_GAP_SECONDS * SAMPLE_RATE)
    this.#cursor = this.ranges[0]?.start ?? 0
    this.stream = new SpeechStream({
      apiKey: apiKey!,
      sampleRate: SAMPLE_RATE,
      model: options.model,
      endpointingMs: Number(options.endpointing),
      keyterms,
    })
    this.stream.onmessage = (message, receivedAt) => this.#hear(message, receivedAt)
  }

  get done(): boolean {
    return this.#rangeIndex >= this.ranges.length
  }

  #count(key: string): void {
    this.counts[key] = (this.counts[key] ?? 0) + 1
  }

  #hear(message: Record<string, unknown>, receivedAt: number): void {
    this.#count(String(message.type))
    if (message.type === 'Metadata') this.metadata = message
    if (message.type !== 'Results') return
    const result = message as unknown as ServiceResult
    if (result.is_final) this.#count('settled')
    if (result.speech_final) this.#count('pause detected')
    if (result.from_finalize) this.#count('settled on request')
    const lastWord = result.channel?.alternatives?.[0]?.words?.at(-1)
    if (result.is_final && lastWord) {
      const sent = this.#sentAt.find((entry) => entry.streamSeconds >= lastWord.end)
      if (sent) this.latenciesMs.push(receivedAt - sent.at)
    }
    this.builder.accept(result)
  }

  /** Sends whatever this speaker said up to `sessionSample`, and keeps the connection in order. */
  advance(sessionSample: number, now: number): void {
    let sentSomething = false
    for (;;) {
      const range = this.ranges[this.#rangeIndex]
      if (!range || range.start >= sessionSample) break
      const from = Math.max(this.#cursor, range.start)
      const to = Math.min(range.end, sessionSample)
      if (to > from) {
        this.stream.sendAudio(this.samples.subarray(from, to))
        this.map.append(startSeconds + from / SAMPLE_RATE, (to - from) / SAMPLE_RATE)
        this.#sentAt.push({ streamSeconds: this.map.streamSeconds, at: now })
        if (from === range.start) {
          this.sent.push({ at: now, kind: 'burst', sessionStart: startSeconds + from / SAMPLE_RATE, duration: (range.end - range.start) / SAMPLE_RATE })
        }
        this.#cursor = to
        sentSomething = true
      }
      if (this.#cursor < range.end) break
      this.#rangeIndex += 1
      this.#cursor = this.ranges[this.#rangeIndex]?.start ?? 0
    }

    if (sentSomething) {
      this.#lastAudioAt = now
      this.#lastSignalAt = now
      this.#settled = false
      return
    }
    if (!continuous && !this.#settled && now - this.#lastAudioAt >= finalizeAfterMs / speed) {
      this.stream.finalize()
      this.sent.push({ at: now, kind: 'finalize' })
      this.#settled = true
      this.#lastSignalAt = now
    }
    if (now - this.#lastSignalAt >= KEEP_ALIVE_MS) {
      this.stream.keepAlive()
      this.sent.push({ at: now, kind: 'keepalive' })
      this.#lastSignalAt = now
    }
  }

  async finish(): Promise<void> {
    this.stream.finalize()
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    this.builder.close()
    await this.stream.close()
  }

  summary() {
    return {
      speaker: this.name,
      trackSeconds: this.samples.length / SAMPLE_RATE,
      sentSeconds: totalSamples(this.ranges) / SAMPLE_RATE,
      bursts: this.ranges.length,
      billedSecondsReportedByService: (this.metadata?.duration as number | undefined) ?? null,
      messages: this.counts,
      utterances: this.builder.finished().length,
      keepAlivesSent: this.sent.filter((entry) => entry.kind === 'keepalive').length,
      finalizesSent: this.sent.filter((entry) => entry.kind === 'finalize').length,
      latencyMs: {
        median: percentile(this.latenciesMs, 0.5),
        p95: percentile(this.latenciesMs, 0.95),
        max: percentile(this.latenciesMs, 1),
      },
      closed: this.stream.closed,
    }
  }
}

const keyterms = readKeyterms()
const files = readdirSync(recordingDir)
  .filter((file) => file.toLowerCase().endsWith('.flac'))
  .sort()
  .filter((file) => !options.only || file.includes(options.only))
if (files.length === 0) throw new Error(`No recordings found in ${recordingDir}`)

console.log(`Decoding ${files.length} tracks from ${clock(startSeconds)} for ${clock(durationSeconds)}...`)
const speakers = files.map((file) => {
  // Craig names tracks "2-discordname.flac".
  const name = path.basename(file, path.extname(file)).replace(/^\d+-/, '')
  return new Speaker(name, decode(path.join(recordingDir, file)), keyterms)
})
await Promise.all(speakers.map((speaker) => speaker.stream.opened()))
console.log(`Connected. Replaying in ${continuous ? 'continuous' : 'bursts'} mode at ${speed}x.`)

const startedAt = Date.now()
const totalSessionSamples = Math.max(...speakers.map((speaker) => speaker.samples.length))
await new Promise<void>((resolve) => {
  let lastReport = 0
  const timer = setInterval(() => {
    const now = Date.now()
    const sessionSample = Math.floor(((now - startedAt) / 1000) * speed * SAMPLE_RATE)
    for (const speaker of speakers) speaker.advance(sessionSample, now)
    if (now - lastReport > 30_000) {
      lastReport = now
      console.log(`  ${clock(sessionSample / SAMPLE_RATE)} of ${clock(durationSeconds)}`)
    }
    if (sessionSample >= totalSessionSamples) {
      clearInterval(timer)
      resolve()
    }
  }, TICK_MS)
})
await Promise.all(speakers.map((speaker) => speaker.finish()))

const candidate: Line[] = speakers
  .flatMap((speaker) => speaker.builder.finished().map((utterance) => ({ speaker: speaker.name, ...utterance })))
  .sort((a, b) => a.start - b.start)
const reference: Line[] = existsSync(referencePath)
  ? (JSON.parse(readFileSync(referencePath, 'utf8')) as Line[]).filter(
      (line) => line.start >= startSeconds && line.start < startSeconds + durationSeconds,
    )
  : []

mkdirSync(path.join(outDir, 'exchange'), { recursive: true })
writeFileSync(path.join(outDir, 'transcript.json'), JSON.stringify(candidate, null, 2))
writeFileSync(
  path.join(outDir, 'transcript.txt'),
  candidate.map((line) => `[${clock(line.start)}] ${line.speaker}: ${line.text}`).join('\n'),
)
for (const speaker of speakers) {
  const events = [
    ...speaker.sent.map((entry) => ({ direction: 'sent', ...entry })),
    ...speaker.stream.received.map((entry) => ({ direction: 'received', at: entry.receivedAt, message: entry.message })),
  ].sort((a, b) => a.at - b.at)
  writeFileSync(path.join(outDir, 'exchange', `${speaker.name}.jsonl`), events.map((event) => JSON.stringify(event)).join('\n'))
}

const summaries = speakers.map((speaker) => speaker.summary())
const comparison = compareBySpeaker(reference, candidate)
const referenceTerms = countTerms(reference, keyterms)
const candidateTerms = countTerms(candidate, keyterms)
const findings = {
  recording: path.resolve(recordingDir),
  window: { startSeconds, durationSeconds },
  mode: continuous ? 'continuous' : 'bursts',
  speed,
  model: options.model,
  endpointingMs: Number(options.endpointing),
  finalizeAfterMs: continuous ? null : finalizeAfterMs,
  keyterms,
  wallSeconds: (Date.now() - startedAt) / 1000,
  totalSentSeconds: summaries.reduce((sum, summary) => sum + summary.sentSeconds, 0),
  totalBilledSecondsReportedByService: summaries.reduce((sum, summary) => sum + (summary.billedSecondsReportedByService ?? 0), 0),
  speakers: summaries,
  comparison,
  terms: keyterms.map((term) => ({ term, reference: referenceTerms.get(term), candidate: candidateTerms.get(term) })),
}
writeFileSync(path.join(outDir, 'findings.json'), JSON.stringify(findings, null, 2))

const table = (header: string[], rows: (string | number | null | undefined)[][]) =>
  [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map((cell) => cell ?? '').join(' | ')} |`)].join('\n')

writeFileSync(
  path.join(outDir, 'comparison.md'),
  [
    `# Replay comparison`,
    '',
    `Window ${clock(startSeconds)} to ${clock(startSeconds + durationSeconds)}, ${findings.mode} mode, ${speed}x, model ${options.model}.`,
    'Neither transcript is the truth; "disagreement" is how far the live transcript\'s words differ from the one on record.',
    '',
    '## Per speaker',
    '',
    table(
      ['Speaker', 'Words on record', 'Words live', 'Disagreement', 'Audio sent (s)', 'Bursts', 'Median delay (ms)', '95th delay (ms)'],
      summaries.map((summary) => {
        const row = comparison.find((entry) => entry.speaker === summary.speaker)
        return [summary.speaker, row?.referenceWords, row?.candidateWords, row ? `${(row.disagreement * 100).toFixed(0)}%` : '', summary.sentSeconds.toFixed(0), summary.bursts, summary.latencyMs.median, summary.latencyMs.p95]
      }),
    ),
    '',
    '## Names from the glossary',
    '',
    table(['Term', 'Times on record', 'Times live'], findings.terms.map((term) => [term.term, term.reference, term.candidate])),
    '',
    '## Side by side',
    '',
    sideBySide(reference, candidate, 'On record', 'Live'),
  ].join('\n'),
)

console.log(`Done. ${candidate.length} utterances. Results in ${outDir}`)
for (const summary of summaries) {
  console.log(`  ${summary.speaker}: sent ${summary.sentSeconds.toFixed(0)}s of ${summary.trackSeconds.toFixed(0)}s, ${summary.utterances} utterances, median delay ${summary.latencyMs.median}ms`)
}

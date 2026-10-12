/**
 * Finding the stretches of a recorded track that Discord actually transmitted.
 *
 * Discord sends nothing while a person is quiet, and a Craig recording fills
 * those stretches with exact digital silence so the tracks line up. A run of
 * exact zeros in a Craig track is therefore a stretch Discord never sent, and
 * everything between two such runs is one burst as the bot would receive it.
 */

/** A half-open range of samples, `[start, end)`. */
export type SampleRange = { start: number; end: number }

/**
 * Splits a track into the bursts Discord transmitted.
 *
 * A run of zeros shorter than `minGapSamples` stays inside its burst: real
 * speech crosses zero constantly, and only a sustained run means nothing was
 * sent.
 */
export function findBursts(samples: Int16Array, minGapSamples: number): SampleRange[] {
  const bursts: SampleRange[] = []
  let burstStart = -1
  let lastNonZero = -1

  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index] === 0) continue
    if (burstStart === -1) {
      burstStart = index
    } else if (index - lastNonZero > minGapSamples) {
      bursts.push({ start: burstStart, end: lastNonZero + 1 })
      burstStart = index
    }
    lastNonZero = index
  }

  if (burstStart !== -1) bursts.push({ start: burstStart, end: lastNonZero + 1 })
  return bursts
}

/** Total length of a set of ranges, in samples. */
export function totalSamples(ranges: SampleRange[]): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start), 0)
}

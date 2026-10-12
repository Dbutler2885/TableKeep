/**
 * The few facts about an Opus packet the recorder needs, read from its first bytes.
 *
 * Discord delivers voice as Opus packets, one per 20 ms as a rule. The recorder
 * never decodes them; it only needs to know how much time each one covers, so
 * that it can place audio on a timeline and tell silence from loss.
 */

/** Discord's voice audio is always carried at this rate. */
export const OPUS_SAMPLE_RATE = 48_000

/** What a Discord client sends for a fifth of a second when a person stops talking, then nothing. */
const SILENCE_FRAME = Uint8Array.of(0xf8, 0xff, 0xfe)

/** Samples per frame for each of the 32 configurations in the packet's first byte (RFC 6716, section 3.1). */
const FRAME_SAMPLES: number[] = [
  // SILK narrowband, mediumband, wideband: 10, 20, 40, 60 ms
  480, 960, 1920, 2880, 480, 960, 1920, 2880, 480, 960, 1920, 2880,
  // Hybrid superwideband, fullband: 10, 20 ms
  480, 960, 480, 960,
  // CELT narrowband, wideband, superwideband, fullband: 2.5, 5, 10, 20 ms
  120, 240, 480, 960, 120, 240, 480, 960, 120, 240, 480, 960, 120, 240, 480, 960,
]

/**
 * How many samples of audio, at 48 kHz, a packet holds.
 *
 * Returns 0 for a packet too short or too malformed to say.
 */
export function opusPacketSamples(packet: Uint8Array): number {
  const toc = packet[0]
  if (toc === undefined) return 0
  const frameSamples = FRAME_SAMPLES[toc >> 3]!
  switch (toc & 0x03) {
    case 0:
      return frameSamples
    case 1:
    case 2:
      return frameSamples * 2
    default: {
      // The frame count is in the next byte.
      const count = packet[1]
      return count === undefined ? 0 : frameSamples * (count & 0x3f)
    }
  }
}

export function isSilenceFrame(packet: Uint8Array): boolean {
  return packet.length === 3 && packet[0] === SILENCE_FRAME[0] && packet[1] === SILENCE_FRAME[1] && packet[2] === SILENCE_FRAME[2]
}

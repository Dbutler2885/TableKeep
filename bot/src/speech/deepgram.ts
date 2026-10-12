/**
 * Deepgram's live transcription as a `SpeechConnection`.
 *
 * What was learned about the service in the replay comparison is applied here:
 * raw 16 kHz audio, a pause length of 300 ms where the default is far too
 * eager, names passed as keyterms, and keep-alive sent as text.
 */
import { SPEECH_SAMPLE_RATE, type ConnectSpeech, type SpeechConnection } from './transcriber.ts'

const LISTEN_URL = 'wss://api.deepgram.com/v1/listen'
const CLOSE_TIMEOUT_MS = 10_000

export type DeepgramOptions = {
  apiKey: string
  model?: string
  endpointingMs?: number
}

class DeepgramConnection implements SpeechConnection {
  onmessage: ((message: Record<string, unknown>) => void) | null = null
  #socket: WebSocket
  /** What was asked for before the connection finished opening, sent in order once it has. */
  #waiting: (Int16Array | string)[] = []
  #closed: Promise<void>

  constructor(options: DeepgramOptions, keyterms: string[]) {
    const query = new URLSearchParams({
      model: options.model ?? 'nova-3',
      language: 'en',
      encoding: 'linear16',
      sample_rate: String(SPEECH_SAMPLE_RATE),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      endpointing: String(options.endpointingMs ?? 300),
    })
    for (const keyterm of keyterms) query.append('keyterm', keyterm)

    // The key travels as a subprotocol because the built-in WebSocket cannot set headers.
    this.#socket = new WebSocket(`${LISTEN_URL}?${query}`, ['token', options.apiKey])
    this.#socket.addEventListener('open', () => {
      for (const item of this.#waiting) this.#socket.send(item)
      this.#waiting = []
    })
    this.#socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.onmessage?.(JSON.parse(event.data) as Record<string, unknown>)
    })
    this.#closed = new Promise((resolve) => this.#socket.addEventListener('close', () => resolve()))
  }

  #send(item: Int16Array | string): void {
    if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(item)
    else if (this.#socket.readyState === WebSocket.CONNECTING) this.#waiting.push(item)
  }

  sendAudio(samples: Int16Array): void {
    // The service closes a connection that is sent an empty message.
    if (samples.length > 0) this.#send(samples)
  }

  finalize(): void {
    this.#send(JSON.stringify({ type: 'Finalize' }))
  }

  keepAlive(): void {
    this.#send(JSON.stringify({ type: 'KeepAlive' }))
  }

  async close(): Promise<void> {
    this.#send(JSON.stringify({ type: 'CloseStream' }))
    await Promise.race([this.#closed, new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))])
    if (this.#socket.readyState !== WebSocket.CLOSED) this.#socket.close()
  }
}

/** A way of opening Deepgram connections, one per speaker. */
export function connectDeepgram(options: DeepgramOptions): ConnectSpeech {
  return ({ keyterms }) => new DeepgramConnection(options, keyterms)
}

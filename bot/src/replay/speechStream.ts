/**
 * One live transcription connection to Deepgram, for one speaker.
 *
 * Every message the service sends is kept with the time it arrived, so a run
 * can be studied afterwards and replayed as a test fixture.
 */

const LISTEN_URL = 'wss://api.deepgram.com/v1/listen'

export type ReceivedMessage = { receivedAt: number; message: Record<string, unknown> }

export type SpeechStreamOptions = {
  apiKey: string
  sampleRate: number
  model: string
  /** How long a pause the service waits for before it calls a phrase finished, in milliseconds. */
  endpointingMs: number
  keyterms: string[]
}

export class SpeechStream {
  readonly received: ReceivedMessage[] = []
  onmessage: ((message: Record<string, unknown>, receivedAt: number) => void) | null = null
  /** Why the connection closed, once it has. */
  closed: { code: number; reason: string; at: number } | null = null
  #socket: WebSocket
  #opened: Promise<void>
  #closed: Promise<void>

  constructor(options: SpeechStreamOptions) {
    const query = new URLSearchParams({
      model: options.model,
      language: 'en',
      encoding: 'linear16',
      sample_rate: String(options.sampleRate),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      endpointing: String(options.endpointingMs),
    })
    for (const keyterm of options.keyterms) query.append('keyterm', keyterm)

    // The key travels as a subprotocol because the built-in WebSocket cannot set headers.
    this.#socket = new WebSocket(`${LISTEN_URL}?${query}`, ['token', options.apiKey])
    this.#socket.binaryType = 'arraybuffer'

    this.#opened = new Promise((resolve, reject) => {
      this.#socket.addEventListener('open', () => resolve(), { once: true })
      this.#socket.addEventListener('error', () => reject(new Error('Could not connect to the speech service.')), {
        once: true,
      })
    })
    this.#closed = new Promise((resolve) => {
      this.#socket.addEventListener('close', (event) => {
        this.closed = { code: event.code, reason: event.reason, at: Date.now() }
        resolve()
      })
    })
    this.#socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      const receivedAt = Date.now()
      const message = JSON.parse(event.data) as Record<string, unknown>
      this.received.push({ receivedAt, message })
      this.onmessage?.(message, receivedAt)
    })
  }

  opened(): Promise<void> {
    return this.#opened
  }

  get isOpen(): boolean {
    return this.#socket.readyState === WebSocket.OPEN
  }

  sendAudio(samples: Int16Array): void {
    if (this.isOpen) this.#socket.send(samples)
  }

  /** Tells the service the connection is alive while there is no audio to send. */
  keepAlive(): void {
    if (this.isOpen) this.#socket.send(JSON.stringify({ type: 'KeepAlive' }))
  }

  /** Asks the service to settle everything it has heard so far, without waiting for a pause. */
  finalize(): void {
    if (this.isOpen) this.#socket.send(JSON.stringify({ type: 'Finalize' }))
  }

  /** Ends the connection cleanly and waits for the service's closing summary. */
  async close(): Promise<void> {
    if (this.isOpen) this.#socket.send(JSON.stringify({ type: 'CloseStream' }))
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000))
    await Promise.race([this.#closed, timeout])
    if (this.#socket.readyState !== WebSocket.CLOSED) this.#socket.close()
  }
}

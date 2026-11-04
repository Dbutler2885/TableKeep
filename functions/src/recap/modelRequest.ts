/**
 * Posting a request to OpenAI's Responses API and waiting, possibly for
 * minutes, for the answer.
 *
 * The Responses API sends nothing, not even headers, until a non-streaming
 * answer is complete, and a high-effort recap of a long session can take more
 * than five minutes. Node's built-in fetch gives up after 300 seconds without
 * headers or body data, whatever its abort signal allows, so the request goes
 * through undici's fetch with a dispatcher whose own limits are the caller's
 * timeout as well.
 *
 * undici is passed in rather than imported, so this module loads, and is
 * unit-tested, without the Cloud Functions package's dependencies installed.
 */
import type { Agent, fetch } from 'undici'

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

/** The two pieces of undici the request needs. */
export type Undici = { Agent: typeof Agent; fetch: typeof fetch }

export type ResponsesPostOptions = {
  apiKey: string
  endpoint: string
  /** The longest the whole request may take, which also bounds each wait for headers and for body data. */
  timeoutMs: number
}

/** Returns a function that posts a request and resolves to the parsed JSON answer. */
export function postToResponsesApi<Request, Response>(
  undici: Undici,
  { apiKey, endpoint, timeoutMs }: ResponsesPostOptions,
): (request: Request) => Promise<Response> {
  const dispatcher = new undici.Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs })
  return async (request) => {
    const response = await undici.fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher,
    })
    if (!response.ok) throw new Error(`The model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`)
    return (await response.json()) as Response
  }
}

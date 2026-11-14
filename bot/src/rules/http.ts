/**
 * Posting a JSON request to a model's API with a key, and reading the JSON it
 * answers with. A failure says which service failed and how, and never
 * carries the key: neither the error from a failed connection, which can hold
 * the request, nor the body of a refusal, which can name part of the key.
 */
export type PostJson = {
  /** The service's name, for errors. */
  service: string
  url: string
  apiKey: string
  body: unknown
  timeoutMs: number
  fetch?: typeof fetch
}

function unreachable(service: string, error: unknown): Error {
  const why = (error as Error | null)?.name === 'TimeoutError' ? 'no answer in time' : 'connection failed'
  return new Error(`${service} could not be reached (${why}).`)
}

async function refused(service: string, response: Response): Promise<Error> {
  const keyRefused = response.status === 401 || response.status === 403
  const detail = keyRefused ? '' : (await response.text().catch(() => '')).slice(0, 300)
  return new Error(`${service} answered ${response.status}${detail ? `: ${detail}` : ''}`)
}

export async function postJson({ service, url, apiKey, body, timeoutMs, fetch: request = fetch }: PostJson): Promise<unknown> {
  let response: Response
  try {
    response = await request(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw unreachable(service, error)
  }
  if (!response.ok) throw await refused(service, response)
  return response.json()
}

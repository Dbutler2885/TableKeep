/**
 * How the recap's model request is put together: the undici dispatcher whose
 * limits match the caller's timeout, and what is posted and returned.
 *
 * undici is replaced by stand-ins here. `callOpenAi.slow.test.ts` sends the
 * real request to a real server that is slower than Node's 300-second limits.
 */
import { describe, expect, it } from 'vitest'
import {
  OPENAI_RESPONSES_URL,
  postToResponsesApi,
  type Undici,
} from '../../../functions/src/recap/modelRequest'

type FetchCall = { url: string; init: RequestInit & { dispatcher?: unknown } }

/** Stand-ins for undici's Agent and fetch that record what they were given. */
function fakeUndici(answer: { ok: boolean; status?: number; body: string }) {
  const agents: { options: unknown }[] = []
  const calls: FetchCall[] = []
  class FakeAgent {
    options: unknown
    constructor(options: unknown) {
      this.options = options
      agents.push(this)
    }
  }
  const fakeFetch = async (url: string, init: FetchCall['init']) => {
    calls.push({ url, init })
    return {
      ok: answer.ok,
      status: answer.status ?? 200,
      text: async () => answer.body,
      json: async () => JSON.parse(answer.body) as unknown,
    }
  }
  return { undici: { Agent: FakeAgent, fetch: fakeFetch } as unknown as Undici, agents, calls }
}

const options = { apiKey: 'test-key', endpoint: 'http://127.0.0.1:1/v1/responses', timeoutMs: 480_000 }

describe('postToResponsesApi', () => {
  it('waits for headers and for body data as long as the whole request may take', () => {
    const { undici, agents } = fakeUndici({ ok: true, body: '{}' })

    postToResponsesApi(undici, options)

    expect(agents.map((agent) => agent.options)).toEqual([{ headersTimeout: 480_000, bodyTimeout: 480_000 }])
  })

  it('posts the request as JSON through that dispatcher and returns the parsed answer', async () => {
    const { undici, agents, calls } = fakeUndici({ ok: true, body: '{"id":"resp_1","output":[]}' })
    const post = postToResponsesApi<{ model: string }, { id: string }>(undici, options)

    const first = await post({ model: 'gpt-test' })
    await post({ model: 'gpt-test-2' })

    expect(first).toEqual({ id: 'resp_1', output: [] })
    expect(agents).toHaveLength(1)
    expect(calls).toHaveLength(2)
    const [{ url, init }] = calls
    expect(url).toBe(options.endpoint)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ authorization: 'Bearer test-key', 'content-type': 'application/json' })
    expect(init.body).toBe('{"model":"gpt-test"}')
    expect(init.dispatcher).toBe(agents[0])
    expect(calls[1]!.init.dispatcher).toBe(agents[0])
  })

  it('aborts the request once the timeout has passed', async () => {
    const { undici, calls } = fakeUndici({ ok: true, body: '{}' })

    await postToResponsesApi(undici, { ...options, timeoutMs: 20 })({})
    const signal = calls[0]!.init.signal!

    expect(signal.aborted).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(signal.aborted).toBe(true)
  })

  it('reports a failed request with its status and the start of its body', async () => {
    const body = `Rate limited. ${'x'.repeat(600)}`
    const { undici } = fakeUndici({ ok: false, status: 429, body })

    const failure = postToResponsesApi(undici, options)({})

    await expect(failure).rejects.toThrow(`The model request failed (429): ${body.slice(0, 500)}`)
    await expect(failure).rejects.not.toThrow(body.slice(0, 501))
  })

  it("points at OpenAI's Responses API by default", () => {
    expect(OPENAI_RESPONSES_URL).toBe('https://api.openai.com/v1/responses')
  })
})

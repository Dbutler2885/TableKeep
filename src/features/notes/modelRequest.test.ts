/**
 * How the recap's model request is put together: the undici dispatcher whose
 * limits match the caller's timeout, and what is posted and returned.
 *
 * `postToResponsesApi` is given stand-ins for undici, and `callOpenAi` sends a
 * real request to a quick local server. `callOpenAi.slow.test.ts` sends it to
 * one slower than Node's 300-second limits.
 *
 * Every case runs twice: against the TypeScript source, and against the
 * compiled `functions/lib` file that is committed and deployed as it is, so a
 * stale build fails here too.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, type TestContext } from 'vitest'
import * as compiled from '../../../functions/lib/recap/modelRequest.js'
import * as source from '../../../functions/src/recap/modelRequest'
import type { Undici } from '../../../functions/src/recap/modelRequest'

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

type Received = { method?: string; authorization?: string; contentType?: string; body: string }

/** Starts a local server for one test, closed with any connection still open when the test ends. */
async function listen(onTestFinished: TestContext['onTestFinished'], handle: http.RequestListener): Promise<string> {
  const server = http.createServer(handle)
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/responses`
}

/** A server that records the request it gets and answers at once. */
async function answeringServer(onTestFinished: TestContext['onTestFinished'], status: number, body: string) {
  const received: Received[] = []
  const endpoint = await listen(onTestFinished, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        method: req.method,
        authorization: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      })
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(body)
    })
  })
  return { endpoint, received }
}

describe.each([
  ['source', source],
  ['compiled', compiled as typeof source],
])('postToResponsesApi (%s)', (_build, { OPENAI_RESPONSES_URL, postToResponsesApi }) => {
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

describe.each([
  ['source', source],
  ['compiled', compiled as typeof source],
])('callOpenAi (%s)', (_build, { callOpenAi }) => {
  it('posts the recap request with the API key and returns the parsed answer', async ({ onTestFinished }) => {
    const { endpoint, received } = await answeringServer(onTestFinished, 200, '{"id":"resp_local","output":[]}')

    const response = await callOpenAi('test-key', { endpoint, timeoutMs: 5_000 })({ model: 'gpt-test' } as never)

    expect(response).toEqual({ id: 'resp_local', output: [] })
    expect(received).toEqual([
      { method: 'POST', authorization: 'Bearer test-key', contentType: 'application/json', body: '{"model":"gpt-test"}' },
    ])
  })

  it('reports an error answer with its status', async ({ onTestFinished }) => {
    const { endpoint } = await answeringServer(onTestFinished, 500, 'server trouble')

    await expect(callOpenAi('test-key', { endpoint, timeoutMs: 5_000 })({} as never)).rejects.toThrow(
      'The model request failed (500): server trouble',
    )
  })

  it('gives up at the timeout it was given', async ({ onTestFinished }) => {
    const endpoint = await listen(onTestFinished, (req) => {
      req.resume()
    })
    const startedAt = Date.now()

    await expect(callOpenAi('test-key', { endpoint, timeoutMs: 200 })({} as never)).rejects.toThrow()

    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })
})

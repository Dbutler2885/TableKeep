/**
 * The recap's model request, run for real against a local server that answers
 * slowly, the way OpenAI's Responses API does for a long high-effort recap.
 *
 * Node's fetch stops waiting after 300 seconds without response headers, or
 * 300 seconds without body data, whatever timeout the caller asked for. A
 * non-streaming Responses call sends nothing until the whole answer is ready,
 * so a recap that took longer than five minutes failed with
 * `UND_ERR_HEADERS_TIMEOUT`. Only a real socket exercises those timers, which
 * is why this suite waits more than five minutes and is not part of `npm test`.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, type TestContext } from 'vitest'
import { callOpenAi } from '../../../functions/src/recap/modelRequest'
import type { RecapModelRequest } from '../../../functions/src/recap/writeRecap'

/** Just past the 300 seconds at which Node's own fetch gives up. */
const SLOW_MS = 310_000
/** What the deployed trigger allows the model. */
const MODEL_TIMEOUT_MS = 8 * 60 * 1000

const request = { model: 'test-model' } as RecapModelRequest

/**
 * Starts a server on a free port for one test and returns the URL the request
 * should go to. The tests run concurrently, so each closes only its own server,
 * dropping any connection a request abandoned.
 */
async function listen(onTestFinished: TestContext['onTestFinished'], handle: http.RequestListener): Promise<string> {
  const server = http.createServer(handle)
  onTestFinished(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/responses`
}

describe.concurrent('callOpenAi against a slow server', () => {
  it(
    'waits longer than five minutes for the response headers',
    async ({ onTestFinished }) => {
      const endpoint = await listen(onTestFinished, (req, res) => {
        req.resume()
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ id: 'resp_slow_headers', output: [] }))
        }, SLOW_MS)
      })
      const startedAt = Date.now()

      const response = await callOpenAi('test-key', { endpoint, timeoutMs: MODEL_TIMEOUT_MS })(request)

      expect(response.id).toBe('resp_slow_headers')
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(SLOW_MS)
    },
    SLOW_MS + 60_000,
  )

  it(
    'waits longer than five minutes for the response body',
    async ({ onTestFinished }) => {
      const endpoint = await listen(onTestFinished, (req, res) => {
        req.resume()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.flushHeaders()
        setTimeout(() => res.end(JSON.stringify({ id: 'resp_slow_body', output: [] })), SLOW_MS)
      })
      const startedAt = Date.now()

      const response = await callOpenAi('test-key', { endpoint, timeoutMs: MODEL_TIMEOUT_MS })(request)

      expect(response.id).toBe('resp_slow_body')
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(SLOW_MS)
    },
    SLOW_MS + 60_000,
  )

  it('still gives up at the timeout it was given', async ({ onTestFinished }) => {
    const endpoint = await listen(onTestFinished, (req) => {
      req.resume()
    })
    const startedAt = Date.now()

    await expect(callOpenAi('test-key', { endpoint, timeoutMs: 2_000 })(request)).rejects.toThrow()

    expect(Date.now() - startedAt).toBeLessThan(10_000)
  })
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { postJson } from '../src/rules/http.ts'

const KEY = 'sk-secret-key'

/** Posts with a stand-in `fetch`, and resolves to what it answered or the error's message. */
async function post(request: (url: string, init: RequestInit) => Promise<Response>) {
  const sent: RequestInit[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push(init)
    return request(url, init)
  }) as unknown as typeof globalThis.fetch
  const outcome: { body?: unknown; error?: string } = await postJson({
    service: 'OpenAI',
    url: 'https://example.test/v1',
    apiKey: KEY,
    body: { asked: 1 },
    timeoutMs: 1_000,
    fetch,
  }).then(
    (body) => ({ body }),
    (error: Error) => ({ error: error.message }),
  )
  return { ...outcome, sent }
}

test('a request is posted as JSON with the key, and the JSON answer comes back', async () => {
  const { body, sent } = await post(async () => new Response('{"ok":true}'))
  assert.deepEqual(body, { ok: true })
  assert.equal(sent[0]!.method, 'POST')
  assert.equal(sent[0]!.body, '{"asked":1}')
  assert.deepEqual(sent[0]!.headers, { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' })
})

test('a service that cannot be reached is named, with how, and nothing of the request', async () => {
  const timedOut = await post(async () => {
    throw Object.assign(new Error(`timed out sending Bearer ${KEY}`), { name: 'TimeoutError' })
  })
  assert.equal(timedOut.error, 'OpenAI could not be reached (no answer in time).')

  const failed = await post(async () => {
    throw new TypeError(`fetch failed for Bearer ${KEY}`)
  })
  assert.equal(failed.error, 'OpenAI could not be reached (connection failed).')

  const odd = await post(async () => {
    throw null
  })
  assert.equal(odd.error, 'OpenAI could not be reached (connection failed).')
})

test('a refused key is reported without the reply, which can name part of it', async () => {
  for (const status of [401, 403]) {
    const { error } = await post(async () => new Response('{"error":"Incorrect API key provided: sk-secr****"}', { status }))
    assert.equal(error, `OpenAI answered ${status}`)
  }
})

test('any other failure is reported with the start of what the service said, if anything', async () => {
  const busy = await post(async () => new Response(`overloaded ${'x'.repeat(500)}`, { status: 503 }))
  assert.equal(busy.error, `OpenAI answered 503: overloaded ${'x'.repeat(289)}`)

  const silent = await post(async () => new Response('', { status: 500 }))
  assert.equal(silent.error, 'OpenAI answered 500')

  const unreadable = await post(async () => {
    const response = new Response('', { status: 502 })
    Object.defineProperty(response, 'text', {
      value: async () => {
        throw new Error('the body was lost')
      },
    })
    return response
  })
  assert.equal(unreadable.error, 'OpenAI answered 502')
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const cors = JSON.parse(readFileSync(resolve(process.cwd(), 'storage.cors.json'), 'utf8'))

describe('production Storage CORS', () => {
  it('allows only the production app origin and required SDK methods', () => {
    expect(cors).toEqual([
      {
        origin: ['https://tablekeep.vercel.app'],
        method: ['GET', 'POST'],
        responseHeader: [
          'Authorization',
          'Content-Type',
          'X-Firebase-GMPID',
          'X-Firebase-Storage-Version',
          'X-Goog-Upload-Protocol',
        ],
        maxAgeSeconds: 3600,
      },
    ])
  })

  it('covers authenticated SDK reads for every existing portrait and token path', () => {
    const [policy] = cors

    expect(policy.method).toContain('GET')
    expect(policy.responseHeader).toEqual(expect.arrayContaining([
      'Authorization',
      'X-Firebase-GMPID',
      'X-Firebase-Storage-Version',
    ]))
  })

  it('covers multipart SDK requests for new entity image uploads', () => {
    const [policy] = cors

    expect(policy.method).toContain('POST')
    expect(policy.responseHeader).toEqual(expect.arrayContaining([
      'Authorization',
      'Content-Type',
      'X-Goog-Upload-Protocol',
    ]))
  })
})

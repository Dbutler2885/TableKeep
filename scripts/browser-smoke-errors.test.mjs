import { describe, expect, it } from 'vitest'
import { isExpectedFirestoreEmulatorChannelError } from './browser-smoke-errors.mjs'

const bareBadRequest = 'Failed to load resource: the server responded with a status of 400 (Bad Request)'
const emulatorUrl = 'http://127.0.0.1:8080'

describe('browser smoke console error classification', () => {
  it.each(['Listen', 'Write'])('ignores the local Firestore emulator %s channel 400', (channel) => {
    expect(isExpectedFirestoreEmulatorChannelError({
      text: bareBadRequest,
      url: `${emulatorUrl}/google.firestore.v1.Firestore/${channel}/channel?VER=8&RID=rpc`,
    })).toBe(true)
  })

  it.each([
    {
      name: 'production Firestore URL',
      text: bareBadRequest,
      url: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel?VER=8',
    },
    {
      name: 'non-400 response',
      text: 'Failed to load resource: the server responded with a status of 403 (Forbidden)',
      url: `${emulatorUrl}/google.firestore.v1.Firestore/Write/channel?VER=8`,
    },
    {
      name: 'unrelated emulator endpoint',
      text: bareBadRequest,
      url: `${emulatorUrl}/v1/projects/homeboyshouse-dev/databases/(default)/documents`,
    },
    {
      name: 'endpoint with an extra path suffix',
      text: bareBadRequest,
      url: `${emulatorUrl}/google.firestore.v1.Firestore/Write/channel/unrelated?VER=8`,
    },
    {
      name: 'other console error',
      text: 'Unhandled application exception',
      url: '',
    },
  ])('keeps $name fatal', ({ text, url }) => {
    expect(isExpectedFirestoreEmulatorChannelError({ text, url })).toBe(false)
  })
})

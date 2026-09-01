import { describe, expect, it } from 'vitest'
import { assertSafeFirebaseRuntime } from './runtimeSafety'

describe('Firebase runtime safety', () => {
  it('refuses a localhost browser connected to production Firebase', () => {
    expect(() => assertSafeFirebaseRuntime({
      hostname: 'localhost',
      projectId: 'homeboyshouse-dev',
      useFirebaseEmulators: false,
    })).toThrow('VITE_USE_FIREBASE_EMULATORS=true')
  })

  it.each(['127.0.0.1', '::1', '[::1]'])('also protects the loopback hostname %s', (hostname) => {
    expect(() => assertSafeFirebaseRuntime({
      hostname,
      projectId: 'homeboyshouse-dev',
      useFirebaseEmulators: false,
    })).toThrow('Refusing to connect')
  })

  it('allows a localhost browser when every Firebase SDK uses emulators', () => {
    expect(() => assertSafeFirebaseRuntime({
      hostname: 'localhost',
      projectId: 'homeboyshouse-dev',
      useFirebaseEmulators: true,
    })).not.toThrow()
  })

  it('allows the reviewed production origin to use production Firebase', () => {
    expect(() => assertSafeFirebaseRuntime({
      hostname: 'tablekeep.vercel.app',
      projectId: 'homeboyshouse-dev',
      useFirebaseEmulators: false,
    })).not.toThrow()
  })
})

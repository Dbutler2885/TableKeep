import { describe, expect, it } from 'vitest'
import { resolveDemoSandboxOffered } from './demoAvailability'

describe('when the sign-in screen offers the hosted sandbox', () => {
  it('offers it in any build that is not pointed at the emulators', () => {
    expect(resolveDemoSandboxOffered({}, false)).toBe(true)
    expect(resolveDemoSandboxOffered({ VITE_DEMO_SANDBOX: 'false' }, false)).toBe(true)
  })

  it('hides it against the emulators by default', () => {
    // `npm run demo` starts no functions emulator, and `browser-smoke.mjs`
    // asserts against the ordinary sign-in screen. Neither can serve the link.
    expect(resolveDemoSandboxOffered({}, true)).toBe(false)
    expect(resolveDemoSandboxOffered({ VITE_DEMO_SANDBOX: '' }, true)).toBe(false)
  })

  it('lets the local sandbox rig opt back in', () => {
    expect(resolveDemoSandboxOffered({ VITE_DEMO_SANDBOX: 'true' }, true)).toBe(true)
    expect(resolveDemoSandboxOffered({ VITE_DEMO_SANDBOX: ' true ' }, true)).toBe(true)
  })

  it('takes only the exact opt-in string, not any truthy value', () => {
    expect(resolveDemoSandboxOffered({ VITE_DEMO_SANDBOX: '1' }, true)).toBe(false)
    expect(resolveDemoSandboxOffered({ VITE_DEMO_SANDBOX: true }, true)).toBe(false)
  })
})

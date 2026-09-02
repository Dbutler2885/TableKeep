import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const exampleEnv = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')

describe('local Firebase boundary', () => {
  it('starts the default development server inside the Firebase emulators', () => {
    expect(packageJson.scripts.dev).toBe(
      'VITE_USE_FIREBASE_EMULATORS=true firebase emulators:exec --only auth,firestore,storage "vite"',
    )
  })

  it('builds and serves local previews against the Firebase emulators', () => {
    expect(packageJson.scripts.preview).toBe(
      'VITE_USE_FIREBASE_EMULATORS=true npm run build && VITE_USE_FIREBASE_EMULATORS=true firebase emulators:exec --only auth,firestore,storage "vite preview"',
    )
  })

  it('makes emulator routing the documented local environment default', () => {
    expect(exampleEnv).toMatch(/^VITE_USE_FIREBASE_EMULATORS=true$/m)
    expect(exampleEnv).not.toMatch(/^VITE_USE_FIREBASE_EMULATORS=false$/m)
  })
})

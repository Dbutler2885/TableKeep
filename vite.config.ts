import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { testFirebaseEnv } from './vitest.firebaseEnv'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default: almost every suite here is pure logic. The few component
    // suites opt in per file with a `@vitest-environment jsdom` docblock, which
    // keeps the DOM cost off the rest of the run.
    environment: 'node',
    // `scripts/` is in scope too: the demo harness is plain `.mjs` with no
    // typecheck gate behind it, so its suites are the only thing holding its
    // shape.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    exclude: ['src/**/*.emulator.test.ts'],
    // The jsdom suites mount whole tabs and run role queries over them. Under
    // coverage on a loaded machine they ran past Vitest's 5 second default and
    // failed with no assertion failing, one suite after another.
    testTimeout: 30_000,
    env: testFirebaseEnv,
  },
})

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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/**/*.emulator.test.ts'],
    env: testFirebaseEnv,
  },
})

import { defineConfig } from 'vitest/config'
import baseConfig from './vite.config'

// The pure combat engine only: no UI, Firebase or emulator suites.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['src/features/lubec/combat/engine/**/*.test.ts'],
  },
})

import { defineConfig } from 'vitest/config'

// Suites that have to wait out a real timer against a real socket, such as
// Node's 300-second fetch limits. They take minutes, so they are kept out of
// `npm test` and run on their own with `npm run test:slow`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.slow.test.ts'],
  },
})

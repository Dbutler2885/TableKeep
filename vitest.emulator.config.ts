import { defineConfig } from 'vitest/config'
import { testFirebaseEnv } from './vitest.firebaseEnv'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.emulator.test.ts'],
    // Every suite here talks to one shared emulator instance, and suites that
    // exercise Storage Rules must all run under the emulator's own project id
    // (see the projectId comment in the storage suites). Running the files in
    // parallel therefore lets one suite's `cleanup()` unload the ruleset another
    // is still using, and one suite's `clearFirestore()` wipe another's seed.
    fileParallelism: false,
    env: testFirebaseEnv,
  },
})

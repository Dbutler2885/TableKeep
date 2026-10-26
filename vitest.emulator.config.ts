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
    // Every test here waits on a Java emulator, which slows down sharply when
    // the machine is busy - another worktree's emulators, a browser smoke, a
    // CI runner's two cores. Vitest's 5 seconds then fails tests that are only
    // slow, not stuck.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: testFirebaseEnv,
  },
})

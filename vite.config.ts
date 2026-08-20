import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { testFirebaseEnv } from './vitest.firebaseEnv'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.emulator.test.ts'],
    env: testFirebaseEnv,
  },
})

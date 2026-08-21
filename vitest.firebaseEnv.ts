/**
 * Placeholder Firebase web config for test runs.
 *
 * Tests never touch a real project - they either exercise pure logic or drive
 * the emulator through `@firebase/rules-unit-testing`. But some test modules
 * transitively import `src/firebase`, which builds the real SDK singleton at
 * import time and throws `auth/invalid-api-key` without a config. Feeding these
 * placeholders to Vitest keeps `npm test` and `npm run test:emulator` working
 * from a clean checkout that has no `.env`.
 */
export const testFirebaseEnv = {
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-homeboyshouse.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-homeboyshouse',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-homeboyshouse.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
}

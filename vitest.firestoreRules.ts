import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The Firestore rules every emulator suite loads. `firestore.rules` itself,
// unless `FIRESTORE_RULES_FILE` names another file, which is how
// `npm run rehearse:floors` runs the suites with every floor raised.
export function firestoreRules(env: NodeJS.ProcessEnv = process.env): string {
  return readFileSync(resolve(process.cwd(), env.FIRESTORE_RULES_FILE || 'firestore.rules'), 'utf8')
}

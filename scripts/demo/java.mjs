// Finding a JDK the Firebase emulators will actually start on.
//
// The Firestore and Storage emulators are Java processes, and firebase-tools
// refuses to run them on anything older than 21 with a message that does not say
// which JDK it found. Both demo entry points resolve one up front rather than
// letting that surface as a confusing emulator failure, so the logic lives here
// instead of in either of them.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const MINIMUM_JAVA_MAJOR = 21

// Homebrew installs a JDK without putting it on the PATH, which is the single
// most common reason `npm run demo` fails on a Mac that is otherwise ready.
const FALLBACK_JAVA_HOMES = [
  '/opt/homebrew/opt/openjdk@21',
  '/usr/local/opt/openjdk@21',
  '/opt/homebrew/opt/openjdk',
  '/usr/local/opt/openjdk',
]

/** Reads the major version from a `java` binary, or null if it will not run. */
function javaMajorVersion(javaBinary) {
  const result = spawnSync(javaBinary, ['-version'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return null

  // `java -version` writes to stderr, in the form `openjdk version "21.0.5"`.
  const major = Number(/version "(\d+)/.exec(result.stderr ?? '')?.[1])
  return Number.isFinite(major) ? major : null
}

/**
 * The Firestore and Storage emulators are Java processes, and firebase-tools
 * refuses to start them on anything older than 21 with a message that does not
 * say which JDK it found. Resolve one here, before anything is started, and
 * return the PATH the emulator child should run with.
 */
export function resolveJavaPath() {
  const onPath = javaMajorVersion('java')

  if (onPath !== null && onPath >= MINIMUM_JAVA_MAJOR) {
    return process.env.PATH
  }

  for (const javaHome of FALLBACK_JAVA_HOMES) {
    const binDir = path.join(javaHome, 'bin')
    const major = javaMajorVersion(path.join(binDir, 'java'))

    if (major !== null && major >= MINIMUM_JAVA_MAJOR) {
      console.log(`Using Java ${major} from ${javaHome} (the "java" on your PATH is not usable).`)
      return `${binDir}${path.delimiter}${process.env.PATH ?? ''}`
    }
  }

  throw new Error(
    (onPath === null
      ? 'No Java runtime found on PATH, and no Homebrew JDK in the usual places.'
      : `Found Java ${onPath} on PATH, and no newer JDK in the usual places.`)
    + `\nThe Firestore and Storage emulators need Java ${MINIMUM_JAVA_MAJOR} or newer.`
    + `\nOn macOS: brew install openjdk@${MINIMUM_JAVA_MAJOR}`,
  )
}

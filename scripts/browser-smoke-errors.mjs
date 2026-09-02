export const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8080'

const bareBadRequest = 'Failed to load resource: the server responded with a status of 400 (Bad Request)'
const retryableChannelPaths = new Set([
  '/google.firestore.v1.Firestore/Listen/channel',
  '/google.firestore.v1.Firestore/Write/channel',
])

export function isExpectedFirestoreEmulatorChannelError({ text, url }) {
  if (text !== bareBadRequest) return false

  try {
    const endpoint = new URL(url)
    return endpoint.origin === FIRESTORE_EMULATOR_URL
      && retryableChannelPaths.has(endpoint.pathname)
  } catch {
    return false
  }
}

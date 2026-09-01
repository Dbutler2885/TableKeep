export function assertSafeFirebaseRuntime({
  hostname,
  projectId,
  useFirebaseEmulators,
}: {
  hostname: string
  projectId?: string
  useFirebaseEmulators: boolean
}): void {
  const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (!loopbackHostnames.has(hostname) || useFirebaseEmulators) return

  throw new Error(
    `[firebase] Refusing to connect localhost to Firebase project "${projectId || 'unknown'}". `
    + 'Set VITE_USE_FIREBASE_EMULATORS=true and start the app with `npm run dev`.',
  )
}

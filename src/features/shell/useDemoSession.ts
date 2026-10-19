import { useCallback, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { forgetDemoExpiry, readDemoExpiry } from '../demo/demoSandboxState'

export function useDemoSession(isDemoVisitor: boolean, userId: string) {
  const handleSignOut = useCallback(() => {
    forgetDemoExpiry()
    void signOut(auth)
  }, [])

  // Read once per mount rather than per render: the value is written by the
  // demo entry screen and never changes for the life of the sandbox.
  const demoExpiresAt = useMemo(
    () => (isDemoVisitor ? readDemoExpiry(userId) : null),
    [isDemoVisitor, userId],
  )

  return { handleSignOut, demoExpiresAt }
}

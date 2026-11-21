import { useEffect } from 'react'
import { disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore'
import { useDocumentVisibility } from './useDocumentVisibility'

/** How long a hidden page keeps its connection, so a quick look at another tab, or a save still in flight, is not cut off. */
export const FIRESTORE_HIDDEN_GRACE_MS = 60_000

type Network = { disable: (firestore: Firestore) => Promise<void>; enable: (firestore: Firestore) => Promise<void> }

const firestoreNetwork: Network = { disable: disableNetwork, enable: enableNetwork }

/**
 * Every listener in the page stops once it has been hidden for a minute, and starts again when it is shown.
 * One switch for the whole client, so no listener added later can keep reading in a background tab. Firestore
 * resumes each listener from where it stopped, so coming back within half an hour reads only what changed.
 */
export function useFirestorePausedWhileHidden(firestore: Firestore, network: Network = firestoreNetwork) {
  const visible = useDocumentVisibility()
  useEffect(() => {
    if (visible) {
      void network.enable(firestore)
      return undefined
    }
    const timer = window.setTimeout(() => { void network.disable(firestore) }, FIRESTORE_HIDDEN_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [visible, firestore, network])
}

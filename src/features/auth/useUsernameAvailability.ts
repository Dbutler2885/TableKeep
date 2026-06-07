import { useEffect, useState } from 'react'
import { doc, getDoc, type Firestore } from 'firebase/firestore'
import { db } from '../../firebase'
import { isValidUsername, normalizeUsername } from './usernameRules'

export type UsernameAvailabilityStatus =
  | 'idle'
  | 'invalid'
  | 'checking'
  | 'available'
  | 'taken'

export type UsernameAvailabilityFetcher = (username: string) => Promise<boolean>

export type UsernameAvailabilityStart = {
  username: string
  status: Extract<UsernameAvailabilityStatus, 'idle' | 'invalid' | 'checking'>
}

export function getUsernameAvailabilityStart(input: string): UsernameAvailabilityStart {
  const username = normalizeUsername(input)

  if (username.length === 0) {
    return { username, status: 'idle' }
  }

  if (!isValidUsername(username)) {
    return { username, status: 'invalid' }
  }

  return { username, status: 'checking' }
}

export async function resolveUsernameAvailability(
  username: string,
  fetchUsernameExists: UsernameAvailabilityFetcher,
): Promise<Extract<UsernameAvailabilityStatus, 'available' | 'taken'>> {
  const exists = await fetchUsernameExists(username)
  return exists ? 'taken' : 'available'
}

export function makeFirestoreUsernameAvailabilityFetcher(
  firestore: Firestore,
): UsernameAvailabilityFetcher {
  return async (username: string) => {
    const snapshot = await getDoc(doc(firestore, 'usernames', username))
    return snapshot.exists()
  }
}

export function useUsernameAvailability(name: string): UsernameAvailabilityStatus {
  const start = getUsernameAvailabilityStart(name)
  const [resolvedStatus, setResolvedStatus] = useState<{
    username: string
    status: Extract<UsernameAvailabilityStatus, 'available' | 'taken'>
  } | null>(null)

  useEffect(() => {
    const effectStart = getUsernameAvailabilityStart(name)

    if (effectStart.status !== 'checking') {
      return
    }

    let isCancelled = false
    const fetchUsernameExists = makeFirestoreUsernameAvailabilityFetcher(db)

    const timeoutId = window.setTimeout(() => {
      resolveUsernameAvailability(effectStart.username, fetchUsernameExists)
        .then((nextStatus) => {
          if (!isCancelled) {
            setResolvedStatus({
              username: effectStart.username,
              status: nextStatus,
            })
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setResolvedStatus({
              username: effectStart.username,
              status: 'taken',
            })
          }
        })
    }, 300)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [name])

  if (start.status !== 'checking') {
    return start.status
  }

  return resolvedStatus?.username === start.username ? resolvedStatus.status : 'checking'
}

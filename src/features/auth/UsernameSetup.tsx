import { useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'

const USERNAME_PATTERN = /^[A-Za-z0-9_!@#$%^&*()]{7}$/
const USERNAME_PARTIAL_PATTERN = /^[A-Za-z0-9_!@#$%^&*()]*$/

type UsernameSetupProps = {
  user: User
  onComplete: (username: string) => void
}

export function UsernameSetup({ user, onComplete }: UsernameSetupProps) {
  const [usernameInput, setUsernameInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trimmedUsername = usernameInput.trim()
  const hasOnlyAllowedChars = USERNAME_PARTIAL_PATTERN.test(trimmedUsername)
  const hasExactLength = trimmedUsername.length === 7
  const isValid = hasOnlyAllowedChars && hasExactLength

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setStatus(null)
    setError(null)

    const username = trimmedUsername
    if (!USERNAME_PATTERN.test(username)) {
      setError('Use exactly 7 characters. Allowed: A-Z, a-z, 0-9, _, !@#$%^&*()')
      return
    }

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', user.uid)
        const usernameRef = doc(db, 'usernames', username)

        const [userSnap, usernameSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(usernameRef),
        ])

        const existingUsername = userSnap.exists() ? userSnap.data().username : null
        if (typeof existingUsername === 'string' && existingUsername.length > 0 && existingUsername !== username) {
          throw new Error('Username is already set for this account.')
        }

        if (usernameSnap.exists()) {
          const ownerUid = usernameSnap.data().uid
          if (ownerUid !== user.uid) {
            throw new Error('That username is already taken.')
          }
        } else {
          tx.set(usernameRef, {
            uid: user.uid,
            createdAt: serverTimestamp(),
          })
        }

        tx.set(
          userRef,
          {
            username,
            usernameSetAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      })

      setStatus('Username saved.')
      onComplete(username)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save username.'
      setError(message)
    }
  }

  return (
    <section className="panel">
      <h2>Pick Username</h2>

      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Username
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            maxLength={7}
            required
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder="example1"
          />
        </label>
        <p className="username-helper" aria-live="polite">
          <span className={hasExactLength ? 'username-count-met' : 'username-count-unmet'}>
            {trimmedUsername.length} of 7
          </span>
          {' '}Allowed: A-Z, a-z, 0-9, _, !@#$%^&*()
        </p>
        <button type="submit" disabled={!isValid}>Save Username</button>
      </form>

      {status ? <p className="success">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  )
}

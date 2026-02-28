import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth'
import { auth } from '../../firebase'

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runAction = async (fn: () => Promise<unknown>) => {
    setError(null)
    setStatus(null)
    try {
      await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    }
  }

  const handlePasswordSignIn = async (event: FormEvent) => {
    event.preventDefault()
    await runAction(async () => {
      await signInWithEmailAndPassword(auth, email, password)
      setStatus('Signed in.')
    })
  }

  const handlePasswordSignUp = async () => {
    await runAction(async () => {
      await createUserWithEmailAndPassword(auth, email, password)
      setStatus('Account created.')
    })
  }

  const handleGoogleSignIn = async () => {
    await runAction(async () => {
      const provider = new GoogleAuthProvider()
      try {
        await signInWithPopup(auth, provider)
        setStatus('Signed in with Google.')
      } catch (err: unknown) {
        const code = typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : ''

        if (code.includes('popup-blocked') || code.includes('popup-closed-by-user')) {
          await signInWithRedirect(auth, provider)
          setStatus('Redirecting to Google sign-in...')
          return
        }

        throw err
      }
    })
  }

  return (
    <section className="panel">
      <h2>Sign In</h2>

      <form onSubmit={handlePasswordSignIn} className="stack">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>

        <button type="submit">Sign In with Email</button>
      </form>

      <div className="row">
        <button type="button" onClick={handlePasswordSignUp}>
          Create Account
        </button>
        <button type="button" onClick={handleGoogleSignIn}>
          Sign In with Google
        </button>
      </div>

      {status ? <p className="success">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  )
}

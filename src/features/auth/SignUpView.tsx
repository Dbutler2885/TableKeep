import { useState } from 'react'
import type { FormEvent } from 'react'
import { BrandWordmark } from '../common/BrandWordmark'
import { GoogleMark } from './GoogleMark'
import { useUsernameAvailability } from './useUsernameAvailability'
import {
  USERNAME_ALLOWED_CHARACTERS,
  USERNAME_LENGTH,
  normalizeUsername,
} from './usernameRules'

type Props = {
  onPasswordSubmit: (email: string, password: string, username: string) => Promise<unknown> | unknown
  onGoogle: () => Promise<unknown> | unknown
  onSwitchToSignIn: () => void
}

export function SignUpView({ onPasswordSubmit, onGoogle, onSwitchToSignIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [username, setUsername] = useState('')
  const usernameAvailability = useUsernameAvailability(username)
  const normalizedUsername = normalizeUsername(username)

  const passwordsMatch = password.length > 0 && password === confirm
  const canSubmit = (
    email.length > 0
    && password.length >= 8
    && passwordsMatch
    && usernameAvailability === 'available'
  )

  const usernameStatusText = {
    idle: `${USERNAME_LENGTH} characters. Allowed: ${USERNAME_ALLOWED_CHARACTERS}`,
    invalid: `Use exactly ${USERNAME_LENGTH} allowed characters.`,
    checking: 'Checking availability...',
    available: 'Username is available.',
    taken: 'Username is already taken.',
  }[usernameAvailability]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    await onPasswordSubmit(email, password, normalizedUsername)
  }

  return (
    <>
      <div className="tk-auth-runhead">
        <span>№ 02 · Create account</span>
        <span className="tk-auth-runhead-rule" aria-hidden />
      </div>

      <header className="tk-auth-masthead">
        <h1 className="tk-auth-title"><BrandWordmark /></h1>
        <p className="tk-auth-subtitle">pull up a chair</p>
      </header>

      <div className="tk-auth-hairline" aria-hidden />

      <button type="button" className="tk-auth-google" onClick={onGoogle}>
        <GoogleMark />
        Continue with Google
      </button>

      <div className="tk-auth-fleuron" aria-hidden>
        <span className="tk-auth-fleuron-rule" />
        <span className="tk-auth-fleuron-mark">or</span>
        <span className="tk-auth-fleuron-rule" />
      </div>

      <form className="tk-auth-form" onSubmit={submit}>
        <label className="tk-auth-field">
          <span className="tk-auth-label">Email</span>
          <input
            className="tk-auth-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="tk-auth-field">
          <span className="tk-auth-label">Username</span>
          <input
            className="tk-auth-input"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={USERNAME_LENGTH}
            placeholder="example1"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <span
            className={`tk-auth-field-hint tk-auth-username-status is-${usernameAvailability}`}
            aria-live="polite"
          >
            {usernameStatusText}
          </span>
        </label>

        <label className="tk-auth-field">
          <span className="tk-auth-label">Password</span>
          <input
            className="tk-auth-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>

        <label className="tk-auth-field">
          <span className="tk-auth-label">Confirm password</span>
          <input
            className="tk-auth-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
            minLength={8}
          />
          {confirm.length > 0 && !passwordsMatch ? (
            <span className="tk-auth-field-hint" style={{ color: 'var(--danger)' }}>
              Passwords don&rsquo;t match.
            </span>
          ) : null}
        </label>

        <button type="submit" className="tk-auth-submit" disabled={!canSubmit}>
          Create account
        </button>
      </form>

      <p className="tk-auth-meta">
        Already have one?{' '}
        <button type="button" className="tk-auth-link" onClick={onSwitchToSignIn}>
          Sign in
        </button>
      </p>
    </>
  )
}

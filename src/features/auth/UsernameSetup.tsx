import { useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { db } from '../../firebase'
import { BrandWordmark } from '../common/BrandWordmark'
import { claimUsername } from './claimUsername'
import { getAuthErrorMessage } from './authErrorMessages'
import { useUsernameAvailability } from './useUsernameAvailability'
import {
  USERNAME_ALLOWED_CHARACTERS,
  USERNAME_LENGTH,
  normalizeUsername,
} from './usernameRules'
import './AuthPanel.css'

type UsernameSetupProps = {
  user: User
  onComplete: (username: string) => void
}

/**
 * Post-auth username step. Reached by:
 *   • every Google sign-in whose user doc has no `username` yet
 *   • the rare email/password sign-up that lost the submit-time username race
 *
 * Visually wears the same editorial-ledger card as the sign-in panel so the
 * post-Google handoff feels continuous instead of dropping the user into a
 * different design system.
 */
export function UsernameSetup({ user, onComplete }: UsernameSetupProps) {
  const [usernameInput, setUsernameInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const normalized = normalizeUsername(usernameInput)
  const availability = useUsernameAvailability(usernameInput)
  const canSubmit = !submitting && availability === 'available'

  const statusText = {
    idle: `${USERNAME_LENGTH} characters. Allowed: ${USERNAME_ALLOWED_CHARACTERS}`,
    invalid: `Use exactly ${USERNAME_LENGTH} of: ${USERNAME_ALLOWED_CHARACTERS}`,
    checking: 'Checking availability…',
    available: 'Handle is available.',
    taken: 'Handle is already taken.',
  }[availability]

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await claimUsername(user.uid, normalized, db)
      onComplete(normalized)
    } catch (err) {
      setError(getAuthErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="tk-auth-page">
      <div className="tk-auth-card" role="region" aria-label="Choose a handle">
        <div className="tk-auth-runhead">
          <span>№ 04 · Choose handle</span>
          <span className="tk-auth-runhead-rule" aria-hidden />
        </div>

        <header className="tk-auth-masthead">
          <h1 className="tk-auth-title">One last thing</h1>
          <p className="tk-auth-subtitle">
            pick a handle the table will know you by
          </p>
        </header>

        <div className="tk-auth-hairline" aria-hidden />

        <form className="tk-auth-form" onSubmit={handleSubmit}>
          <label className="tk-auth-field">
            <span className="tk-auth-label">Handle</span>
            <input
              className="tk-auth-input"
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="username"
              maxLength={USERNAME_LENGTH}
              placeholder="example1"
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              required
              autoFocus
            />
            <span
              className={`tk-auth-field-hint tk-auth-username-status is-${availability}`}
              aria-live="polite"
            >
              {statusText}
            </span>
          </label>

          <button type="submit" className="tk-auth-submit" disabled={!canSubmit}>
            {submitting ? 'Saving…' : 'Save handle'}
          </button>
        </form>

        {error ? <div className="tk-auth-error">{error}</div> : null}
      </div>

      <p className="tk-auth-foot">
        <BrandWordmark className="brand-wordmark-foot" /> · est. {new Date().getFullYear()}
      </p>
    </div>
  )
}

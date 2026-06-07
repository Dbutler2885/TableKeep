import { useState } from 'react'
import type { FormEvent } from 'react'

type Props = {
  onSubmit: (email: string) => Promise<boolean> | boolean
  onSwitchToSignIn: () => void
}

export function ForgotPasswordView({ onSubmit, onSwitchToSignIn }: Props) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const didSend = await onSubmit(email)
    if (didSend) {
      setSent(true)
    }
  }

  return (
    <>
      <div className="tk-auth-runhead">
        <span>№ 03 · Reset password</span>
        <span className="tk-auth-runhead-rule" aria-hidden />
      </div>

      <header className="tk-auth-masthead">
        <h1 className="tk-auth-title">Forgot it?</h1>
        <p className="tk-auth-subtitle">we&rsquo;ll send a reset link to your inbox</p>
      </header>

      <div className="tk-auth-hairline" aria-hidden />

      {sent ? (
        <div className="tk-auth-status">
          If an account exists for <strong>{email}</strong>, a reset link is on its way.
        </div>
      ) : (
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
          <button type="submit" className="tk-auth-submit">Send reset link</button>
        </form>
      )}

      <p className="tk-auth-meta">
        <button type="button" className="tk-auth-link" onClick={onSwitchToSignIn}>
          ← Back to sign in
        </button>
      </p>
    </>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { BrandWordmark } from '../common/BrandWordmark'
import { GoogleMark } from './GoogleMark'

type Props = {
  onPasswordSubmit: (email: string, password: string) => Promise<unknown> | unknown
  onGoogle: () => Promise<unknown> | unknown
  onSwitchToSignUp: () => void
  onSwitchToForgot: () => void
}

export function SignInView({ onPasswordSubmit, onGoogle, onSwitchToSignUp, onSwitchToForgot }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onPasswordSubmit(email, password)
  }

  return (
    <>
      <div className="tk-auth-runhead">
        <span>№ 01 · Sign in</span>
        <span className="tk-auth-runhead-rule" aria-hidden />
      </div>

      <header className="tk-auth-masthead">
        <h1 className="tk-auth-title"><BrandWordmark /></h1>
        <p className="tk-auth-subtitle">a sidecar for the tabletop</p>
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
          <div className="tk-auth-field-row">
            <span className="tk-auth-label">Password</span>
            <button type="button" className="tk-auth-link tk-auth-field-hint" onClick={onSwitchToForgot}>
              Forgot it?
            </button>
          </div>
          <input
            className="tk-auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>

        <button type="submit" className="tk-auth-submit">Sign in with email</button>
      </form>

      <p className="tk-auth-meta">
        New to Table Keep?{' '}
        <button type="button" className="tk-auth-link" onClick={onSwitchToSignUp}>
          Create an account
        </button>
      </p>
    </>
  )
}

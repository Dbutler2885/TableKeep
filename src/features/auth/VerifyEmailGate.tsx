import { useEffect, useState } from 'react'
import { sendEmailVerification, signOut, type User } from 'firebase/auth'
import { auth } from '../../firebase'
import { getAuthErrorMessage } from './authErrorMessages'
import './AuthPanel.css'

const sentVerificationForSession = new Set<string>()
const RESEND_COOLDOWN_SECONDS = 30
const VERIFICATION_POLL_MS = 4000

type VerifyEmailGateProps = {
  user: User
  onVerified: () => void
}

export function VerifyEmailGate({ user, onVerified }: VerifyEmailGateProps) {
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (sentVerificationForSession.has(user.uid)) {
      return
    }

    sentVerificationForSession.add(user.uid)
    sendEmailVerification(user)
      .then(() => {
        setStatus('Verification email sent.')
      })
      .catch((err) => {
        sentVerificationForSession.delete(user.uid)
        setError(getAuthErrorMessage(err))
      })
  }, [user])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      user.reload()
        .then(() => {
          if (user.emailVerified) {
            onVerified()
          }
        })
        .catch((err) => {
          setError(getAuthErrorMessage(err))
        })
    }, VERIFICATION_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [onVerified, user])

  useEffect(() => {
    if (cooldown <= 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [cooldown])

  const resend = async () => {
    if (cooldown > 0) return

    setError(null)
    setStatus(null)
    try {
      await sendEmailVerification(user)
      sentVerificationForSession.add(user.uid)
      setStatus('Verification email resent.')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    }
  }

  const handleSignOut = () => {
    void signOut(auth)
  }

  return (
    <div className="tk-auth-page">
      <div className="tk-auth-card" role="region" aria-label="Email verification">
        <div className="tk-auth-runhead">
          <span>№ 04 · Verify email</span>
          <span className="tk-auth-runhead-rule" aria-hidden />
        </div>

        <header className="tk-auth-masthead">
          <h1 className="tk-auth-title">Check your inbox</h1>
          <p className="tk-auth-subtitle">
            We sent a verification link to {user.email ?? 'your email address'}.
          </p>
        </header>

        <div className="tk-auth-hairline" aria-hidden />

        <div className="tk-auth-status">
          After you click the link, this screen will advance automatically.
        </div>

        <div className="tk-auth-form tk-auth-gate-actions">
          <button
            type="button"
            className="tk-auth-submit"
            disabled={cooldown > 0}
            onClick={resend}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
          </button>
          <button type="button" className="tk-auth-link" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        {status ? <div className="tk-auth-status">{status}</div> : null}
        {error ? <div className="tk-auth-error">{error}</div> : null}
      </div>
    </div>
  )
}

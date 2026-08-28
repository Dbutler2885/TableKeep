import { useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { auth, db } from '../../firebase'
import { SignInView } from './SignInView'
import { SignUpView } from './SignUpView'
import { ForgotPasswordView } from './ForgotPasswordView'
import { getAuthErrorMessage } from './authErrorMessages'
import { claimUsername, isClaimUsernameError } from './claimUsername'
import { demoSeats } from './demoSeats'
import type { DemoSeat } from './demoSeats'
import { BrandWordmark } from '../common/BrandWordmark'
import './AuthPanel.css'

type Mode = 'signIn' | 'signUp' | 'forgotPassword'

type AuthPanelProps = {
  /** Optional contextual note shown above the card (e.g. invite copy). */
  context?: string | null
}

export function AuthPanel({ context }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>('signIn')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setStatus(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(getAuthErrorMessage(err))
      return false
    }
  }

  const handlePasswordSignIn = (email: string, password: string) =>
    run(async () => {
      await signInWithEmailAndPassword(auth, email, password)
      setStatus('Signed in.')
    })

  const handlePasswordSignUp = (email: string, password: string, username: string) =>
    run(async () => {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      try {
        await claimUsername(credential.user.uid, username, db)
      } catch (err) {
        if (!isClaimUsernameError(err, 'username-taken')) {
          throw err
        }
      }
      setStatus('Account created.')
    })

  const handleForgotPassword = (email: string) =>
    run(async () => {
      await sendPasswordResetEmail(auth, email)
    })

  const handleGoogle = () =>
    run(async () => {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      setStatus('Signed in with Google.')
    })

  const handleDemoSeat = (seat: DemoSeat) =>
    run(async () => {
      await signInWithEmailAndPassword(auth, seat.email, seat.password)
      setStatus('Signed in.')
    })

  // Empty outside the local-emulator demo, where the Google popup can only
  // reach the auth emulator's stub page. See `demoSeats.ts`.
  const showGoogle = demoSeats.length === 0

  // Reset transient state when swapping modes so a stale error from one view
  // doesn't bleed into the next.
  const switchMode = (next: Mode) => {
    setError(null)
    setStatus(null)
    setMode(next)
  }

  return (
    <div className="tk-auth-page">
      <div className="tk-auth-card" role="region" aria-label="Authentication">
        {mode === 'signIn' ? (
          <SignInView
            onPasswordSubmit={handlePasswordSignIn}
            onGoogle={handleGoogle}
            onSwitchToSignUp={() => switchMode('signUp')}
            onSwitchToForgot={() => switchMode('forgotPassword')}
            demoSeats={demoSeats}
            onDemoSeat={handleDemoSeat}
          />
        ) : null}

        {mode === 'signUp' ? (
          <SignUpView
            onPasswordSubmit={handlePasswordSignUp}
            onGoogle={handleGoogle}
            onSwitchToSignIn={() => switchMode('signIn')}
            showGoogle={showGoogle}
          />
        ) : null}

        {mode === 'forgotPassword' ? (
          <ForgotPasswordView
            onSubmit={handleForgotPassword}
            onSwitchToSignIn={() => switchMode('signIn')}
          />
        ) : null}

        {context ? <div className="tk-auth-status">{context}</div> : null}
        {status ? <div className="tk-auth-status">{status}</div> : null}
        {error ? <div className="tk-auth-error">{error}</div> : null}
      </div>

      <p className="tk-auth-foot">
        <BrandWordmark className="brand-wordmark-foot" /> · est. {new Date().getFullYear()}
      </p>
    </div>
  )
}

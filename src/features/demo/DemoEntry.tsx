import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInAnonymously } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../../firebase'
import { BrandWordmark } from '../common/BrandWordmark'
import { campaignTabPath } from '../navigation/tabs'
import { demoSandboxErrorMessage, rememberDemoExpiry } from './demoSandboxState'
import '../auth/AuthPanel.css'

type SandboxResponse = {
  groupId: string
  campaignId: string
  expiresAt: number
  resumed: boolean
}

/**
 * Signs the visitor in anonymously and asks for their copy of the campaign.
 *
 * `signInAnonymously` returns the existing anonymous user when the browser
 * already has one, and the callable is idempotent per uid, so a reload, a second
 * tab, or React's double-invoked development effect all land on the same
 * sandbox rather than minting another.
 */
async function claimDemoSandbox(): Promise<SandboxResponse> {
  const credential = await signInAnonymously(auth)
  const createSandbox = httpsCallable<void, SandboxResponse>(functions, 'createDemoSandboxSession')
  const { data } = await createSandbox()
  rememberDemoExpiry(credential.user.uid, data.expiresAt)
  return data
}

/**
 * The whole "try it now" arrival: no account, no email, no dialog.
 *
 * Sign in anonymously, ask the Cloud Function for a private copy of the demo
 * campaign, and land in it on the Maps tab - the fog brush and the token layer
 * are the thing worth showing, and the visitor arrives as the GM of their own
 * copy, so every tool is live.
 *
 * Nothing here decides what the visitor may touch. That is `firestore.rules` and
 * `storage.rules`: this screen would be just as safe if a visitor skipped it and
 * typed a campaign URL by hand.
 */
export function DemoEntry() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestedRef = useRef(-1)

  useEffect(() => {
    // One attempt per press of "Try again", and one on arrival. The ref guard is
    // what keeps React's double-invoked development effect from asking twice.
    if (requestedRef.current === attempt) return
    requestedRef.current = attempt
    claimDemoSandbox()
      .then((sandbox) => {
        navigate(campaignTabPath(sandbox.groupId, sandbox.campaignId, 'maps'), { replace: true })
      })
      .catch((err: unknown) => setError(demoSandboxErrorMessage(err)))
  }, [attempt, navigate])

  return (
    <div className="tk-auth-page">
      <div className="tk-auth-card" role="region" aria-label="Demo table">
        <div className="tk-auth-runhead">
          <span>№ 00 · Demo</span>
          <span className="tk-auth-runhead-rule" aria-hidden />
        </div>

        <header className="tk-auth-masthead">
          <h1 className="tk-auth-title"><BrandWordmark /></h1>
          <p className="tk-auth-subtitle">setting a table for you</p>
        </header>

        <div className="tk-auth-hairline" aria-hidden />

        {error ? (
          <>
            <div className="tk-auth-error">{error}</div>
            <div className="tk-demo-entry-actions">
              <button
                type="button"
                className="tk-auth-google"
                onClick={() => {
                  setError(null)
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </button>
              <p className="tk-auth-meta">
                <button type="button" className="tk-auth-link" onClick={() => navigate('/', { replace: true })}>
                  Back to sign in
                </button>
              </p>
            </div>
          </>
        ) : (
          <p className="tk-demo-entry-status" role="status">
            Copying the campaign - the maps, the party, the notes - into a table
            that is yours alone. A moment.
          </p>
        )}
      </div>

      <p className="tk-auth-foot">
        <BrandWordmark className="brand-wordmark-foot" /> · est. {new Date().getFullYear()}
      </p>
    </div>
  )
}

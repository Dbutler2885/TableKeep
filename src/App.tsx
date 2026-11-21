import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { auth, db } from './firebase'
import { AuthPanel } from './features/auth/AuthPanel'
import { UsernameSetup } from './features/auth/UsernameSetup'
import { VerifyEmailGate } from './features/auth/VerifyEmailGate'
import { groupPickerPath } from './features/navigation/tabs'
import { AcceptInvite } from './features/invites/AcceptInvite'
import { DemoEntry } from './features/demo/DemoEntry'
import { DEMO_VISITOR_USERNAME, demoEntryPath } from './features/demo/demoConstants'
import { GroupShell } from './features/shell/GroupShell'

function App() {
  // App reads the path itself, so a client-side navigation into /demo (or into
  // an invite link) re-renders the gate rather than only changing the URL bar.
  const { pathname } = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profileUid, setProfileUid] = useState<string | null>(null)
  const [, setAuthRefreshVersion] = useState(0)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)

      if (nextUser) {
        await setDoc(
          doc(db, 'users', nextUser.uid),
          {
            email: nextUser.email ?? null,
            displayName: nextUser.displayName ?? null,
            photoURL: nextUser.photoURL ?? null,
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true },
        )
      }
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (!user) {
      return
    }

    const userRef = doc(db, 'users', user.uid)

    const unsub = onSnapshot(
      userRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const data = snapshot.data()
        const nextUsername = typeof data?.username === 'string' ? data.username : null
        const canTrustMissingUsername = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites

        setUsername((current) => {
          if (nextUsername) return nextUsername
          return canTrustMissingUsername ? null : current
        })

        // Do not treat a cached "missing username" snapshot as authoritative:
        // that causes existing users to briefly see UsernameSetup on refresh.
        if (nextUsername || canTrustMissingUsername) {
          setProfileUid(user.uid)
          setProfileReady(true)
        }
      },
      () => {
        setUsername(null)
        setProfileUid(user.uid)
        setProfileReady(true)
      },
    )

    return () => unsub()
  }, [user])

  if (!authReady) {
    return (
      <main className="auth-shell">
        <p>Loading authentication...</p>
      </main>
    )
  }

  // The demo entry point sits ahead of the auth gate: it is the thing that
  // signs the visitor in. A signed-in account that lands here is sent on to
  // their own groups instead - the sandbox is for anonymous visitors only, and
  // the callable refuses anyone else.
  if (pathname.startsWith(demoEntryPath)) {
    return user && !user.isAnonymous ? <Navigate to={groupPickerPath} replace /> : <DemoEntry />
  }

  if (!user) {
    const isJoinFlow = pathname.startsWith('/join/')
    const context = isJoinFlow
      ? "You've been invited. Sign in or create an account to accept."
      : null
    // AuthPanel owns its own full-screen layout and masthead now;
    // the old <main className="auth-shell"> wrapper is no longer needed.
    return <AuthPanel context={context} />
  }

  // An anonymous visitor has no email address to verify, and no handle:
  // `usernames/{handle}` is a global uniqueness index that `firestore.rules`
  // keeps anonymous accounts out of, so they carry a local stand-in name and
  // skip both gates. Everything past this point is the ordinary app.
  const isDemoVisitor = user.isAnonymous

  if (!isDemoVisitor && !user.emailVerified) {
    return (
      <VerifyEmailGate
        user={user}
        onVerified={() => setAuthRefreshVersion((current) => current + 1)}
      />
    )
  }

  const currentProfileReady = profileReady && profileUid === user.uid

  if (!isDemoVisitor && !currentProfileReady) {
    return (
      <main className="auth-shell">
        <p>Loading profile...</p>
      </main>
    )
  }

  const shellUsername = isDemoVisitor ? DEMO_VISITOR_USERNAME : username

  if (!shellUsername) {
    // UsernameSetup owns its own full-screen layout (same editorial card as
    // AuthPanel), so no auth-shell wrapper / extra masthead is needed here.
    return <UsernameSetup user={user} onComplete={setUsername} />
  }

  const shell = <GroupShell user={user} username={shellUsername} isDemoVisitor={isDemoVisitor} />

  return (
    <Routes>
      <Route path="/" element={<Navigate to={groupPickerPath} replace />} />
      <Route path="/join/:token" element={<AcceptInvite user={user} />} />
      <Route path="/groups" element={shell} />
      <Route path="/groups/:groupId" element={shell} />
      <Route path="/groups/:groupId/campaigns/:campaignId/*" element={shell} />
      <Route path="*" element={<Navigate to={groupPickerPath} replace />} />
    </Routes>
  )
}

export default App

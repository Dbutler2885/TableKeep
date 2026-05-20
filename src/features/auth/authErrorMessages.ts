const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account already exists for this email. Try signing in instead.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found for this email.',
  'auth/invalid-email': "That doesn't look like a valid email address.",
  'auth/weak-password': 'Password must be at least 8 characters.',
  'auth/missing-password': 'Enter your password.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in popup.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : null
  }

  return null
}

export function getAuthErrorMessage(error: unknown) {
  const code = getErrorCode(error)
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code]
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return 'Something went wrong. Try again.'
}

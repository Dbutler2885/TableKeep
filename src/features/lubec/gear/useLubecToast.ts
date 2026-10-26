import { useEffect, useState } from 'react'

type Toast = { text: string; shown: boolean; at: number }

// How long the one-line confirmation stays up (B's toast).
const TOAST_MS = 2800

/** B's one-line confirmation after an action: `show` puts it up, and it goes again after a moment, keeping its words while it fades. `hide` takes it down at once, as picking a thing up does. */
export function useLubecToast() {
  const [toast, setToast] = useState<Toast>({ text: '', shown: false, at: 0 })
  useEffect(() => {
    if (!toast.shown) return undefined
    const timer = setTimeout(() => setToast((now) => ({ ...now, shown: false })), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast.shown, toast.at])
  return {
    text: toast.text,
    shown: toast.shown,
    show: (text: string) => setToast((now) => ({ text, shown: true, at: now.at + 1 })),
    hide: () => setToast((now) => ({ ...now, shown: false })),
  }
}

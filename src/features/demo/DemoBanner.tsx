import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { formatTimeRemaining } from './demoSandboxState'
import './DemoBanner.css'

type Props = {
  /** When this tab's sandbox runs out, or null when the tab never learned it. */
  expiresAtMs: number | null
  onLeave: () => void
}

/**
 * The one honest thing a demo visitor needs on screen: this table is theirs,
 * nobody else can see it, and it is going away.
 *
 * It floats rather than taking a row in the shell, because the shell's height
 * chain feeds the map canvas and a new flex child there changes how big the map
 * renders. It collapses to a chip so it is never in the way of the fog brush,
 * which is the thing the visitor came to try.
 *
 * The remaining time is shown when the tab knows it and elided to "a few hours"
 * when it does not, rather than spending a Firestore read to re-learn a number
 * that never changes (see `rememberDemoExpiry`).
 */
export function DemoBanner({ expiresAtMs, onLeave }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (expiresAtMs === null) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [expiresAtMs])

  const remaining = expiresAtMs === null ? null : formatTimeRemaining(expiresAtMs, now)

  if (collapsed) {
    return (
      <button
        type="button"
        className="tk-demo-chip"
        onClick={() => setCollapsed(false)}
        aria-label="About this demo table"
      >
        <span className="tk-demo-chip-mark">Demo</span>
        {remaining ? <span className="tk-demo-chip-clock">{remaining}</span> : null}
      </button>
    )
  }

  const window = expiresAtMs === null
    ? 'for a few hours'
    : remaining
      ? `for another ${remaining}`
      : 'and has now expired'

  return (
    <div className="tk-demo-banner" role="status">
      <span className="tk-demo-banner-mark" aria-hidden>Demo</span>
      <span className="tk-demo-banner-copy">
        A private copy of a real campaign, yours alone {window}. Change anything -
        paint the fog, move the tokens. Nothing here reaches anyone else, and it is
        thrown away afterwards.
      </span>
      <button type="button" className="tk-demo-banner-leave" onClick={onLeave}>
        Leave demo
      </button>
      <button
        type="button"
        className="tk-demo-banner-collapse"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse demo notice"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  )
}

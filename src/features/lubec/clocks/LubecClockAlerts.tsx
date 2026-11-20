// The clock popup: whenever someone else fills or empties a piece of a clock
// this viewer can see, the clock's card comes up over whatever tab is open,
// the piece animates in or out, and the popup fades away by itself. A click
// sends it away early. Changes wait their turn, one popup at a time.

import type { AnimationEvent } from 'react'
import type { Role } from '../../../types/app'
import { lubecClockChangeText } from './lubecClock'
import type { LubecClockAlert } from './lubecClockAlertQueue'
import { LubecClockCard } from './LubecClockCard'
import { useLubecClockAlerts } from './useLubecClockAlerts'
import './lubecClocks.css'

export type LubecClockAlertsProps = { campaignId: string; groupId: string; role: Role | null; userId: string }

/** One change on screen: its words, the clock's card with the changed pieces animating, then gone when the fade ends. */
export function LubecClockPopup({ alert, onDone }: { alert: LubecClockAlert; onDone: () => void }) {
  const text = lubecClockChangeText(alert)
  // Only the popup's own fade ends it; the pieces' animations end earlier and bubble up.
  const endWithFade = (e: AnimationEvent) => {
    if (e.target === e.currentTarget) onDone()
  }
  return (
    <div className="lubec-clock-alert" role="status" aria-live="polite" aria-label={`${alert.clock.name}: ${text}`} onClick={onDone} onAnimationEnd={endWithFade}>
      <div className="lubec-clocks clock-alert-card">
        <p className="clock-alert-head"><span className="clock-eyebrow">Clock</span><span className="clock-alert-text">{text}</span></p>
        <LubecClockCard clock={alert.clock} actions={null} audience={null} changed={alert} />
      </div>
    </div>
  )
}

/** Listens to the campaign's clocks and shows each change someone else makes, over any tab. */
export function LubecClockAlerts({ campaignId, groupId, role, userId }: LubecClockAlertsProps) {
  const alerts = useLubecClockAlerts({ campaignId, groupId }, { isGm: role === 'gm', userId })
  const alert = alerts.current
  return alert ? <LubecClockPopup key={alert.seq} alert={alert} onDone={alerts.dismiss} /> : null
}

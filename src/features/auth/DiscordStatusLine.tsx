import type { ReactNode } from 'react'
import './DiscordConnection.css'

export type DiscordStatusMessage = { tone: 'success' | 'error'; text: string }

type DiscordStatusLineProps = {
  /**
   * Where the line sits. "subtitle" is under the "Signed in as" line on the
   * group screens; "panel" is the account panel in a campaign's side rail.
   * Each borrows the classes of the text beside it, so it cannot drift from it.
   */
  variant: 'subtitle' | 'panel'
  children: ReactNode
  action?: { label: string; onClick: () => void; disabled: boolean }
  message?: DiscordStatusMessage | null
}

/** One line of Discord status with an optional action, dressed to match its surroundings. */
export function DiscordStatusLine({ variant, children, action, message }: DiscordStatusLineProps) {
  const messageLine = message ? (
    <p
      className={`discord-connection__message discord-connection__message--${message.tone}`}
      role={message.tone === 'error' ? 'alert' : 'status'}
    >
      {message.text}
    </p>
  ) : null

  if (variant === 'panel') {
    return (
      <div className="discord-connection discord-connection--panel">
        <p className="account-email">{children}</p>
        {action ? (
          <button type="button" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </button>
        ) : null}
        {messageLine}
      </div>
    )
  }

  return (
    <div className="discord-connection discord-connection--subtitle">
      <p className="group-subtitle">
        {children}
        {action ? (
          <>
            {' · '}
            <button type="button" className="group-link-button" onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </button>
          </>
        ) : null}
      </p>
      {messageLine}
    </div>
  )
}

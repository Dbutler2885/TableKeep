import { useEffect, useState } from 'react'
import { discordReturnMessage } from './discordConnectionMessages'
import { noteDiscordOutcomeShown, pendingDiscordOutcome } from './discordReturnOutcome'
import './DiscordConnection.css'

/**
 * What happened on Discord, told to someone who has just come back from it.
 *
 * It sits after the Discord lines it refers to, so that "server linked" reads
 * as the last word on them and not as a note under whichever line came first.
 */
export function DiscordReturnNotice({ variant }: { variant: 'subtitle' | 'panel' }) {
  const [message] = useState(() => discordReturnMessage(pendingDiscordOutcome()))
  useEffect(noteDiscordOutcomeShown, [])
  if (!message) return null

  return (
    <div className={`discord-connection discord-connection--${variant}`}>
      <p
        className={`discord-connection__message discord-connection__message--${message.tone}`}
        role={message.tone === 'error' ? 'alert' : 'status'}
      >
        {message.text}
      </p>
    </div>
  )
}

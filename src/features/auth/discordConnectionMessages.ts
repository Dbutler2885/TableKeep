/**
 * What to tell someone when they come back from Discord.
 *
 * The connect callback returns people to the app with `?discord=<outcome>` in
 * the address. These are the words for each outcome.
 */

export type DiscordReturnMessage = { tone: 'success' | 'error'; text: string }

const MESSAGES: Record<string, DiscordReturnMessage> = {
  connected: { tone: 'success', text: 'Discord connected.' },
  server_linked: { tone: 'success', text: 'Discord server linked.' },
  server_taken: {
    tone: 'error',
    text: 'That Discord server is already linked to a different group. Unlink it there first.',
  },
  not_group_admin: { tone: 'error', text: 'Only an admin of the group can link a Discord server.' },
  declined: { tone: 'error', text: 'You declined the connection on Discord, so nothing was changed.' },
  already_linked: {
    tone: 'error',
    text: 'That Discord account is already connected to a different Table Keep account. Disconnect it there first.',
  },
  expired: { tone: 'error', text: 'That took too long to approve. Start the connection again.' },
  invalid_state: { tone: 'error', text: 'That connection link was not valid or had already been used. Start again.' },
  discord_error: { tone: 'error', text: 'Discord could not confirm your account just now. Try again in a minute.' },
}

/** The message for an outcome, or null when the address carries none. */
export function discordReturnMessage(outcome: string | null): DiscordReturnMessage | null {
  if (!outcome) return null
  return MESSAGES[outcome] ?? { tone: 'error', text: 'Connecting Discord did not finish. Try again.' }
}

/** What to say when starting or ending a connection fails before Discord is reached. */
export function discordRequestErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? ''
  if (code === 'functions/failed-precondition') return 'Discord is not set up for this site yet.'
  if (code === 'functions/permission-denied') {
    // The function's own message says which permission was missing.
    return (error as { message?: string }).message || 'You are not allowed to do that.'
  }
  return 'Could not reach Table Keep to do that. Check your connection and try again.'
}

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import { discordRequestErrorMessage, type DiscordReturnMessage } from './discordConnectionMessages'
import { DiscordStatusLine } from './DiscordStatusLine'

type DiscordLink = { discordId: string; username: string; displayName: string }

/**
 * A person's Discord connection: who they are connected as, with a way to
 * connect or disconnect.
 *
 * Connecting leaves the app for Discord's own approval page and comes back, so
 * the Discord ID stored is the one Discord vouches for. Nothing here can set
 * it: `firestore.rules` refuses every client write to `discordLinks`.
 */
export function DiscordConnection({ userId, variant }: { userId: string; variant: 'subtitle' | 'panel' }) {
  // `undefined` while the first snapshot is on its way, `null` once it says there is no connection.
  const [link, setLink] = useState<DiscordLink | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<DiscordReturnMessage | null>(null)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'discordLinks', userId),
        (snap) => setLink(snap.exists() ? (snap.data() as DiscordLink) : null),
        () => setLink(null),
      ),
    [userId],
  )

  const connect = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const start = httpsCallable<void, { url: string }>(functions, 'startDiscordConnect')
      const { data } = await start()
      window.location.assign(data.url)
    } catch (error) {
      setMessage({ tone: 'error', text: discordRequestErrorMessage(error) })
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await httpsCallable<void, { ok: boolean }>(functions, 'disconnectDiscordAccount')()
    } catch (error) {
      setMessage({ tone: 'error', text: discordRequestErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  if (link === undefined) return null

  return (
    <DiscordStatusLine
      variant={variant}
      message={message}
      action={
        link
          ? { label: busy ? 'Disconnecting…' : 'Disconnect', onClick: () => void disconnect(), disabled: busy }
          : { label: busy ? 'Opening Discord…' : 'Connect Discord', onClick: () => void connect(), disabled: busy }
      }
    >
      {link ? (
        <>
          Discord: <strong>{link.displayName}</strong>
          {link.username !== link.displayName ? ` (${link.username})` : null}
        </>
      ) : (
        'Discord: not connected'
      )}
    </DiscordStatusLine>
  )
}

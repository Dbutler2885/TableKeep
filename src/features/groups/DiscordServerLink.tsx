import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import { discordRequestErrorMessage } from '../auth/discordConnectionMessages'
import { DiscordStatusLine } from '../auth/DiscordStatusLine'

type ServerLink = { guildId: string; guildName: string }

/**
 * Which Discord server the session bot records this group from.
 *
 * Every member can see it. An admin can link one, which leaves the app for
 * Discord's own page where they pick a server they manage and add the bot to
 * it, and can unlink it again. `firestore.rules` refuses every client write to
 * the link, so nothing here can set it.
 */
export function DiscordServerLink({ groupId, canManage }: { groupId: string; canManage: boolean }) {
  // `undefined` while the first snapshot is on its way, `null` once it says no server is linked.
  const [link, setLink] = useState<ServerLink | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'groups', groupId, 'integrations', 'discord'),
        (snap) => setLink(snap.exists() ? (snap.data() as ServerLink) : null),
        () => setLink(null),
      ),
    [groupId],
  )

  const startLink = async () => {
    setBusy(true)
    setError(null)
    try {
      const start = httpsCallable<{ groupId: string }, { url: string }>(functions, 'startDiscordServerLink')
      const { data } = await start({ groupId })
      window.location.assign(data.url)
    } catch (caught) {
      setError(discordRequestErrorMessage(caught))
      setBusy(false)
    }
  }

  const unlink = async () => {
    setBusy(true)
    setError(null)
    try {
      await httpsCallable<{ groupId: string }, { ok: boolean }>(functions, 'unlinkGroupDiscordServer')({ groupId })
    } catch (caught) {
      setError(discordRequestErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (link === undefined) return null
  // A member with nothing to see and nothing to do is shown nothing.
  if (!link && !canManage) return null

  const action = link
    ? { label: busy ? 'Unlinking…' : 'Unlink', onClick: () => void unlink(), disabled: busy }
    : { label: busy ? 'Opening Discord…' : 'Link a Discord server', onClick: () => void startLink(), disabled: busy }

  return (
    <DiscordStatusLine
      variant="subtitle"
      action={canManage ? action : undefined}
      message={error ? { tone: 'error', text: error } : null}
    >
      Discord server: {link ? <strong>{link.guildName || 'linked'}</strong> : 'none linked'}
    </DiscordStatusLine>
  )
}

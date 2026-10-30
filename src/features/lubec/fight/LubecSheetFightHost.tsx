import type { ReactNode } from 'react'
import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import type { LubecViewer } from '../lubecSheetWiring'
import type { LubecStore } from '../useLubecSheetSession'
import { lubecCanFightFrom } from './lubecFightCombatants'
import { LubecFightStartContext, type LubecFightStart } from './lubecFightStart'
import { useLubecFightRoom } from './useLubecFightRoom'

type SheetFightHostProps = {
  scope: CampaignScope
  viewer: LubecViewer
  gmUserId: string | null
  store: LubecStore
  /** The open character, who attacks; null while none is open. */
  character: LubecCharacterRecord | null
  setError: (message: string) => void
  children: ReactNode
}

/** The fight modal over the character sheet: the open character attacks, and the roster and the GM's NPCs are the targets. */
export function LubecSheetFightHost({ character, children, ...room }: SheetFightHostProps) {
  const { host, modal } = useLubecFightRoom(room)
  const start: LubecFightStart | null = lubecCanFightFrom(character, room.viewer)
    ? (weaponItemId) => host.open({ attacker: { kind: 'character', character }, target: null, weaponItemId })
    : null
  return (
    <>
      <LubecFightStartContext value={start}>{children}</LubecFightStartContext>
      {modal}
    </>
  )
}

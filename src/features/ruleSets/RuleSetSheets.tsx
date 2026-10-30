import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { CharacterTab } from '../character/CharacterTab'
import { VtmCharacterTab } from '../character/VtmCharacterTab'
import { ItemsTab } from '../items/ItemsTab'
import { LubecCharacterTab } from '../lubec/LubecCharacterTab'
import { LubecMapFightHost } from '../lubec/fight/LubecMapFightHost'
import { LubecItemsTab } from '../lubec/items/LubecItemsTab'
import { LubecNpcSheetTab } from '../lubec/LubecNpcSheetTab'
import type { CharacterTabProps } from '../shell/characterTabProps'
import type { Campaign, CharacterRecord, NpcRecord, Role } from '../../types/app'

// What the shell hands a rule set's sheet: the open campaign, who is viewing
// it, and the OSE character state the shell shares between the character and
// maps tabs.
export type RuleSetSheetProps = {
  campaign: Campaign
  role: Role | null
  user: User
  username: string
  setError: (message: string) => void
  characterTabProps: CharacterTabProps | null
}

// OSE's sheet runs on the character state the shell shares with Maps, and
// shows nothing until that state exists.
export function OseSheet({ characterTabProps }: RuleSetSheetProps) {
  return characterTabProps ? <CharacterTab {...characterTabProps} /> : null
}

// VtM's sheet loads its own characters from the campaign.
export function VtmSheet({ campaign, role, user, username, setError }: RuleSetSheetProps) {
  return (
    <VtmCharacterTab
      campaignId={campaign.id}
      groupId={campaign.groupId}
      role={role}
      currentUserId={user.uid}
      currentUsername={username}
      gmUserId={campaign.gmUserId ?? null}
      setError={setError}
    />
  )
}

// Lubec's sheet loads its own characters from the campaign, as VtM's does.
export function LubecSheet({ campaign, role, user, username, setError }: RuleSetSheetProps) {
  return (
    <LubecCharacterTab
      campaignId={campaign.id}
      groupId={campaign.groupId}
      role={role}
      currentUserId={user.uid}
      currentUsername={username}
      gmUserId={campaign.gmUserId ?? null}
      setError={setError}
    />
  )
}

// What the shell hands a rule set's NPC sheet: the viewer and campaign a
// character sheet gets, and the NPC whose sheet it is.
export type RuleSetNpcSheetProps = Omit<RuleSetSheetProps, 'characterTabProps'> & { npc: NpcRecord }

// Lubec's NPC sheet is its character sheet, loaded from the NPC's own sheet document.
export function LubecNpcSheet({ npc, campaign, role, user, username, setError }: RuleSetNpcSheetProps) {
  return (
    <LubecNpcSheetTab
      npc={npc}
      campaignId={campaign.id}
      groupId={campaign.groupId}
      role={role}
      currentUserId={user.uid}
      currentUsername={username}
      gmUserId={campaign.gmUserId ?? null}
      setError={setError}
    />
  )
}

// What the shell hands the host of a rule set's fight modal, which wraps the map.
export type RuleSetMapFightProps = Omit<RuleSetSheetProps, 'characterTabProps'> & { children: ReactNode }

// Lubec's fight modal over the map loads its own characters for as long as Maps is open.
export function LubecMapFight({ campaign, role, user, setError, children }: RuleSetMapFightProps) {
  return (
    <LubecMapFightHost
      campaignId={campaign.id}
      groupId={campaign.groupId}
      role={role}
      currentUserId={user.uid}
      gmUserId={campaign.gmUserId ?? null}
      setError={setError}
    >
      {children}
    </LubecMapFightHost>
  )
}

// What the shell hands a rule set's Items tab, which only the GM sees: the
// open campaign, the GM, and the OSE characters the shell shares.
export type RuleSetItemsProps = Omit<RuleSetSheetProps, 'characterTabProps'> & { characters: CharacterRecord[] }

// OSE's Items tab grants to the characters the shell shares.
export function OseItems({ campaign, role, characters }: RuleSetItemsProps) {
  return <ItemsTab campaignId={campaign.id} groupId={campaign.groupId} role={role} characters={characters} />
}

// Lubec's Items tab holds what players drop and the campaign's items, and loads its own characters to give them to.
export function LubecItems({ campaign, role, user, setError }: RuleSetItemsProps) {
  return (
    <LubecItemsTab
      campaignId={campaign.id}
      groupId={campaign.groupId}
      role={role}
      currentUserId={user.uid}
      gmUserId={campaign.gmUserId ?? null}
      setError={setError}
    />
  )
}

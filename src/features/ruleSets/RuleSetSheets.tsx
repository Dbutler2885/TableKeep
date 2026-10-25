import type { User } from 'firebase/auth'
import { CharacterTab } from '../character/CharacterTab'
import { VtmCharacterTab } from '../character/VtmCharacterTab'
import { LubecCharacterTab } from '../lubec/LubecCharacterTab'
import { LubecNpcSheetTab } from '../lubec/LubecNpcSheetTab'
import type { CharacterTabProps } from '../shell/characterTabProps'
import type { Campaign, NpcRecord, Role } from '../../types/app'

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

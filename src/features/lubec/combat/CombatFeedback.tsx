import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { AppTab, Campaign, Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { campaignTabPath } from '../../navigation/tabs'
import { CombatLogContext } from './CombatLogContext'
import { CombatRollCards, CombatTurnNotice } from './CombatMessages'
import { useLubecCombat } from './combatWatch'
import { pendingCombatActions } from './pendingActions'
import { useCombatLog } from './useCombatLog'
import './combatFeedback.css'

type FeedbackProps = { campaign: Campaign | null; role: Role | null; userId: string; activeTab: AppTab; navigate: NavigateFunction; setError: (message: string) => void; children: ReactNode }

function CombatTurnReminder({ campaign, role, userId, activeTab, navigate }: Omit<FeedbackProps, 'children' | 'setError'>) {
  const { live } = useLubecCombat()
  const actions = live ? pendingCombatActions(live.fight.state, role, userId) : []
  if (activeTab === 'combat' || !campaign) return null
  const back = () => { void navigate(campaignTabPath(campaign.groupId, campaign.id, 'combat')) }
  return <CombatTurnNotice actions={actions} round={live?.fight.state.round} role={role} onReturn={back} />
}

function feedbackScope(enabled: boolean, campaign: Campaign | null): CampaignScope | null {
  return enabled && campaign ? { groupId: campaign.groupId, campaignId: campaign.id } : null
}

/** Mounted around the entire workspace so tab changes never reattach or replay cards. */
export function CombatFeedback({ campaign, setError, children, ...viewer }: FeedbackProps) {
  const { enabled, live } = useLubecCombat()
  const log = useCombatLog(feedbackScope(enabled, campaign), live?.id ?? null, setError)
  if (!enabled) return children
  return (
    <CombatLogContext value={log}>
      {children}
      <CombatRollCards />
      <CombatTurnReminder campaign={campaign} {...viewer} />
    </CombatLogContext>
  )
}

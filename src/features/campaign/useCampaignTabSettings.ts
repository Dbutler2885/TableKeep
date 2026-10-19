import { useMemo, useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { resolveSystem } from '../navigation/tabs'
import type { AppTab, Campaign } from '../../types/app'
import { campaignSettingsTabs, enabledTabsToSave, initialEnabledTabs, toggleEnabledTab } from './campaignTabSettings'

// The campaign settings form: which of its system's tabs the campaign shows,
// and saving that choice onto the campaign document.
export function useCampaignTabSettings(groupId: string, campaign: Campaign, onClose: () => void) {
  const gameSystem = resolveSystem(campaign.system)
  const settingsTabs = useMemo(() => campaignSettingsTabs(gameSystem), [gameSystem])
  const [enabled, setEnabled] = useState(() => initialEnabledTabs(gameSystem, campaign.enabledTabs))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleTab = (tab: AppTab) => setEnabled((prev) => toggleEnabledTab(prev, tab))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'groups', groupId, 'campaigns', campaign.id), {
        enabledTabs: enabledTabsToSave(gameSystem, enabled),
        updatedAt: serverTimestamp(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  return { settingsTabs, enabled, busy, error, toggleTab, save }
}

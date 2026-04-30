import { useMemo, useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { tabs } from '../navigation/tabs'
import type { AppTab, Campaign } from '../../types/app'

type CampaignSettingsModalProps = {
  groupId: string
  campaign: Campaign
  onClose: () => void
}

const SETTINGS_TABS: Array<{ id: AppTab; label: string; locked?: boolean }> = tabs
  .filter((t) => t.id !== 'rules')
  .map((t) => ({ id: t.id, label: t.label, locked: t.id === 'character' }))

export function CampaignSettingsModal({ groupId, campaign, onClose }: CampaignSettingsModalProps) {
  const initialEnabled = useMemo<Set<AppTab>>(() => {
    if (campaign.enabledTabs && campaign.enabledTabs.length > 0) {
      return new Set(campaign.enabledTabs)
    }
    return new Set(tabs.map((t) => t.id))
  }, [campaign.enabledTabs])

  const [enabled, setEnabled] = useState<Set<AppTab>>(initialEnabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleTab = (tab: AppTab) => {
    if (tab === 'character') return
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(tab)) next.delete(tab)
      else next.add(tab)
      return next
    })
  }

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const enabledTabs = tabs.map((t) => t.id).filter((id) => enabled.has(id))
      await updateDoc(doc(db, 'groups', groupId, 'campaigns', campaign.id), {
        enabledTabs,
        updatedAt: serverTimestamp(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal group-modal campaign-settings-modal">
        <h3>Campaign settings</h3>

        <section className="settings-section">
          <h4>Visible tabs</h4>
          <p className="settings-help">Choose which tabs your group sees in this campaign.</p>
          <div className="settings-tabs">
            {SETTINGS_TABS.map((tab) => (
              <label key={tab.id} className="settings-tab-option">
                <input
                  type="checkbox"
                  checked={enabled.has(tab.id)}
                  onChange={() => toggleTab(tab.id)}
                  disabled={busy || tab.locked}
                />
                <span>{tab.label}</span>
                {tab.locked ? <span className="settings-tab-locked">required</span> : null}
              </label>
            ))}
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="group-modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void handleSave()} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

import type { Campaign } from '../../types/app'
import type { SettingsTab } from './campaignTabSettings'
import { useCampaignTabSettings } from './useCampaignTabSettings'

type CampaignSettingsModalProps = {
  groupId: string
  campaign: Campaign
  onClose: () => void
}

export function CampaignSettingsModal({ groupId, campaign, onClose }: CampaignSettingsModalProps) {
  const { settingsTabs, enabled, busy, error, toggleTab, save } = useCampaignTabSettings(groupId, campaign, onClose)

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal group-modal campaign-settings-modal">
        <h3>Campaign settings</h3>

        <section className="settings-section">
          <h4>Visible tabs</h4>
          <p className="settings-help">Choose which tabs your group sees in this campaign.</p>
          <div className="settings-tabs">
            {settingsTabs.map((tab) => (
              <SettingsTabOption
                key={tab.id}
                tab={tab}
                checked={enabled.has(tab.id)}
                busy={busy}
                onToggle={() => toggleTab(tab.id)}
              />
            ))}
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="group-modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

type SettingsTabOptionProps = {
  tab: SettingsTab
  checked: boolean
  busy: boolean
  onToggle: () => void
}

function SettingsTabOption({ tab, checked, busy, onToggle }: SettingsTabOptionProps) {
  return (
    <label className="settings-tab-option">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={busy || tab.locked}
      />
      <span>{tab.label}</span>
      {tab.locked ? <span className="settings-tab-locked">required</span> : null}
    </label>
  )
}

import { ShoppingBag, X } from 'lucide-react'
import type { CharacterRecord } from '../../../types/app'
import { amountForTarget } from '../lib/grantPlanning'
import { useGrantTools } from '../hooks/useGrantTools'

type Props = { tools: ReturnType<typeof useGrantTools>; characters: CharacterRecord[]; isMobile: boolean }

export function GrantToolsPanel({ tools, characters: sortedCharacters, isMobile }: Props) {
  const { grantTargetIds, grantXpBase, setGrantXpBase, grantXpSplitBetweenTargets, setGrantXpSplitBetweenTargets, grantGoldGp, setGrantGoldGp, grantGoldSplitBetweenTargets, setGrantGoldSplitBetweenTargets, grantNote, setGrantNote, grantCampaignItemId, setGrantCampaignItemId, grantCampaignEntries, setGrantCampaignEntries, grantTemplateItemId, setGrantTemplateItemId, grantTemplateEntries, setGrantTemplateEntries, grantBusy, grantFeedback, authoredCampaignItems, grantTemplateSelectable, selectedGrantTargetIds, parsedGrantBaseXp, parsedGrantGoldGp, grantPreviewByCharacterId, toggleGrantTarget, clearGrantDraftAndTargets, selectAllGrantTargets, clearGrantTargets, upsertGrantCampaignEntry, upsertGrantTemplateEntry, applyGrantToSelectedTargets } = tools
  return (
    <div className="monster-editor-grid character-editor-grid">
      <section className="character-sheet">
        <div className="character-sheet-main-grid">
          <div className="character-sheet-left">
            <section className="monster-section-block">
              <div className="section-head">
                <h3 className="monster-section-title">Grant Builder</h3>
                <span className="character-roll-points">{selectedGrantTargetIds.length} selected</span>
              </div>
              <p className="character-enc-help">Build a grant package, then choose target characters.</p>
              {grantFeedback ? <p className="error">{grantFeedback}</p> : null}
              <div className="character-sheet-two-col">
                <label className="character-header-field">
                  <span className="character-header-tag">Base XP</span>
                  <input
                    type="number"
                    min={0}
                    value={grantXpBase}
                    onChange={(event) => setGrantXpBase(event.target.value)}
                    disabled={grantBusy}
                  />
                  <span className="character-inline-checkbox">
                    <input
                      type="checkbox"
                      checked={grantXpSplitBetweenTargets}
                      onChange={(event) => setGrantXpSplitBetweenTargets(event.target.checked)}
                      disabled={grantBusy}
                    />
                    <small>Split between targets</small>
                  </span>
                </label>
                <label className="character-header-field">
                  <span className="character-header-tag">Gold (gp)</span>
                  <input
                    type="number"
                    min={0}
                    value={grantGoldGp}
                    onChange={(event) => setGrantGoldGp(event.target.value)}
                    disabled={grantBusy}
                  />
                  <span className="character-inline-checkbox">
                    <input
                      type="checkbox"
                      checked={grantGoldSplitBetweenTargets}
                      onChange={(event) => setGrantGoldSplitBetweenTargets(event.target.checked)}
                      disabled={grantBusy}
                    />
                    <small>Split between targets</small>
                  </span>
                </label>
              </div>
              <label className="character-header-field">
                <span className="character-header-tag">Note</span>
                <input
                  type="text"
                  value={grantNote}
                  onChange={(event) => setGrantNote(event.target.value)}
                  placeholder="Optional reason/context"
                  disabled={grantBusy}
                />
              </label>
            </section>
    
            <section className="monster-section-block">
              <h3 className="monster-section-title">Grant Items</h3>
              <div className="character-sheet-two-col">
                <label className="character-header-field">
                  <span className="character-header-tag">Campaign Items</span>
                  <select value={grantCampaignItemId} onChange={(event) => setGrantCampaignItemId(event.target.value)} disabled={grantBusy}>
                    <option value="">Select item...</option>
                    {authoredCampaignItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.typeName || item.name} ({item.type})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="monster-example-btn"
                  disabled={!grantCampaignItemId || grantBusy}
                  onClick={() => {
                    const item = authoredCampaignItems.find((entry) => entry.id === grantCampaignItemId)
                    if (!item) return
                    upsertGrantCampaignEntry(item)
                  }}
                >
                  Add Campaign Item
                </button>
              </div>
    
              <div className="character-sheet-two-col">
                <label className="character-header-field">
                  <span className="character-header-tag">OSE Templates</span>
                  <select value={grantTemplateItemId} onChange={(event) => setGrantTemplateItemId(event.target.value)} disabled={grantBusy}>
                    <option value="">Select template...</option>
                    {grantTemplateSelectable.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.kind})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="monster-example-btn"
                  disabled={!grantTemplateItemId || grantBusy}
                  onClick={() => upsertGrantTemplateEntry(grantTemplateItemId)}
                >
                  Add Template
                </button>
              </div>
    
              {(grantCampaignEntries.length > 0 || grantTemplateEntries.length > 0) ? (
                <div className="character-sheet-rows">
                  {grantCampaignEntries.map((entry) => (
                    <div key={`campaign-${entry.itemId}`} className="character-sheet-row">
                      <strong>{entry.name}</strong>
                      <div className="character-ability-adjust">
                        <button
                          type="button"
                          className="character-ability-adjust-btn"
                          onClick={() => setGrantCampaignEntries((current) => current.map((row) =>
                            row.itemId === entry.itemId ? { ...row, qty: Math.max(1, row.qty - 1) } : row,
                          ))}
                        >
                          -
                        </button>
                        <input type="text" value={String(entry.qty)} readOnly />
                        <button
                          type="button"
                          className="character-ability-adjust-btn"
                          onClick={() => setGrantCampaignEntries((current) => current.map((row) =>
                            row.itemId === entry.itemId ? { ...row, qty: row.qty + 1 } : row,
                          ))}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="monster-example-btn"
                          onClick={() => setGrantCampaignEntries((current) => current.filter((row) => row.itemId !== entry.itemId))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {grantTemplateEntries.map((entry) => (
                    <div key={`template-${entry.key}`} className="character-sheet-row">
                      <strong>{entry.name}</strong>
                      <small>{entry.kind}</small>
                      <div className="character-ability-adjust">
                        <button
                          type="button"
                          className="character-ability-adjust-btn"
                          onClick={() => setGrantTemplateEntries((current) => current.map((row) =>
                            row.key === entry.key ? { ...row, qty: Math.max(1, row.qty - 1) } : row,
                          ))}
                        >
                          -
                        </button>
                        <input type="text" value={String(entry.qty)} readOnly />
                        <button
                          type="button"
                          className="character-ability-adjust-btn"
                          onClick={() => setGrantTemplateEntries((current) => current.map((row) =>
                            row.key === entry.key ? { ...row, qty: row.qty + 1 } : row,
                          ))}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="monster-example-btn"
                          onClick={() => setGrantTemplateEntries((current) => current.filter((row) => row.key !== entry.key))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="character-enc-help">No grant items selected yet.</p>}
            </section>
    
            {isMobile ? (
              <section className="monster-section-block">
                <div className="section-head">
                  <h3 className="monster-section-title">Select Targets</h3>
                  <button
                    type="button"
                    className="monster-example-btn"
                    onClick={selectAllGrantTargets}
                    disabled={grantBusy || sortedCharacters.length === 0}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="monster-example-btn"
                    onClick={clearGrantTargets}
                    disabled={grantBusy || selectedGrantTargetIds.length === 0}
                  >
                    Clear
                  </button>
                </div>
                <div className="character-grant-mobile-targets">
                  {sortedCharacters.map((character) => {
                    const selected = !!grantTargetIds[character.id]
                    return (
                      <button
                        key={`mobile-target-${character.id}`}
                        type="button"
                        className={selected ? 'character-grant-mobile-target selected' : 'character-grant-mobile-target'}
                        onClick={() => toggleGrantTarget(character.id, !selected)}
                        disabled={grantBusy}
                        aria-pressed={selected}
                      >
                        <strong>{character.name}</strong>
                        <small>L{character.level} {character.className}</small>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>
    
          <div className="character-sheet-right">
            <section className="monster-section-block">
              <div className="section-head">
                <h3 className="monster-section-title">Targets</h3>
                <button
                  type="button"
                  className="monster-example-btn"
                  onClick={selectAllGrantTargets}
                  disabled={grantBusy || sortedCharacters.length === 0}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="monster-example-btn"
                  onClick={clearGrantTargets}
                  disabled={grantBusy || selectedGrantTargetIds.length === 0}
                >
                  Clear
                </button>
              </div>
              {selectedGrantTargetIds.length === 0 ? <p className="character-enc-help">Choose one or more targets to preview and grant.</p> : (
                <div className="character-sheet-rows">
                  {selectedGrantTargetIds.map((id, targetIndex) => {
                    const character = sortedCharacters.find((entry) => entry.id === id)
                    if (!character) return null
                    const preview = grantPreviewByCharacterId.get(id)
                    const targetGold = amountForTarget(
                      parsedGrantGoldGp,
                      grantGoldSplitBetweenTargets,
                      selectedGrantTargetIds.length,
                      targetIndex,
                    )
                    return (
                      <div key={id} className="character-sheet-row character-grant-target-row">
                        <strong>{character.name}</strong>
                        {parsedGrantBaseXp > 0 ? (
                          <>
                            <small>
                              XP {character.xp.toLocaleString()}
                              {preview
                                ? ` + ${preview.awardedXp.toLocaleString()} (${preview.bonusPercent > 0 ? '+' : ''}${preview.bonusPercent}% XP modifier)`
                                : ''}
                            </small>
                            <small>
                              L{character.level}
                              {preview ? ` -> L${Math.max(character.level, preview.projectedLevel)}` : ''}
                            </small>
                          </>
                        ) : null}
                        {parsedGrantGoldGp > 0 ? (
                          <small>
                            Gold +{targetGold.toLocaleString()} gp
                            {grantGoldSplitBetweenTargets ? ' (split)' : ''}
                          </small>
                        ) : null}
                        {parsedGrantBaseXp <= 0 && parsedGrantGoldGp <= 0 ? (
                          <small>Items only grant</small>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="character-sheet-tab-actions character-grant-actions">
                <button
                  type="button"
                  className="character-current-action"
                  onClick={applyGrantToSelectedTargets}
                  disabled={grantBusy || selectedGrantTargetIds.length === 0}
                >
                  <ShoppingBag size={14} />
                  <span>{grantBusy ? 'Granting...' : 'Grant to Selected'}</span>
                </button>
                <button
                  type="button"
                  className="character-current-action"
                  onClick={clearGrantDraftAndTargets}
                  disabled={grantBusy}
                >
                  <X size={14} />
                  <span>Clear Draft</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}

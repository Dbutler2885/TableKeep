import { ChevronLast, ChevronLeft, ChevronRight, Dices, Info, Minus, Plus, X } from 'lucide-react'
import type { VtmCharacterSheet } from './vtmTypes'
import { initiativePreset, soakPreset } from './vtmRoll'
import type { RollEntry, RollPreset, VtmRoller } from './useVtmRoller'

const PRESET_HELP: Record<RollPreset, string> = {
  initiative: 'Initiative — Wits + Alertness.',
  soak: 'Soak — resisting damage you take: Stamina + Fortitude, or Stamina alone with no Fortitude.',
  damage: 'Damage — damage you deal. The pool is weapon-defined, so set the dice count by hand.',
}

function dieClass(value: number): string {
  if (value === 10) return 'vtm-die ten'
  if (value === 1) return 'vtm-die one'
  return 'vtm-die'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function DiceTray({ dice }: { dice: number[] }) {
  return (
    <div className="vtm-dice-tray">
      {dice.map((value, index) => (
        <span key={index} className={dieClass(value)}>{value}</span>
      ))}
    </div>
  )
}

function RollLogModal({ history, onClose }: { history: RollEntry[]; onClose: () => void }) {
  return (
    <div className="vtm-roll-log-overlay" role="presentation" onClick={onClose}>
      <div
        className="vtm-roll-log-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Roll log"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="vtm-roll-log-head">
          <h3>Roll Log</h3>
          <button type="button" className="vtm-roll-log-close" onClick={onClose} aria-label="Close roll log">
            <X size={16} />
          </button>
        </div>
        <p className="vtm-roll-log-note">Every roll you&rsquo;ve made this session, with exact timestamps.</p>
        <div className="vtm-roll-log-table">
          {history.length === 0 ? (
            <div className="vtm-log-row empty">No rolls yet this session.</div>
          ) : (
            history
              .slice()
              .reverse()
              .map((entry) => (
                <div key={entry.id} className="vtm-log-row">
                  <span className="vtm-log-time">{formatTime(entry.ts)}</span>
                  <span className="vtm-log-label">
                    <b>{entry.label}</b>
                    <span className="vtm-log-meta">{entry.count} dice</span>
                  </span>
                  <span className="vtm-log-dice">
                    {entry.dice.map((value, index) => (
                      <span key={index} className={dieClass(value)}>{value}</span>
                    ))}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  )
}

export function VtmRollBar({ roller, sheet }: { roller: VtmRoller; sheet: VtmCharacterSheet }) {
  if (!roller.rollMode) {
    return (
      <div className="vtm-roll-launch">
        <span className="vtm-roll-launch-hint">Dice Roller</span>
        <button type="button" className="vtm-roll-toggle" aria-expanded={false} onClick={roller.openRoller}>
          <Dices size={15} /> Roll
        </button>
        <span className="vtm-roll-launch-sub">Build a pool from your traits</span>
      </div>
    )
  }

  const onPreset = (preset: RollPreset) => {
    if (preset === 'initiative') roller.applyPreset('initiative', initiativePreset(sheet))
    else if (preset === 'soak') roller.applyPreset('soak', soakPreset(sheet))
    else roller.applyPreset('damage')
  }

  const { stagedAttr, stagedSecond, barMode, activePreset, current } = roller
  const resultMeta = current
    ? `${current.count} dice · ${roller.isLatest ? 'latest' : `${roller.viewIndex + 1} of ${roller.history.length}`}`
    : 'staged pool ready'

  return (
    <div className={`vtm-roll-bar mode-${barMode}`}>
      <div className="vtm-roll-bar-line">
        <span className="vtm-roll-bar-tag"><span className="vtm-roll-live" /> Roll mode</span>
        <span className="vtm-roll-bar-sep" />
        {(['initiative', 'soak', 'damage'] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            className={`vtm-preset${activePreset === preset ? ' active' : ''}`}
            onClick={() => onPreset(preset)}
          >
            {preset.charAt(0).toUpperCase() + preset.slice(1)}
          </button>
        ))}
        <button type="button" className="vtm-roll-bar-close" onClick={roller.closeRoller} aria-label="Close dice roller">
          <X size={16} />
        </button>
      </div>

      {barMode !== 'single' ? (
        <div className="vtm-roll-bar-line vtm-roll-pool">
          {barMode === 'damage' ? (
            <span className="vtm-damage-count">
              <label>Damage dealt · dice</label>
              <span className="vtm-stepper">
                <button type="button" onClick={() => roller.adjustDamageDice(-1)} aria-label="Fewer damage dice">
                  <Minus size={14} />
                </button>
                <span className="vtm-stepper-val">{roller.damageDice}</span>
                <button type="button" onClick={() => roller.adjustDamageDice(1)} aria-label="More damage dice">
                  <Plus size={14} />
                </button>
              </span>
            </span>
          ) : (
            <>
              <span className={`vtm-pool-slot${stagedAttr ? ' filled' : ' empty'}`}>
                <span className="vtm-slot-kind">Attr</span>
                <span className="vtm-slot-text">{stagedAttr ? stagedAttr.name : 'Stage an Attribute'}</span>
                {stagedAttr ? <span className="vtm-slot-rating">{stagedAttr.rating}</span> : null}
                {stagedAttr ? (
                  <button type="button" className="vtm-slot-x" onClick={() => roller.clearSlot(1)} aria-label="Clear attribute">
                    <X size={13} />
                  </button>
                ) : null}
              </span>
              <span className="vtm-pool-plus">+</span>
              <span className={`vtm-pool-slot${stagedSecond ? ' filled' : ' empty'}`}>
                <span className="vtm-slot-kind">{stagedSecond ? stagedSecond.kind : 'Ability / Discipline'}</span>
                <span className="vtm-slot-text">{stagedSecond ? stagedSecond.name : 'optional'}</span>
                {stagedSecond ? <span className="vtm-slot-rating">{stagedSecond.rating}</span> : null}
                {stagedSecond ? (
                  <button type="button" className="vtm-slot-x" onClick={() => roller.clearSlot(2)} aria-label="Clear second slot">
                    <X size={13} />
                  </button>
                ) : null}
              </span>
            </>
          )}
          <span className="vtm-pool-count">Pool <b>{roller.poolCount}</b> dice</span>
          <button type="button" className="vtm-roll-go" onClick={roller.rollPool} disabled={roller.poolCount <= 0}>
            Roll
          </button>
          <button type="button" className="vtm-roll-clear" onClick={roller.clearStage}>Clear</button>
        </div>
      ) : null}

      {activePreset ? <p className="vtm-roll-bar-help">{PRESET_HELP[activePreset]}</p> : null}
      {barMode === 'single' ? (
        <p className="vtm-roll-bar-help">Single-trait roll. Tap any Attribute, Ability, Discipline, or a preset to build a pool again.</p>
      ) : null}

      <div className="vtm-roll-result">
        <div className="vtm-roll-result-row">
          <div className="vtm-result-nav">
            <button type="button" className="vtm-nav-btn" onClick={roller.navPrev} disabled={!roller.canPrev} aria-label="Older roll" title="Older roll">
              <ChevronLeft size={17} />
            </button>
            <button type="button" className="vtm-nav-btn" onClick={roller.navNext} disabled={!roller.canNext} aria-label="Newer roll" title="Newer roll">
              <ChevronRight size={17} />
            </button>
            <button type="button" className="vtm-nav-btn" onClick={roller.navLatest} disabled={!roller.canNext} aria-label="Most recent roll" title="Most recent">
              <ChevronLast size={17} />
            </button>
          </div>
          <span className="vtm-roll-result-label">
            <b>{current ? current.label : 'No rolls yet'}</b>
            <span className="vtm-result-meta">{resultMeta}</span>
          </span>
          {current ? <DiceTray dice={current.dice} /> : <span className="vtm-roll-empty">Roll to see dice here</span>}
          <button type="button" className="vtm-result-info" onClick={roller.openLog} aria-label="Open full roll log" title="Full roll log + timestamps">
            <Info size={16} />
          </button>
        </div>
      </div>

      {roller.logOpen ? <RollLogModal history={roller.history} onClose={roller.closeLog} /> : null}
    </div>
  )
}

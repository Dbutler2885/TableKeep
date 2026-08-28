import { X } from 'lucide-react'
import type { CharacterSpell } from '../../../types/app'
import { DIVINE_SPELL_CATALOG } from '../spellCatalog'

type Props = {
  open: boolean
  className: string
  levels: number[]
  tabLevel: number
  expandedId: string | null
  draftIds: string[]
  slotsPerDay: number[]
  countsByLevel: Record<number, number>
  countsBySpellId: Record<string, number>
  draftSpells: CharacterSpell[]
  onTabChange: (level: number) => void
  onExpandedChange: (id: string | null) => void
  onPrepare: (id: string) => void
  onRemove: (id: string) => void
  onCommit: () => void
  onClear: () => void
  onClose: () => void
}

export function DivinePrepareModal(props: Props) {
  if (!props.open || props.className !== 'Cleric') return null
  const visibleSpells = DIVINE_SPELL_CATALOG.filter((spell) => spell.level === props.tabLevel)
  return (
    <div className="store-modal-overlay spellbook-add-overlay" role="dialog" aria-modal="true">
      <div className="store-modal character-spell-add-modal">
        <div className="store-modal-head"><div><h3>Pray to Prepare</h3><p>Select divine spells to prepare for the day.</p></div><button type="button" className="icon-btn" onClick={props.onClose} aria-label="Close prepare spells"><X size={14} /></button></div>
        <div className="store-modal-body">
          <div className="character-spell-add-main">
            <div className="store-category-tabs">{props.levels.map((level) => <button key={`divine-level-tab-${level}`} type="button" className={props.tabLevel === level ? 'store-category-btn active' : 'store-category-btn'} onClick={() => props.onTabChange(level)}>Level {level}</button>)}</div>
            <div className="store-grid-wrap"><div className="store-item-grid">
              {visibleSpells.map((spell) => {
                const expanded = props.expandedId === spell.id
                const preparedCount = props.countsBySpellId[spell.id] ?? 0
                const slotsAtLevel = props.slotsPerDay[Math.max(0, spell.level - 1)] ?? 0
                const usedAtLevel = props.countsByLevel[spell.level] ?? 0
                return (
                  <article key={spell.id} className={expanded ? 'store-item-card spell-card-expanded' : 'store-item-card'} onClick={() => props.onExpandedChange(expanded ? null : spell.id)}>
                    <header><h4>{spell.name}</h4><span>Level {spell.level}</span></header>
                    {spell.rangeText || spell.durationText ? <p className="spell-card-meta">{spell.rangeText ? `Range: ${spell.rangeText}` : null}{spell.rangeText && spell.durationText ? ' | ' : null}{spell.durationText ? `Duration: ${spell.durationText}` : null}</p> : null}
                    <p className={expanded ? 'spell-card-description expanded' : 'spell-card-description'}>{spell.description}</p>
                    <div className="section-head-actions"><button type="button" className="store-buy-btn" onClick={(event) => { event.stopPropagation(); props.onPrepare(spell.id) }} disabled={usedAtLevel >= slotsAtLevel}>Prepare</button>{preparedCount > 0 ? <button type="button" className="monster-example-btn" onClick={(event) => { event.stopPropagation(); props.onRemove(spell.id) }}>Remove 1</button> : null}</div>
                    <p className="store-item-note">Prepared: {preparedCount} | Slots L{spell.level}: {usedAtLevel}/{slotsAtLevel}</p>
                  </article>
                )
              })}
              {visibleSpells.length === 0 ? <p className="store-tally-empty">No cleric spells loaded for this level yet.</p> : null}
            </div></div>
          </div>
          <aside className="store-tally store-cart">
            <div className="store-tally-head"><h4>Prepared Spells</h4><span>{props.draftIds.length} prepared</span></div>
            {Object.keys(props.countsBySpellId).length === 0 ? <p className="store-tally-empty">No spells prepared yet.</p> : <div className="store-tally-list">{Object.entries(props.countsBySpellId).map(([spellId, count]) => ({ spell: props.draftSpells.find((entry) => entry.id === spellId) ?? null, count })).filter((row): row is { spell: CharacterSpell; count: number } => !!row.spell).sort((left, right) => left.spell.level - right.spell.level || left.spell.name.localeCompare(right.spell.name)).map((row) => <div key={`prepared-${row.spell.id}`} className="store-tally-row"><span>{row.spell.name}</span><strong>Lvl {row.spell.level} x{row.count}</strong><button type="button" className="store-remove-btn" onClick={() => props.onRemove(row.spell.id)}>Remove 1</button></div>)}</div>}
            <div className="store-cart-actions"><button type="button" className="store-buy-btn" onClick={props.onCommit}>Prepare</button><button type="button" className="store-buy-btn" onClick={props.onClear} disabled={props.draftIds.length === 0}>Clear All Prepared</button></div>
          </aside>
        </div>
      </div>
    </div>
  )
}

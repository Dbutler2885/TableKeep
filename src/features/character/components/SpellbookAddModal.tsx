import { X } from 'lucide-react'
import type { CharacterSpell } from '../../../types/app'
import { ARCANE_SPELL_CATALOG } from '../spellCatalog'

type Props = {
  open: boolean
  className: string
  accessibleLevels: number[]
  tabLevel: number
  pendingIds: string[]
  expandedId: string | null
  selectedIds: string[]
  pendingSpells: CharacterSpell[]
  onTabChange: (level: number) => void
  onExpandedChange: (id: string | null) => void
  onQueue: (id: string) => void
  onRemove: (id: string) => void
  onCommit: () => void
  onClose: () => void
}

export function SpellbookAddModal(props: Props) {
  if (!props.open || (props.className !== 'Magic-User' && props.className !== 'Elf')) return null
  return (
    <div className="store-modal-overlay spellbook-add-overlay" role="dialog" aria-modal="true">
      <div className="store-modal character-spell-add-modal">
        <div className="store-modal-head">
          <div><h3>Add Spells</h3><p>Select spells to write into the spell book.</p></div>
          <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Close add spells"><X size={14} /></button>
        </div>
        <div className="store-modal-body">
          <div className="character-spell-add-main">
            <div className="store-category-tabs">{props.accessibleLevels.map((level) => <button key={`spell-level-tab-${level}`} type="button" className={props.tabLevel === level ? 'store-category-btn active' : 'store-category-btn'} onClick={() => props.onTabChange(level)}>Level {level}</button>)}</div>
            <div className="store-grid-wrap"><div className="store-item-grid">
              {ARCANE_SPELL_CATALOG.filter((spell) => spell.level === props.tabLevel).map((spell) => {
                const alreadyInBook = props.selectedIds.includes(spell.id)
                const pending = props.pendingIds.includes(spell.id)
                const expanded = props.expandedId === spell.id
                return (
                  <article key={spell.id} className={expanded ? 'store-item-card spell-card-expanded' : 'store-item-card'} onClick={() => props.onExpandedChange(expanded ? null : spell.id)}>
                    <header><h4>{spell.name}</h4><span>Level {spell.level}</span></header>
                    {spell.rangeText || spell.durationText ? <p className="spell-card-meta">{spell.rangeText ? `Range: ${spell.rangeText}` : null}{spell.rangeText && spell.durationText ? ' | ' : null}{spell.durationText ? `Duration: ${spell.durationText}` : null}</p> : null}
                    <p className={expanded ? 'spell-card-description expanded' : 'spell-card-description'}>{spell.description}</p>
                    <button type="button" className="store-buy-btn" onClick={(event) => { event.stopPropagation(); if (pending) props.onRemove(spell.id); else props.onQueue(spell.id) }} disabled={alreadyInBook}>{alreadyInBook ? 'In Spell Book' : pending ? 'Remove' : 'Add Spell'}</button>
                  </article>
                )
              })}
            </div></div>
          </div>
          <aside className="store-tally store-cart">
            <div className="store-tally-head"><h4>Selected Spells</h4><span>{props.pendingIds.length} selected</span></div>
            {props.pendingSpells.length === 0 ? <p className="store-tally-empty">No spells selected yet.</p> : <div className="store-tally-list">{props.pendingSpells.map((spell) => <div key={`pending-${spell.id}`} className="store-tally-row"><span>{spell.name}</span><strong>Lvl {spell.level}</strong><button type="button" className="store-remove-btn" onClick={() => props.onRemove(spell.id)}>Remove</button></div>)}</div>}
            <div className="store-cart-actions"><button type="button" className="store-buy-btn" onClick={props.onCommit}>Add Spells</button></div>
          </aside>
        </div>
      </div>
    </div>
  )
}

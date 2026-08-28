import type { useSpellbookDomain } from '../hooks/useSpellbookDomain'
import { DivinePrepareModal } from './DivinePrepareModal'
import { MemorizedSpellDetailModal } from './MemorizedSpellDetailModal'
import { SpellbookAddModal } from './SpellbookAddModal'
import { SpellDescriptionBody } from './SpellDescriptionBody'

type Props = {
  domain: ReturnType<typeof useSpellbookDomain>
  className: string
}

export function SpellbookModals({ domain, className }: Props) {
  return (
    <>
      <SpellbookAddModal
        open={domain.spellBookAddModalOpen}
        className={className}
        accessibleLevels={domain.accessibleSpellLevels}
        tabLevel={domain.spellBookAddTabLevel}
        pendingIds={domain.spellBookPendingAddIds}
        expandedId={domain.spellBookExpandedSpellId}
        selectedIds={domain.selectedSpellBookSpellIds}
        pendingSpells={domain.pendingSpellObjects}
        onTabChange={domain.setSpellBookAddTabLevel}
        onExpandedChange={domain.setSpellBookExpandedSpellId}
        onQueue={domain.queueSpellForBook}
        onRemove={domain.removePendingSpell}
        onCommit={domain.commitPendingSpellsToBook}
        onClose={() => {
          domain.setSpellBookAddModalOpen(false)
          domain.setSpellBookPendingAddIds([])
          domain.setSpellBookExpandedSpellId(null)
        }}
      />
      <DivinePrepareModal
        open={domain.divinePrepareModalOpen}
        className={className}
        levels={domain.preparedSpellLevels}
        tabLevel={domain.divinePrepareTabLevel}
        expandedId={domain.divinePrepareExpandedSpellId}
        draftIds={domain.divinePreparedDraftIds}
        slotsPerDay={domain.preparedSlotsPerDay}
        countsByLevel={domain.divineDraftCountsByLevel}
        countsBySpellId={domain.divineDraftCountsBySpellId}
        draftSpells={domain.divinePreparedDraftSpells}
        onTabChange={domain.setDivinePrepareTabLevel}
        onExpandedChange={domain.setDivinePrepareExpandedSpellId}
        onPrepare={domain.prepareDivineSpell}
        onRemove={domain.removePreparedDivineSpell}
        onCommit={domain.commitPreparedDivineSpells}
        onClear={domain.clearPreparedDivineSpells}
        onClose={() => {
          domain.setDivinePrepareModalOpen(false)
          domain.setDivinePrepareExpandedSpellId(null)
        }}
      />
      <MemorizedSpellDetailModal
        spell={domain.memorizedSpellDetail}
        description={domain.memorizedSpellDetail ? <SpellDescriptionBody spell={domain.memorizedSpellDetail} /> : null}
        onClose={() => domain.setMemorizedSpellDetailId(null)}
      />
    </>
  )
}

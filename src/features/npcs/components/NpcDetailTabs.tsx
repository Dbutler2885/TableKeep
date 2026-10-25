import { Fragment, useState, type ReactNode } from 'react'
import type { NpcRecord } from '../../../types/app'

type NpcDetailTab = 'story' | 'sheet'

const NPC_DETAIL_TABS: readonly (readonly [NpcDetailTab, string])[] = [['story', 'Story'], ['sheet', 'Character sheet']]

type NpcDetailTabsProps = {
  npc: NpcRecord
  /** The NPC's story: its detail editor. */
  story: ReactNode
  /** The NPC's character sheet; absent where the viewer gets none, who then sees only the story. */
  sheetTab?: (npc: NpcRecord) => ReactNode
}

/**
 * The NPC's detail pane: its story alone, or, where there is a character
 * sheet to show, a Story and Character sheet strip above whichever is open.
 * The open tab stays as the GM moves from one NPC to the next.
 */
export function NpcDetailTabs({ npc, story, sheetTab }: NpcDetailTabsProps) {
  const [tab, setTab] = useState<NpcDetailTab>('story')
  if (!sheetTab) return story
  return (
    <div className="npc-detail-tabs">
      <div className="npc-detail-tab-strip" role="tablist" aria-label="NPC views">
        {NPC_DETAIL_TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" className="npc-detail-tab" aria-selected={id === tab} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="npc-detail-tab-panel" aria-label={tab === 'sheet' ? 'Character sheet' : 'Story'}>
        {/* Each NPC's sheet starts afresh, so one NPC's sheet never shows under another's name. */}
        {tab === 'sheet' ? <Fragment key={npc.id}>{sheetTab(npc)}</Fragment> : story}
      </div>
    </div>
  )
}

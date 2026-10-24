// Owns no effect of its own: it wraps useResponsiveCharacterLayout, whose media-query effect is independent of seeding.
// It receives grantMode rather than owning it, because grant tools set the layout's pane and page when they open.

import type { Role } from '../../../types/app'
import { useResponsiveCharacterLayout } from './useResponsiveCharacterLayout'

type Params = {
  grantMode: boolean
  role: Role | null
  selectedCharacterId: string
  embeddedMode: boolean
}

export function useCharacterTabLayout({ grantMode, role, selectedCharacterId, embeddedMode }: Params) {
  const effectiveGrantMode = grantMode && role === 'gm'
  // The grant builder occupies the detail pane just like a sheet does: both
  // count as "open" when the layout narrows and has to choose which single
  // pane to keep.
  const layout = useResponsiveCharacterLayout({ hasOpenDetail: !!selectedCharacterId || effectiveGrantMode })
  return {
    ...layout,
    effectiveGrantMode,
    effectiveShowListPane: embeddedMode ? false : layout.showListPane,
    effectiveShowDetailPane: embeddedMode ? true : layout.showDetailPane,
  }
}

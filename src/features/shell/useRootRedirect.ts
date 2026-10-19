import { useEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { groupHomePath, groupPickerPath } from '../navigation/tabs'
import type { GroupRecord } from '../../types/app'

// Once groups have loaded, the bare root sends a member of exactly one group to
// that group's home and everyone else to the picker. App routes `/` to the
// picker before the shell mounts, so this only acts if the shell is ever
// rendered at the root.
export function useRootRedirect(groups: GroupRecord[], loading: boolean, pathname: string, navigate: NavigateFunction) {
  useEffect(() => {
    if (loading) return
    if (pathname === '/') {
      const target = groups.length === 1 ? groupHomePath(groups[0].id) : groupPickerPath
      void navigate(target, { replace: true })
    }
  }, [groups, loading, pathname, navigate])
}

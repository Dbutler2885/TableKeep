import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { tabFromPathname } from '../navigation/tabs'

// What the shell reads off the URL: the tab in view and the selected group and
// campaign ids.
export function useShellRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const activeTab = useMemo(() => tabFromPathname(location.pathname), [location.pathname])
  return {
    pathname: location.pathname,
    navigate,
    activeTab,
    selectedGroupId: params.groupId ?? null,
    selectedCampaignId: params.campaignId ?? null,
  }
}

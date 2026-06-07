import type { AppTab } from '../../types/app'
import { tabs } from '../navigation/tabs'

export function PlaceholderTab({ tab }: { tab: AppTab }) {
  const label = tabs.find((item) => item.id === tab)?.label ?? tab

  return (
    <div className="stack-tight">
      <h2>{label}</h2>
      <p>{label} flow shell is in place. Detailed component implementation comes next.</p>
    </div>
  )
}

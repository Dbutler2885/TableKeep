import type { GameSystem } from '../navigation/tabs'
import { ruleSets } from '../ruleSets/registry'
import type { AppTab, Role } from '../../types/app'

// Which subscriptions and overlays the shell keeps running for the tab in view.
// Each one stops while the page is hidden.

const CHARACTER_TABS: AppTab[] = ['character', 'maps', 'items']
const TRANSFER_TABS: AppTab[] = ['character', 'maps']

export const listensForCharacters = (gameSystem: GameSystem, documentVisible: boolean, activeTab: AppTab) =>
  gameSystem === 'ose' && documentVisible && CHARACTER_TABS.includes(activeTab)

// Whether the rule set has player requests for its GM to decide at all.
export const hasApprovals = (gameSystem: GameSystem) => ruleSets[gameSystem].approvals.length > 0

export const listensForApprovals = (gameSystem: GameSystem, documentVisible: boolean, role: Role | null, activeTab: AppTab) =>
  hasApprovals(gameSystem) && documentVisible && (role === 'gm' || activeTab === 'character')

export const showsTransferNotification = (gameSystem: GameSystem, documentVisible: boolean, activeTab: AppTab) =>
  ruleSets[gameSystem].transfers && documentVisible && TRANSFER_TABS.includes(activeTab)

export const showsCliffhangerModal = (documentVisible: boolean, activeTab: AppTab) =>
  documentVisible && activeTab !== 'notes'

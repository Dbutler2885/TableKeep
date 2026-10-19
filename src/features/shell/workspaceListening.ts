import type { GameSystem } from '../navigation/tabs'
import type { AppTab, Role } from '../../types/app'

// Which subscriptions and overlays the shell keeps running for the tab in view.
// Each one stops while the page is hidden.

const CHARACTER_TABS: AppTab[] = ['character', 'maps', 'items']
const TRANSFER_TABS: AppTab[] = ['character', 'maps']

export const listensForCharacters = (gameSystem: GameSystem, documentVisible: boolean, activeTab: AppTab) =>
  gameSystem === 'ose' && documentVisible && CHARACTER_TABS.includes(activeTab)

export const listensForApprovals = (documentVisible: boolean, role: Role | null, activeTab: AppTab) =>
  documentVisible && (role === 'gm' || activeTab === 'character')

export const showsTransferNotification = (documentVisible: boolean, activeTab: AppTab) =>
  documentVisible && TRANSFER_TABS.includes(activeTab)

export const showsCliffhangerModal = (documentVisible: boolean, activeTab: AppTab) =>
  documentVisible && activeTab !== 'notes'

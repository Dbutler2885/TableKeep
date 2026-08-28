import { describe, expect, it } from 'vitest'
import type { AddItemModalState } from '../hooks/useInventoryDomain'
import { applyPlayerAddTemplate, playerAddPreviewItem } from './playerAddGear'

const emptyModal = { kind: 'general', typeId: '', typeName: '', name: '', costGp: '', description: '', qty: '1' } as AddItemModalState

describe('player add gear', () => {
  it('applies catalog data without closing over component state', () => {
    expect(applyPlayerAddTemplate(emptyModal, 'weapon', 'sword')).toMatchObject({ kind: 'weapon', typeId: 'sword', damageDiceCount: '1', damageDiceSides: '8' })
  })

  it('previews catalog gear and rejects custom entries', () => {
    expect(playerAddPreviewItem({ ...emptyModal, typeId: 'custom' })).toBeNull()
    expect(playerAddPreviewItem(applyPlayerAddTemplate(emptyModal, 'ammunition', 'ammo-arrows'))).toMatchObject({ kind: 'ammunition', qty: 20 })
  })
})

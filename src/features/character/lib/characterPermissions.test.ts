import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { deriveCharacterPermissions } from './characterPermissions'

const character = { id: 'c', ownerUserId: 'owner', creationStatus: 'draft', creationMode: 'guided', className: 'Fighter' } as CharacterRecord

describe('character permissions', () => {
  it('preserves GM, owner, and grant-mode boundaries', () => {
    expect(deriveCharacterPermissions({ role: 'gm', currentUserId: 'gm', character, grantMode: false })).toMatchObject({ canEditSelected: true, canGrant: true, canAssignCharacter: true })
    expect(deriveCharacterPermissions({ role: 'gm', currentUserId: 'gm', character, grantMode: true }).canAssignCharacter).toBe(false)
    expect(deriveCharacterPermissions({ role: 'player', currentUserId: 'owner', character, grantMode: false })).toMatchObject({ canEditSelected: true, canSetCurrentCharacter: true, requiresApprovalNow: true })
    expect(deriveCharacterPermissions({ role: 'player', currentUserId: 'other', character, grantMode: false }).canEditSelected).toBe(false)
  })
})

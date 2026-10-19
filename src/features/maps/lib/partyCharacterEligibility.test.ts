import { describe, expect, it } from 'vitest'
import {
  isPlayerOwnedLivingPartyCharacter,
  type PartyCharacterEligibilityFields,
} from './partyCharacterEligibility'

const living: PartyCharacterEligibilityFields = {
  ownerUserId: 'player',
  creationStatus: 'active',
  hpCurrent: 4,
}

const eligible = (fields: PartyCharacterEligibilityFields, gmUserId: string | null | undefined = 'gm') =>
  isPlayerOwnedLivingPartyCharacter({ ...living, ...fields }, gmUserId)

describe('party character eligibility', () => {
  it('admits a living, active, player-owned OSE character', () => {
    expect(eligible({})).toBe(true)
  })

  it.each([null, undefined, ''])('admits nobody when the GM is %j', (gmUserId) => {
    expect(isPlayerOwnedLivingPartyCharacter(living, gmUserId)).toBe(false)
  })

  it.each([null, undefined, ''])('refuses an owner of %j', (ownerUserId) => {
    expect(eligible({ ownerUserId })).toBe(false)
  })

  it('refuses the GM\'s own character', () => {
    expect(eligible({ ownerUserId: 'gm' })).toBe(false)
  })

  it.each([
    [null, true],
    [undefined, true],
    ['active', true],
    ['draft', false],
    ['established_draft', false],
  ] as const)('reads creation status %j as eligible %s', (creationStatus, expected) => {
    expect(eligible({ creationStatus })).toBe(expected)
  })

  it.each([
    [{ hidden: true }, false],
    [{ hidden: false }, true],
    [{ hidden: null }, true],
    [{ deleted: true }, false],
    [{ deleted: false }, true],
    [{ deleted: null }, true],
  ])('reads %j as eligible %s', (fields, expected) => {
    expect(eligible(fields)).toBe(expected)
  })

  it.each([
    [{ hpCurrent: 1 }, true],
    [{ hpCurrent: 0 }, false],
    [{ hpCurrent: -1 }, false],
    [{ hpCurrent: null }, false],
    [{ hpCurrent: undefined }, false],
    [{ system: 'ose', hpCurrent: 2 }, true],
    [{ system: null, hpCurrent: 2 }, true],
    [{ system: 'ose', hpCurrent: 0, incapacitated: false }, false],
  ] as const)('reads OSE life from %j as %s', (fields, expected) => {
    expect(eligible(fields)).toBe(expected)
  })

  it.each([
    [{ incapacitated: true }, false],
    [{ incapacitated: false }, true],
    [{ incapacitated: null }, true],
    [{ incapacitated: undefined, hpCurrent: 0 }, true],
  ] as const)('reads VtM life from %j as %s', (fields, expected) => {
    expect(eligible({ system: 'vtm', ...fields })).toBe(expected)
  })

  it('checks ownership before life for VtM', () => {
    expect(eligible({ system: 'vtm', ownerUserId: 'gm', incapacitated: false })).toBe(false)
    expect(eligible({ system: 'vtm', creationStatus: 'draft', incapacitated: false })).toBe(false)
    expect(eligible({ system: 'vtm', hidden: true, incapacitated: false })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  isPartyCharacter,
  isPlayerOwnedLivingPartyCharacter,
  type PartyCharacterEligibilityFields,
} from './partyCharacterEligibility'

const living: PartyCharacterEligibilityFields = {
  ownerUserId: 'player',
  creationStatus: 'active',
  inPlay: true,
}

const eligible = (fields: Partial<PartyCharacterEligibilityFields>, gmUserId: string | null | undefined = 'gm') =>
  isPartyCharacter({ ...living, ...fields }, gmUserId)

describe('party character eligibility', () => {
  it('admits an active, player-owned character in play', () => {
    expect(eligible({})).toBe(true)
  })

  it.each([null, undefined, ''])('admits nobody when the GM is %j', (gmUserId) => {
    expect(isPartyCharacter(living, gmUserId)).toBe(false)
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

  it('refuses a character its rule set says is out of play', () => {
    expect(eligible({ inPlay: false })).toBe(false)
  })
})

// A record the map has not summarized yet, such as the embedded OSE sheet's.
const record = (fields: Record<string, unknown>) => ({
  id: 'pc',
  ownerUserId: 'player',
  creationStatus: 'active',
  ...fields,
})

describe('party character eligibility of an unsummarized record', () => {
  it.each([
    [{ hpCurrent: 1 }, true],
    [{ hpCurrent: 0 }, false],
    [{ hpCurrent: -1 }, false],
    [{ hpCurrent: null }, false],
    [{ hpCurrent: undefined }, false],
    [{ system: 'ose', hpCurrent: 2 }, true],
    [{ system: null, hpCurrent: 2 }, true],
    [{ system: 'ose', hpCurrent: 0, vtm: { health: {} } }, false],
  ] as const)('reads OSE life from %j as %s', (fields, expected) => {
    expect(isPlayerOwnedLivingPartyCharacter(record(fields), 'gm')).toBe(expected)
  })

  it.each([
    [{ health: { Incapacitated: true } }, false],
    [{ health: { Incapacitated: false } }, true],
    [{ health: {} }, true],
    [undefined, true],
  ] as const)('reads VtM life from %j as %s', (vtm, expected) => {
    expect(isPlayerOwnedLivingPartyCharacter(record({ system: 'vtm', hpCurrent: 0, vtm }), 'gm')).toBe(expected)
  })

  it('checks ownership, creation and visibility before life for VtM', () => {
    const vampire = (fields: Record<string, unknown>) =>
      isPlayerOwnedLivingPartyCharacter(record({ system: 'vtm', ...fields }), 'gm')
    expect(vampire({})).toBe(true)
    expect(vampire({ ownerUserId: 'gm' })).toBe(false)
    expect(vampire({ creationStatus: 'draft' })).toBe(false)
    expect(vampire({ hidden: true })).toBe(false)
  })
})

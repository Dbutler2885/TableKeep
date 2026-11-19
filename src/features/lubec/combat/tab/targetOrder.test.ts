import { describe, expect, it } from 'vitest'
import { lubecCombatantKey, type LubecCombatant } from '../../fight/lubecFightRequest'
import { lubecTargetTiles } from '../../fight/LubecFightWindowContent'
import type { Combatant, CombatState } from '../engine/types'
import { orderedTargets } from './targetOrder'

const npc = (id: string, ally = false) => ({ key: `npc:${id}`, name: id, kind: 'npc', ...(ally ? { ally: true } : {}) }) as unknown as Combatant
const kid = (id: string) => ({ key: `character:${id}`, name: id, kind: 'character' }) as unknown as Combatant
const face = (combatant: Combatant): LubecCombatant => (combatant.kind === 'npc'
  ? { kind: 'npc', npc: { id: combatant.name, name: combatant.name } }
  : { kind: 'character', character: { id: combatant.name, name: combatant.name } }) as unknown as LubecCombatant

const roy = npc('roy'), mike = npc('mike'), pike = npc('pike', true), tommy = kid('tommy'), wayne = kid('wayne')
const state = { combatants: [roy, mike, pike, tommy, wayne] } as unknown as CombatState
const keys = (targets: readonly LubecCombatant[]) => targets.map(lubecCombatantKey)

describe('the order of the target tiles', () => {
  it('puts the other side before the attacker\'s own, each in the order it came', () => {
    const targets = [mike, pike, tommy, wayne].map(face)
    expect(keys(orderedTargets(state, roy, targets, () => false))).toEqual(['npc:pike', 'character:tommy', 'character:wayne', 'npc:mike'])
  })

  it('puts whoever declared at the attacker first', () => {
    const targets = [mike, pike, tommy, wayne].map(face)
    expect(keys(orderedTargets(state, roy, targets, (key) => key === 'character:wayne'))[0]).toBe('character:wayne')
  })

  it('treats an NPC fighting with the players as the players\' side', () => {
    expect(keys(orderedTargets(state, tommy, [pike, roy, mike].map(face), () => false))).toEqual(['npc:roy', 'npc:mike', 'npc:pike'])
  })
})

describe('the target tiles', () => {
  const many = Array.from({ length: 11 }, (_, index) => face(npc(`n${index}`)))

  it('gives every target a tile while they fit', () => {
    expect(lubecTargetTiles(many.slice(0, 8), null)).toEqual({ tiles: many.slice(0, 8), rest: [] })
  })

  it('keeps the last tile for the rest past eight', () => {
    const { tiles, rest } = lubecTargetTiles(many, null)
    expect(tiles).toHaveLength(7)
    expect(rest).toEqual(many.slice(7))
  })

  it('gives a target chosen from the rest a tile of its own', () => {
    const { tiles, rest } = lubecTargetTiles(many, 'npc:n10')
    expect(tiles).toHaveLength(7)
    expect(keys(tiles).at(-1)).toBe('npc:n10')
    expect(keys(rest)).toEqual(['npc:n6', 'npc:n7', 'npc:n8', 'npc:n9'])
  })
})
